"""Trip options around a show — the app's side of the Tripsure integration.

The phone talks to these routes and never to Tripsure. Their guide requires the partner key
to stay server-side, and a normalised shape earns its keep besides: the screen depends on
`price_amount` and `deep_link`, not on whichever container name a supplier uses this quarter,
so a second supplier can be added without touching the UI.

Every response carries a `status`. "No hotels in this city" and "we could not ask" are
different claims, and a screen that cannot tell them apart will imply the first while meaning
the second.
"""
import re
import unicodedata
import uuid as _uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.city import City
from app.models.event import Event
from app.models.hotel_booking import HotelBooking
from app.models.profile import Profile
from app.models.venue import Venue
from app.schemas.travel import Flight, Stay, StayBase, TravelContext, TravelOptions
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
        # `category` is a word — "Villa", "Hotel" — and was the reason this said None. But
        # `starRating` is a separate field and is a real rating ("3"), so the card can show
        # one after all. Coerced through _num because it arrives as a string.
        rating=_num(info.get("starRating")),
        address=info.get("address") or info.get("city"),
        lat=_num(info.get("latitude")),
        lng=_num(info.get("longitude")),
        distance=info.get("distanceFromOrigin"),
        refundability=price.get("refundability"),
        board_basis=board.get("description") if isinstance(board, dict) else None,
        supplier=price.get("partnerName"),
        # Kept so the app can point at this exact property later. hotelKey is the id the
        # details call wants; a live call confirmed it equals priceSummary[].hotelId.
        hotel_id=str(h["hotelKey"]) if h.get("hotelKey") is not None else None,
        supplier_provider=price.get("provider"),
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

    `duration_minutes` is TIME IN THE AIR, not the journey, and the screen says so for any
    flight with a connection. There is nothing here to build a journey total from: no
    offer-level duration, stopDetails is null on every segment, and the timestamps carry no
    timezone. LHR-LIS-MAD sums to 4h05 in the air; subtracting the local clocks gives 6h40,
    but Madrid is an hour ahead of Lisbon so the truth is 5h40. Presenting either number as
    "the journey" would be inventing it.

    Currency is INR and cannot be otherwise. Their listing endpoint refuses anything else
    outright — "Only INR currency is supported" — and the flight search silently ignores the
    parameter: LHR-MAD returned byte-identical fares for INR, GBP and EUR. So the rupee prices
    on a London-Madrid flight are their account's, not a bug of ours, and relabelling them
    would turn a confusing display into a false one.
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


# Before this hour, a "start time" is not a start time. 45 of our 5,902 upcoming shows convert
# to the small hours — Copenhagen 02:00, London 01:00 — which is what Ticketmaster's date-only
# fallback produces once a timezone is applied: midnight UTC shifted sideways. Concerts do not
# start at 2am, so those are treated as unpublished rather than compared against.
#
# The threshold has to be this low, not higher. Midnight-UTC rows are OVERWHELMINGLY genuine US
# evening shows — New York 20:00, Chicago 19:00, 400-odd of them — so excluding every midnight
# UTC row would have thrown away real data to catch a handful of placeholders.
EARLIEST_PLAUSIBLE_HOUR = 10


def _show_local_start(ev: Event):
    """When the show starts, on the clock of the city it happens in. None if unknowable.

    starts_at is a true UTC instant and `timezone` is the venue's zone ("Europe/London"), so
    this conversion is exact — 17:00 UTC becomes 18:00 in London during BST.

    Local time is the whole point. A flight's arrival comes back as local airport time with no
    timezone attached, and the airport is in the same city as the venue, so comparing the two
    local clocks is correct without knowing the offset. Comparing a local arrival against a UTC
    show time would be wrong by that offset — hours, in either direction.
    """
    if ev.starts_at is None or not ev.timezone:
        return None
    try:
        local = ev.starts_at.astimezone(ZoneInfo(ev.timezone)).replace(tzinfo=None)
    except Exception:
        return None                      # unknown zone name; say nothing rather than guess
    if local.hour < EARLIEST_PLAUSIBLE_HOUR:
        return None
    return local


def _minutes_before(arrives_at, show_local) -> int | None:
    """Minutes from landing to the first note, or None if either end is unknown."""
    if not arrives_at or show_local is None:
        return None
    try:
        # No timezone in the supplier's string; it is local airport time, same city as the show.
        arrival = datetime.fromisoformat(str(arrives_at).replace("Z", ""))
        if arrival.tzinfo is not None:
            arrival = arrival.replace(tzinfo=None)
    except Exception:
        return None
    return int((show_local - arrival).total_seconds() // 60)


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
    found = tripsure.search_hotels(place, check_in.isoformat(),
                                   check_out.isoformat(), adults=adults, trace_id=trace)
    if found is None:
        # Could not ask. Said plainly, because until the listing returned its envelope this
        # was indistinguishable from an empty result and the screen reported a timeout of
        # ours as a fact about the city. Their preprod times out often enough that this is
        # the common case, not a corner.
        return TravelOptions(
            status="unavailable",
            reason="We couldn't reach our travel provider just now — worth trying again.",
            **dates)
    hotels = found.get("hotels") or []
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
        # Passed to the app so it can name a property when someone picks one. Sent back to us
        # unchanged; they are search handles and unusable without the server's key.
        doc_key=(found or {}).get("doc_key"),
        search_token=(found or {}).get("token"),
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

    # Does this flight actually get them there in time? The one thing an airline site and a
    # ticket site each cannot answer, because neither knows about the other half. Computed on
    # both local clocks — see _show_local_start.
    show_local = _show_local_start(ev)
    for f in parsed:
        f.minutes_before_show = _minutes_before(f.arrives_at, show_local)

    # CHEAPEST FIRST. The search returns up to 199 offers in the supplier's own order, and
    # slicing that raw showed twenty near-identical Kuwait Airways fares while cheaper ones
    # sat further down the list. Price is the question a traveller is asking here.
    #
    # But a flight that does not arrive in time is not an answer at any price, so those sink
    # below the ones that do rather than heading the list. They are still shown: a cheap fare
    # plus a night in a hotel is a real plan, and the row says plainly that it lands late.
    def in_time(f):
        return f.minutes_before_show is None or f.minutes_before_show >= 0
    parsed.sort(key=lambda f: (not in_time(f), f.price_amount is None,
                               f.price_amount or 0, f.duration_minutes or 0))
    return TravelOptions(
        status="ok" if offers else "unavailable",
        reason=None if offers else f"No flights found from {from_code} to {to_code} on {depart_on}.",
        flights=parsed[:20],
        show_local_start=show_local.isoformat() if show_local else None,
    )


# ---------------------------------------------------------------- where they're staying

# A brisk walking pace. Used only to turn metres into a sentence a person can act on —
# "15 min walk" answers "can I walk it after the encore" in a way "1.2 km" does not.
WALK_M_PER_MIN = 80
# Past this we give the distance and no walking time. A hotel 12.5 km out really is "157 min
# walk", and printing that is worse than printing nothing: nobody walks it, so the number
# reads as a broken calculation rather than as advice. The distance still shows.
WALK_MAX_M = 3000


def _fresh_context(db: Session, ev: Event, check_in, check_out, adults: int,
                   trace: str) -> tuple:
    """A new (doc_key, token) for this event's city, or (None, None).

    Needed because a search context expires. Someone can open the stay map, background the
    app, and tap a hotel an hour later — by then the token they hold is dead and the details
    call answers "No results found." Rather than tell them their own choice failed, we quietly
    run the search again and retry with a live context.

    This repeats the resolve-then-search sequence from stays_for_event on purpose. Folding
    both into one helper meant rewriting a path that is verified working end to end, and the
    duplication here is three calls long and only ever runs on the retry.
    """
    city_name, _ = _event_place(db, ev)
    if not city_name:
        return None, None
    matches = tripsure.suggest_location(city_name, trace_id=trace)
    if not matches:
        return None, None
    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    place = tripsure.best_location(matches, venue.lat if venue else None,
                                  venue.lng if venue else None)
    if place is None:
        return None, None
    found = tripsure.search_hotels(place, check_in.isoformat(), check_out.isoformat(),
                                   adults=adults, trace_id=trace)
    if not found:
        return None, None
    return found.get("doc_key"), found.get("token")


def _directions_url(from_lat, from_lng, to_lat, to_lng, to_name: str | None) -> str | None:
    """A Google Maps deep link from the bed to the doors.

    A link, not a rendered route, and that is the whole point. Google's Directions API bills
    per lookup and would still leave us drawing turn-by-turn ourselves; this costs nothing,
    needs no key, and opens the map app people already trust — with live transit times in
    every city, which we could not produce at any price.
    """
    if to_lat is None or to_lng is None:
        return None
    dest = f"{to_lat},{to_lng}"
    url = ("https://www.google.com/maps/dir/?api=1"
           f"&destination={quote(dest)}&travelmode=transit")
    if from_lat is not None and from_lng is not None:
        url += f"&origin={quote(f'{from_lat},{from_lng}')}"
    return url


def _to_base(row: HotelBooking, venue: Venue | None) -> StayBase:
    metres = walk = None
    if (venue and venue.lat is not None and venue.lng is not None
            and row.lat is not None and row.lng is not None):
        metres = int(round(_metres(row.lat, row.lng, venue.lat, venue.lng)))
        if metres <= WALK_MAX_M:
            walk = max(1, round(metres / WALK_M_PER_MIN))
    return StayBase(
        name=row.name,
        hotel_id=row.hotel_id,
        provider=row.provider,
        address=row.address,
        city=row.city,
        postal_code=row.postal_code,
        lat=row.lat,
        lng=row.lng,
        check_in=row.check_in.isoformat() if row.check_in else None,
        check_out=row.check_out.isoformat() if row.check_out else None,
        check_in_time=row.check_in_time,
        check_out_time=row.check_out_time,
        star_rating=float(row.star_rating) if row.star_rating is not None else None,
        image_url=row.image_url,
        source=row.source or "picked",
        metres_to_venue=metres,
        walk_minutes=walk,
        directions_url=_directions_url(
            row.lat, row.lng,
            venue.lat if venue else None, venue.lng if venue else None,
            venue.name if venue else None),
    )


def _star(info: dict):
    """The STAR rating out of hotelRatings[], ignoring the other kinds.

    Live shape: [{"ratingType": "STAR", "rating": 3.0}]. Other rating types appear on some
    properties, so taking [0] blindly would occasionally show a guest score as a star count.
    """
    for r in info.get("hotelRatings") or []:
        if isinstance(r, dict) and str(r.get("ratingType", "")).upper() == "STAR":
            return _num(r.get("rating"))
    return None


@router.put("/{event_id}/stay", response_model=StayBase)
def set_stay_base(
    event_id: UUID,
    hotel_id: str = Body(...),
    provider: str | None = Body(None),
    doc_key: str | None = Body(None),
    search_token: str | None = Body(None),
    image_url: str | None = Body(None),
    nights: int = Query(1, ge=1, le=14),
    adults: int = Query(2, ge=1, le=8),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """"This is where I'm staying" — recorded against the show, with the property's own record.

    PUT, not POST: one base per person per show, so sending it twice must not leave two.

    The address and coordinates are fetched from the supplier rather than taken from the
    request. The app already holds a name and a rough position from the listing, and it would
    have been less code to store those — but then the record would be whatever the phone
    happened to have, and "where is this person sleeping" would be answered from a search row
    instead of from the property. The details call also gives the check-in time, which the
    listing does not carry at all.

    Nothing here is a booking. Tripsure's booking flow needs Music X to take the payment and a
    PAN number, which is a decision the business has not made, so `source` stays 'picked'.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    if not tripsure.configured():
        raise HTTPException(status_code=503, detail="No travel provider is connected yet.")
    if not ev.starts_at:
        raise HTTPException(status_code=409,
                            detail="This show has no confirmed date, so a stay cannot be set.")

    trace = tripsure.new_trace_id()
    check_in = ev.starts_at.date()
    check_out = check_in + timedelta(days=nights)

    info = None
    if doc_key and search_token:
        info = tripsure.hotel_details(doc_key, search_token, hotel_id, provider,
                                      trace_id=trace)
    if info is None:
        # The context the app was holding has expired, or it never had one. Search again.
        fresh_key, fresh_token = _fresh_context(db, ev, check_in, check_out, adults, trace)
        if fresh_key and fresh_token:
            info = tripsure.hotel_details(fresh_key, fresh_token, hotel_id, provider,
                                          trace_id=trace)
    if info is None:
        # 502, not 500: our side worked and the supplier did not answer usefully. Nothing is
        # written, so a retry is clean — better than storing a name with no address and
        # calling that "where you're staying".
        raise HTTPException(
            status_code=502,
            detail="We couldn't get this hotel's details from our travel partner just now.")

    row = (db.query(HotelBooking)
             .filter(HotelBooking.user_id == _uuid.UUID(user_id),
                     HotelBooking.event_id == event_id)
             .one_or_none())
    if row is None:
        row = HotelBooking(user_id=_uuid.UUID(user_id), event_id=event_id, name="")
        db.add(row)

    row.name = str(info.get("hotelName") or "Your hotel")
    row.hotel_id = str(hotel_id)
    row.provider = provider
    row.address = info.get("address")
    row.city = info.get("city")
    row.postal_code = info.get("zip")
    row.lat = _num(info.get("latitude"))
    row.lng = _num(info.get("longitude"))
    row.check_in = check_in
    row.check_out = check_out
    row.check_in_time = info.get("checkIn")
    row.check_out_time = info.get("checkOut")
    row.star_rating = _star(info)
    # Kept from the listing: the details payload's imagery is a different shape and the app
    # already has a picture that matches the card the person tapped.
    if image_url:
        row.image_url = image_url
    row.source = "picked"
    db.commit()
    db.refresh(row)

    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    return _to_base(row, venue)


@router.get("/{event_id}/stay", response_model=StayBase | None)
def get_stay_base(
    event_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Where this person is staying for this show, or null if they haven't said."""
    row = (db.query(HotelBooking)
             .filter(HotelBooking.user_id == _uuid.UUID(user_id),
                     HotelBooking.event_id == event_id)
             .one_or_none())
    if row is None:
        return None
    ev = db.get(Event, event_id)
    venue = db.get(Venue, ev.venue_id) if ev and ev.venue_id else None
    return _to_base(row, venue)


@router.delete("/{event_id}/stay", status_code=204)
def clear_stay_base(
    event_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Not staying there after all. Deletes rather than flags — an un-picked hotel is not a
    fact worth keeping, and leaving it behind would keep it in any later trip summary."""
    row = (db.query(HotelBooking)
             .filter(HotelBooking.user_id == _uuid.UUID(user_id),
                     HotelBooking.event_id == event_id)
             .one_or_none())
    if row is not None:
        db.delete(row)
        db.commit()
    return None


# ---------------------------------------------------------------- do they have to travel?

# Same city, or near enough that a flight is an absurd suggestion. 40 km covers the cases our
# own catalogue creates: Brooklyn and New York are separate city rows 5 km apart, as are
# Cambridge/Boston, Hollywood/Los Angeles and Newcastle/Newcastle Upon Tyne. Ten such pairs.
LOCAL_KM = 40
# Beyond this a flight is the sensible answer. Under it, someone drives or takes a train, and
# selling them a plane ticket for a two-hour drive is the same mistake in the other direction.
REGIONAL_KM = 250


def city_centre(db: Session, city_id) -> tuple | None:
    """A city's position, taken as the median of its own venues.

    NOT the cities table's own lat/lng, which cannot be trusted: our Nottingham row sits
    3,394 km from Nottingham's venues, Madrid holds Catalonia's coordinates, Portland ME and
    Portland OR share a row, and six cities sit at (0, 0). Deciding "are you local" off those
    would tell someone in Nottingham to fly to Nottingham.

    The median rather than the mean, so one venue filed against the wrong city cannot drag the
    centre. Verified: London 51.5256,-0.1177; Nottingham 52.9557,-1.1488; Madrid 40.4361,
    -3.7025 — all correct, and all wrong in the cities table.

    None when the city has no placeable venues (124 of 1,110). The caller must then say it
    cannot tell rather than guess.
    """
    if not city_id:
        return None
    row = db.execute(text("""
        select percentile_cont(0.5) within group (order by v.lat) as lat,
               percentile_cont(0.5) within group (order by v.lng) as lng
        from venues v
        where v.city_id = :cid and v.lat is not null and v.lng is not null
    """), {"cid": str(city_id)}).fetchone()
    if row is None or row.lat is None or row.lng is None:
        return None
    return float(row.lat), float(row.lng)


def _norm_city(name: str | None) -> str:
    """A city name flattened for comparison — accents folded, case and punctuation dropped."""
    if not name:
        return ""
    folded = unicodedata.normalize("NFD", name)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", folded.lower())


@router.get("/{event_id}/travel-context", response_model=TravelContext)
def travel_context(
    event_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Local, regional, or far — so the tab can stop offering flights to everyone.

    Decided here rather than on the phone because the phone holds city NAMES, and a name
    cannot answer this: "Newcastle" and "Newcastle Upon Tyne" are one place, and no string
    comparison yields the 40 km rule. Both city ids and reliable venue coordinates only exist
    on this side.

    Cheap: two small queries against our own tables, no supplier involved. Safe to call on
    every event page.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    event_city = db.get(City, venue.city_id) if venue and venue.city_id else None
    directions = _directions_url(None, None,
                                venue.lat if venue else None,
                                venue.lng if venue else None,
                                venue.name if venue else None)
    common = dict(venue_name=venue.name if venue else None,
                  event_city=event_city.name if event_city else None,
                  directions_url=directions)

    prof = db.get(Profile, _uuid.UUID(user_id))
    home = db.get(City, prof.home_city_id) if prof and prof.home_city_id else None
    if home is None:
        # Distinguished from 'far' on purpose. Answering 'far' would show flights and quietly
        # assume this person is travelling; the tab should ask instead.
        return TravelContext(kind="unknown", reason="no_home_city", **common)
    common["origin_city"] = home.name
    if venue is None or venue.city_id is None:
        return TravelContext(kind="unknown", reason="unknown_venue_city", **common)

    # An id match is exact and needs no arithmetic — the common case, and the only one that
    # cannot be wrong.
    if home.id == venue.city_id:
        return TravelContext(kind="local", distance_km=0.0, **common)

    a, b = city_centre(db, home.id), city_centre(db, venue.city_id)
    if a and b:
        km = _metres(a[0], a[1], b[0], b[1]) / 1000.0
        kind = "local" if km <= LOCAL_KM else "regional" if km <= REGIONAL_KM else "far"
        return TravelContext(kind=kind, distance_km=round(km, 1), **common)

    # One of the cities has no venues to locate it by. A flattened name match is the last
    # honest signal — it catches the duplicate rows our ingestion creates for one place.
    if _norm_city(home.name) and _norm_city(home.name) == _norm_city(event_city.name if event_city else None):
        return TravelContext(kind="local", **common)

    # Cannot measure it. 'far' shows flights, which is exactly what the tab did before any of
    # this existed, so an unmeasurable pair behaves as it always has rather than regressing.
    return TravelContext(kind="far", reason="unmeasured", **common)
