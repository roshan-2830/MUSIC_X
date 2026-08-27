"""Trip options around a show — the app's side of the Tripsure integration.

The phone talks to these routes and never to Tripsure. Their guide requires the partner key
to stay server-side, and a normalised shape earns its keep besides: the screen depends on
`price_amount` and `deep_link`, not on whichever container name a supplier uses this quarter,
so a second supplier can be added without touching the UI.

Every response carries a `status`. "No hotels in this city" and "we could not ask" are
different claims, and a screen that cannot tell them apart will imply the first while meaning
the second.
"""
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.city import City
from app.models.event import Event
from app.models.venue import Venue
from app.schemas.travel import Flight, Stay, TravelOptions
from app.services import tripsure

router = APIRouter(prefix="/events", tags=["travel"])


def _first(d: dict, *keys, default=None):
    """The first key a supplier actually used.

    Their listing shape is not pinned down until a live call succeeds, and guessing one name
    would mean returning nothing while the data sat under another. Reading several is honest
    about that uncertainty and costs nothing.
    """
    for k in keys:
        v = d.get(k)
        if v not in (None, "", []):
            return v
    return default


def _metres(la1: float, lo1: float, la2: float, lo2: float) -> float:
    """Great-circle metres — for ranking stays by how close they are to the venue."""
    import math
    r = math.radians
    h = (math.sin((r(la2) - r(la1)) / 2) ** 2
         + math.cos(r(la1)) * math.cos(r(la2)) * math.sin((r(lo2) - r(lo1)) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def _num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _to_stay(h: dict) -> Stay:
    """One hotel, from the shape a live call actually returned.

    Confirmed 2026-08-27 against Mumbai (1,183 results): each entry is
    { hotelKey, hotelInfo{...}, priceSummary[{...}] }. The first version guessed at
    `name` and `price.amount` and would have rendered every one of those 1,183 hotels as
    "Unnamed property" with no price — the shape was never in the collection, and guessing
    is what the hedge was hiding.
    """
    info = h.get("hotelInfo") or {}
    prices = h.get("priceSummary") or []
    price = prices[0] if prices else {}
    board = price.get("boardBasis") or {}
    return Stay(
        name=str(info.get("name") or "Unnamed property"),
        image_url=info.get("image"),
        # `price` is the stay total; pricePerNightPerRoom is the nightly rate. The nightly
        # one is what a card should show, because it is comparable between two hotels.
        price_amount=_num(price.get("pricePerNightPerRoom") or price.get("price")),
        price_currency="INR",
        # Their `category` is a word, not a number — "Villa", "Hotel" — so it is not a star
        # rating and must not be shown as one.
        rating=None,
        address=info.get("address") or info.get("city"),
        lat=_num(info.get("latitude")),
        lng=_num(info.get("longitude")),
        distance=info.get("distanceFromOrigin"),
        refundability=price.get("refundability"),
        board_basis=board.get("description") if isinstance(board, dict) else None,
        supplier=price.get("partnerName"),
    )


def _to_flight(f: dict) -> Flight:
    """One offer, from the shape a live search actually returned.

    Confirmed 2026-08-27 against DEL-BOM (199 offers): each offer is
    { provider, fareSourceCode, validatingCarrier, segments[], PriceSummaries[] }. The first
    version guessed at `price.amount` and `departureTime`; the real names are
    PriceSummaries[0].totalFare and segments[].departureDateTime, so every offer would have
    rendered blank.

    `stops` is counted from the segments rather than read from a field: segments[].stops is
    the stops WITHIN one leg, so a two-segment itinerary with stops=0 on each is still a
    one-stop journey. Reading that field would have called every connection direct.
    """
    segs = f.get("segments") or []
    first, last = (segs[0] if segs else {}), (segs[-1] if segs else {})
    prices = f.get("PriceSummaries") or []
    price = prices[0] if prices else {}
    total_mins = sum(int(sg.get("durationInMins") or 0) for sg in segs) or None
    within = sum(int(sg.get("stops") or 0) for sg in segs)
    return Flight(
        airline=first.get("airlineName") or first.get("airlineCode"),
        flight_number=first.get("flightNumber"),
        origin=first.get("departureAirport"),
        destination=last.get("arrivalAirport"),
        departs_at=first.get("departureDateTime"),
        arrives_at=last.get("arrivalDateTime"),
        stops=max(0, len(segs) - 1) + within,
        duration_minutes=total_mins,
        price_amount=_num(price.get("totalFare")),
        price_currency="INR",
    )


def _event_place(db: Session, ev: Event) -> tuple:
    """(city name, country) for the show — what a hotel search needs to resolve."""
    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    city = db.get(City, venue.city_id) if venue and venue.city_id else None
    return (city.name if city else None), (city.country if city else None)


@router.get("/{event_id}/stays", response_model=TravelOptions)
def stays_for_event(
    event_id: UUID,
    nights: int = Query(1, ge=1, le=14),
    adults: int = Query(2, ge=1, le=8),
    db: Session = Depends(get_db),
):
    """Somewhere to sleep for the night of the show.

    Check-in is the day of the show and check-out the morning after, because that is what
    someone travelling to a gig actually needs and it removes two date pickers from the
    screen. `nights` covers a festival that runs on.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if not tripsure.configured():
        return TravelOptions(status="not_configured",
                             reason="No travel provider is connected yet.")
    if not ev.starts_at:
        return TravelOptions(status="unavailable",
                             reason="This show has no confirmed date, so we cannot search for a stay.")

    city_name, _country = _event_place(db, ev)
    if not city_name:
        return TravelOptions(status="no_location",
                             reason="We do not know which city this show is in.")

    check_in = ev.starts_at.date()
    check_out = check_in + timedelta(days=nights)
    # One trace id across both calls — their guide asks for one per journey so a support
    # ticket can follow the whole thing.
    trace = tripsure.new_trace_id()

    dates = {"check_in": check_in.isoformat(), "check_out": check_out.isoformat()}

    matches = tripsure.suggest_location(city_name, trace_id=trace)
    if matches is None:
        # Could not ask — never reported as "no hotels", which would be a claim about the
        # city rather than about us.
        return TravelOptions(status="unavailable",
                             reason="We could not reach our travel provider just now.", **dates)
    if not matches:
        return TravelOptions(status="no_location",
                             reason=f"Our travel provider does not recognise {city_name}.", **dates)

    # Verified against the VENUE's own coordinates, not just the city name. "Highland" the
    # city name matched Genting Highlands, Malaysia — 14,180 km from the California venue.
    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    place = tripsure.best_location(
        matches, venue.lat if venue else None, venue.lng if venue else None)
    if place is None:
        return TravelOptions(
            status="no_location",
            reason=f"We can't match {city_name} to a place our travel partner knows.",
            **dates)
    hand_over = tripsure.results_url(place, check_in.isoformat(), check_out.isoformat(),
                                     adults=adults)
    hotels = tripsure.search_hotels(place, check_in.isoformat(),
                                    check_out.isoformat(), adults=adults, trace_id=trace)
    if not hotels:
        # NO BUTTON when we found nothing, and this is a correction of the opposite choice.
        # The hand-over link needs no API call, so it was offered even when the listing
        # failed — on the reasoning that a booking page beats nothing. In practice the
        # listing fails precisely where Tripsure has no inventory, their consumer site runs
        # on the same backend, and the user who clicked it landed on "couldn't find a match".
        # A button that leads nowhere is worse than no button: it spends the user's trust to
        # tell them something we already knew.
        return TravelOptions(
            status="unavailable",
            # NOT "doesn't cover it" — I claimed that and it was wrong. Their own site
            # prefetches show 503s scattered across countries (Pattaya 200 / Bangkok 503,
            # Lucknow 200 / Indore 503), and a London search that returned hotels earlier in
            # the day returns none now on their own site with their own parameters. That is a
            # service having a bad time, not a map of where they operate — and the difference
            # matters, because one is temporary and the other would be a reason to find
            # another supplier.
            reason=f"No stays available near {city_name} right now — worth trying again "
                   f"later.",
            **dates)
    # NEAREST twenty, not the first twenty. The listing returns over a thousand in the
    # supplier's own order, so slicing it raw pinned hotels up to 16 km out and called them
    # "near the venue" — which is the one claim this tab makes. Sorted against the venue's
    # coordinates, so the map opens on the walkable ones.
    parsed = [_to_stay(h) for h in hotels if isinstance(h, dict)]
    if venue and venue.lat is not None and venue.lng is not None:
        def away(st):
            if st.lat is None or st.lng is None:
                return float("inf")     # unplaceable ones sink to the bottom
            return _metres(venue.lat, venue.lng, st.lat, st.lng)
        parsed.sort(key=away)
    return TravelOptions(
        booking_url=hand_over,
        status="ok" if hotels else "unavailable",
        reason=None if hotels else f"No stays available in {city_name} for those dates.",
        **dates,
        stays=parsed[:20],
    )


@router.get("/{event_id}/flights", response_model=TravelOptions)
def flights_for_event(
    event_id: UUID,
    origin: str = Query(..., min_length=2, description="City name or IATA code to fly from"),
    adults: int = Query(1, ge=1, le=8),
    db: Session = Depends(get_db),
):
    """Getting there — one-way offers into the show's city, arriving the day before.

    Arriving a day early is the default because a flight that lands after the doors open is
    not an option, and a search box cannot know how much slack someone wants.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if not tripsure.configured(flights=True):
        return TravelOptions(status="not_configured",
                             reason="Flight search is not connected yet.")
    if not ev.starts_at:
        return TravelOptions(status="unavailable",
                             reason="This show has no confirmed date, so we cannot search for flights.")

    city_name, _country = _event_place(db, ev)
    if not city_name:
        return TravelOptions(status="no_location",
                             reason="We do not know which city this show is in.")

    trace = tripsure.new_trace_id()

    def code_for(q: str) -> str | None:
        """A city name to the airport people actually fly into.

        The field is `airport_code`, confirmed against the live service. The first version
        read iataCode / code / iata — none of which exist — so every lookup failed and the
        tab said it could not find an airport for Delhi.

        Ranked by their own popularity_score, which matters wherever a city has several:
        "London" returns Heathrow among others, and the busiest is the one a traveller means.
        A city match is preferred first, because a query can also match an airport whose name
        merely contains the word.
        """
        if len(q) == 3 and q.isalpha():
            return q.upper()          # already a code
        hits = tripsure.suggest_airports(q, trace_id=trace) or []
        if not hits:
            return None
        ranked = sorted(hits, key=lambda h: -float(h.get("popularity_score") or 0))
        same_city = [h for h in ranked
                     if (h.get("city") or "").strip().lower() == q.strip().lower()]
        best = (same_city or ranked)[0]
        code = best.get("airport_code")
        return str(code).upper() if code else None

    from_code, to_code = code_for(origin), code_for(city_name)
    if not (from_code and to_code):
        missing = origin if not from_code else city_name
        return TravelOptions(status="unavailable",
                             reason=f"We could not find an airport for {missing}.")

    depart_on = (ev.starts_at.date() - timedelta(days=1)).isoformat()
    offers = tripsure.search_flights(from_code, to_code, depart_on,
                                     adults=adults, trace_id=trace)
    if offers is None:
        return TravelOptions(status="unavailable",
                             reason="We could not reach our travel provider just now.")
    # CHEAPEST FIRST. The search returns up to 199 offers in the supplier's own order, and
    # slicing that raw showed twenty near-identical Kuwait Airways fares while cheaper ones
    # sat further down the list. Price is the question a traveller is asking here.
    parsed = [_to_flight(f) for f in offers if isinstance(f, dict)]
    parsed.sort(key=lambda f: (f.price_amount is None, f.price_amount or 0,
                               f.duration_minutes or 0))
    return TravelOptions(
        status="ok" if offers else "unavailable",
        reason=None if offers else f"No flights found from {from_code} to {to_code} on {depart_on}.",
        flights=parsed[:20],
    )
