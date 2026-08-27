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


def _num(v):
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _to_stay(h: dict) -> Stay:
    price = _first(h, "price", "totalPrice", "minPrice", "fare", default={})
    if isinstance(price, dict):
        amount = _num(_first(price, "amount", "total", "value"))
        currency = _first(price, "currency", "currencyCode")
    else:
        amount, currency = _num(price), _first(h, "currency", "currencyCode")
    geo = _first(h, "coordinates", "geoCode", "location", default={}) or {}
    return Stay(
        name=str(_first(h, "name", "hotelName", "title", default="Unnamed property")),
        image_url=_first(h, "image", "imageUrl", "thumbnail", "heroImage"),
        price_amount=amount,
        price_currency=currency,
        rating=_num(_first(h, "starRating", "rating", "stars")),
        address=_first(h, "address", "addressLine", "fullAddress"),
        lat=_num(_first(geo, "lat", "latitude")),
        lng=_num(_first(geo, "lon", "lng", "longitude")),
        deep_link=_first(h, "deepLink", "bookingUrl", "url"),
    )


def _to_flight(f: dict) -> Flight:
    price = _first(f, "price", "fare", "totalFare", default={})
    if isinstance(price, dict):
        amount = _num(_first(price, "totalFare", "amount", "total", "grandTotal"))
        currency = _first(price, "currency", "currencyCode")
    else:
        amount, currency = _num(price), _first(f, "currency", "currencyCode")
    segs = _first(f, "segments", "legs", default=[]) or []
    first_seg = segs[0] if segs else {}
    last_seg = segs[-1] if segs else {}
    return Flight(
        airline=_first(first_seg, "airline", "carrier", "airlineName") or _first(f, "airline"),
        flight_number=_first(first_seg, "flightNumber", "flight_number", "number"),
        origin=_first(first_seg, "origin", "from", "departureAirport"),
        destination=_first(last_seg, "destination", "to", "arrivalAirport"),
        departs_at=_first(first_seg, "departureTime", "departure_date_time", "departsAt"),
        arrives_at=_first(last_seg, "arrivalTime", "arrival_date_time", "arrivesAt"),
        stops=len(segs) - 1 if segs else None,
        duration_minutes=_first(f, "durationMinutes", "duration_minutes", "totalDuration"),
        price_amount=amount,
        price_currency=currency,
        deep_link=_first(f, "deepLink", "bookingUrl", "url"),
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

    hotels = tripsure.search_hotels(matches[0], check_in.isoformat(),
                                    check_out.isoformat(), adults=adults, trace_id=trace)
    if hotels is None:
        return TravelOptions(status="unavailable",
                             reason="We could not reach our travel provider just now.", **dates)
    return TravelOptions(
        status="ok" if hotels else "unavailable",
        reason=None if hotels else f"No stays available in {city_name} for those dates.",
        **dates,
        stays=[_to_stay(h) for h in hotels[:20] if isinstance(h, dict)],
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
        # Already an IATA code? Take it. Otherwise resolve the name.
        if len(q) == 3 and q.isalpha():
            return q.upper()
        hits = tripsure.suggest_airports(q, trace_id=trace) or []
        for h in hits:
            c = _first(h, "iataCode", "code", "iata")
            if c:
                return str(c).upper()
        return None

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
    return TravelOptions(
        status="ok" if offers else "unavailable",
        reason=None if offers else f"No flights found from {from_code} to {to_code} on {depart_on}.",
        flights=[_to_flight(f) for f in offers[:20] if isinstance(f, dict)],
    )
