"""Tripsure — flights and hotels, for the trip built around a show.

SERVER TO SERVER, ALWAYS. Their integration guide is explicit: "must be sent server-to-server
only ... Never expose in a browser or mobile client." So nothing here is reachable from the
app. The phone calls our own /events/{id}/stays and /events/{id}/flights, and this module is
the only thing that holds the key. Any design where the app called Tripsure directly would
ship the partner key to every installed copy.

DARK UNTIL IT WORKS. Every function returns an empty result when the credentials are missing
or access is refused, and the caller renders nothing rather than an error. Same pattern as
bandsintown.py, and for the same reason: a travel section that quietly does not appear is a
smaller problem than an event page that fails to load.

TWO HOSTS. Measured 2026-08-27 against preprod:

  • Hotels answer on {base}/api/hotel/... — the route exists and returns 403 with an AWS
    resource-policy denial ("User: anonymous is not authorized"), which is an access-control
    decision made BEFORE the key is read. That is an allowlist, not a bad credential.
  • Flights answer nowhere on that host. Every flight path returns "Missing Authentication
    Token", which is API Gateway's phrasing for an unmatched route. Their base URL was empty
    in the exported collection, so it has been requested.

THE ENVELOPE. Search, fare, itinerary and post-booking replies are wrapped:

    {"status": "SUCCESS", "statusCode": 200, "data": {...}}
    {"status": "FAILED",  "statusCode": 400, "errors": [{"code","message","description"}]}

_unwrap handles both. Note that the hotel autosuggest replies under `response` rather than
`data` — read from the collection's own test script, which pulls
`jsonData.response.locationSuggestions`.

MONEY. Search, fare and booking amounts are decimal rupees. PAYMENT amounts are integer
paise (amount_inr_paise = totalFare x 100). Nothing here touches payment, and that unit
change is the first thing to get wrong when it does.
"""
import uuid

import httpx

from app.core.config import settings

TIMEOUT = 20.0


def configured(flights: bool = False) -> bool:
    """Whether we hold enough to call at all. Flights need their own host."""
    base = settings.tripsure_flights_base_url if flights else settings.tripsure_base_url
    return bool(base and settings.tripsure_tenant_id and settings.tripsure_api_key)


def new_trace_id() -> str:
    """One correlation id for a whole user journey.

    Their guide asks for a single x-trace-id from the first autosuggest through to
    post-booking, so a support ticket can trace the lot. Generated here and threaded through
    rather than made per call, which would make a journey untraceable.
    """
    return str(uuid.uuid4())


def _headers(trace_id: str | None = None, user_id: str | None = None) -> dict:
    h = {
        "x-tenant-id": settings.tripsure_tenant_id,
        "x-api-key": settings.tripsure_api_key,
        "x-trace-id": trace_id or new_trace_id(),
        "Content-Type": "application/json",
    }
    # Only booking, payment and order calls carry the end customer. Sending it on a search
    # would scope a read to a traveller for no reason.
    if user_id:
        h["x-user-id"] = user_id
    return h


def _unwrap(payload: dict, key: str = "data"):
    """The business object, or None when the call reported failure.

    Prints the errors[] rather than raising: a trip section is an enhancement to an event
    page, and an upstream refusal must not take the page down with it.
    """
    if not isinstance(payload, dict):
        return None
    status = (payload.get("status") or "").upper()
    if status == "FAILED" or payload.get("errors"):
        errs = payload.get("errors") or []
        first = errs[0] if errs else {}
        print(f"[tripsure] refused: {first.get('code')} {first.get('message')}")
        return None
    # `data` for search/fare/itinerary; `response` for the hotel autosuggest.
    return payload.get(key) or payload.get("response") or payload


def _call(method: str, base: str, path: str, *, trace_id=None, user_id=None,
          json_body=None, params=None, unwrap_key="data"):
    url = f"{base.rstrip('/')}{path}"
    try:
        r = httpx.request(method, url, headers=_headers(trace_id, user_id),
                          json=json_body, params=params, timeout=TIMEOUT)
    except Exception as e:
        print(f"[tripsure] {method} {path} unreachable: {type(e).__name__}")
        return None
    if r.status_code in (401, 403):
        # Distinguished on purpose. A resource-policy denial is an allowlist problem and no
        # amount of retrying or re-keying fixes it; a missing route means the wrong host.
        body = r.text[:160]
        # Two very different 403s, and telling them apart saves looking in the wrong place.
        # Tripsure's gateway is IP-allowlisted to the office network, so the first one is the
        # expected answer from anywhere else — a VPN or the office WiFi fixes it and no
        # amount of re-keying will. The second is not about access at all.
        hint = ("IP not allowlisted — are you off the office network? (VPN or office WiFi)"
                if "not authorized to perform" in body else
                "no such route on this host — this is NOT the network; wrong base URL"
                if "Missing Authentication Token" in body else "check tenant and key")
        print(f"[tripsure] {method} {path} -> {r.status_code}: {hint}")
        return None
    if r.status_code >= 400:
        print(f"[tripsure] {method} {path} -> {r.status_code} {r.text[:120]}")
        return None
    try:
        return _unwrap(r.json(), unwrap_key)
    except Exception:
        print(f"[tripsure] {method} {path} returned non-JSON")
        return None


# ---------------------------------------------------------------- hotels

def suggest_location(query: str, trace_id: str | None = None) -> list | None:
    """Cities and areas matching a name, each with coordinates.

    The first step of a hotel search: the listing call wants a locationSuggestion object,
    not a free-text city, so a name has to be resolved before anything can be searched.
    """
    if not configured() or not query:
        return None
    data = _call("GET", settings.tripsure_base_url, "/api/hotel/locations/autosuggest",
                 params={"q": query}, trace_id=trace_id)
    # None means the call failed; [] means it answered with nothing. The caller says
    # different things about each, and collapsing them tells a user their city has no hotels
    # when the truth is that our IP is not allowlisted.
    if data is None:
        return None
    return data.get("locationSuggestions") or []


# Tripsure's own consumer site, where a booking is completed. Found on their homepage, not
# in the API docs: every "Hotels in <city>" link carries exactly the fields the autosuggest
# API returns, so a search we ran can be handed over pre-filled.
#
# There is no per-hotel route — /stays/hotel/{key} and every variant 404s — so Book opens the
# city's results page for the right dates, not the specific property. Worth asking Tripsure
# whether a per-hotel URL exists.
WEB_BASE = "https://www.tripsure.com"


def results_url(location: dict, check_in: str, check_out: str,
                adults: int = 2, rooms: int = 1) -> str:
    """The hand-over link: their results page, pre-filled from the search we just ran."""
    from urllib.parse import urlencode
    coords = location.get("coordinates") or {}
    q = {
        "destination": location.get("name"),
        "locId": location.get("id"),
        "locName": location.get("name"),
        "locType": location.get("type"),
        "city": location.get("city") or location.get("name"),
        "country": location.get("country"),
        "lat": coords.get("lat") or location.get("lat"),
        "lon": coords.get("lon") or location.get("lon"),
        "checkIn": check_in,
        "checkOut": check_out,
        "adults": adults,
        "rooms": rooms,
    }
    return f"{WEB_BASE}/stays/results?" + urlencode({k: v for k, v in q.items() if v is not None})


def best_location(suggestions: list) -> dict | None:
    """The suggestion worth searching — a CITY, not a state or a region.

    Measured 2026-08-27: searching a State returns HTTP 500 after an 11-second upstream
    timeout. "goa" resolves to Goa the State and fails; "mumbai" and "bengaluru" resolve to
    City and return 933 KB and 1.4 MB of hotels. Taking suggestions[0] blindly, as the first
    version did, meant a whole class of destinations answered with a server error.
    """
    if not suggestions:
        return None
    for want in ("City", "Locality", "Area", "Hotel"):
        for s in suggestions:
            if (s.get("type") or "") == want:
                return s
    # A State's own popular_locations are cities — better than searching the state itself.
    for s in suggestions:
        for pop in (s.get("popular_locations") or []):
            if (pop.get("type") or "") == "City":
                return pop
    return suggestions[0]


def search_hotels(location: dict, check_in: str, check_out: str, *, adults: int = 2,
                  currency: str = "INR", trace_id: str | None = None) -> list | None:
    """Hotels available in a location for those dates.

    `location` is one entry from suggest_location — passed through whole, because the listing
    call wants its id, name, type and coordinates together and reconstructing it by hand is
    how the id and the coordinates drift apart.
    """
    if not configured() or not location:
        return None
    coords = location.get("coordinates") or {}
    body = {
        "checkIn": check_in,
        "checkOut": check_out,
        "rooms": [{"numberOfAdults": str(adults), "numberOfChildren": "0"}],
        "city": location.get("city") or location.get("name"),
        "locationSuggestion": {
            "id": location.get("id"),
            "name": location.get("name"),
            "type": location.get("type"),
            "lat": coords.get("lat") or location.get("lat"),
            "lon": coords.get("lon") or location.get("lon"),
        },
        "state": location.get("state"),
        "countryName": location.get("country"),
        "circularSearch": False,
        "nationalityCode": "IN",
        "countryCode": location.get("countryCode") or location.get("country"),
        "partnerCall": True,
        "currency": currency,
        "fetchFromCache": False,
    }
    data = _call("POST", settings.tripsure_base_url, "/api/hotel/listing",
                 json_body=body, trace_id=trace_id)
    if data is None:
        return None
    # Confirmed against a live call: response.hotels, each { hotelKey, hotelInfo,
    # priceSummary[] }. The guessed names the first version tried are gone — there is no
    # need to hedge about a shape we have now seen.
    hotels = data.get("hotels")
    return hotels if isinstance(hotels, list) else []


# ---------------------------------------------------------------- flights

def suggest_airports(query: str, trace_id: str | None = None) -> list | None:
    """Airports matching a city or code — flight search speaks IATA, an event does not."""
    if not configured(flights=True) or not query:
        return None
    data = _call("GET", settings.tripsure_flights_base_url, "/api/v1/autosuggest/airports",
                 params={"q": query}, trace_id=trace_id)
    if data is None:
        return None
    if isinstance(data, list):
        return data
    return data.get("airports") or data.get("suggestions") or []


def search_flights(origin: str, destination: str, depart_on: str, *, adults: int = 1,
                   cabin: str = "ECONOMY", currency: str = "INR",
                   trace_id: str | None = None) -> list | None:
    """One-way offers between two IATA codes on a date.

    One-way by design for now: the return leg depends on how long someone stays for a
    festival, which is a question the trip planner asks and a search box cannot assume.
    """
    if not configured(flights=True) or not (origin and destination and depart_on):
        return None
    body = {
        "trip_type": "ONE_WAY",
        "segments": [{"origin": origin, "destination": destination,
                      "departure_date": depart_on}],
        "adults": adults, "children": 0, "infants": 0,
        "cabin_class": cabin, "max_stops": "ALL",
        "preferred_airlines": [], "excluded_airlines": [],
        "refundable": False, "results_limit": 50,
        "nearby_airports": False, "resident_fare": False,
        "currency": currency, "nationality": "IN",
    }
    data = _call("POST", settings.tripsure_flights_base_url,
                 "/discovery/api/v1/flights/search", json_body=body, trace_id=trace_id)
    if data is None:
        return None
    for key in ("offers", "flights", "itineraries", "results"):
        if isinstance(data.get(key), list):
            return data[key]
    return data if isinstance(data, list) else []
