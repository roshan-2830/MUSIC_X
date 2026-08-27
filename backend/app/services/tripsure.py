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
import time
import uuid

import httpx

from app.core.config import settings

TIMEOUT = 20.0


def _creds(flights: bool) -> tuple:
    """(base_url, tenant, key) for the service being called.

    Hotels and flights are separate services with separate tenants AND separate keys, not
    one account on two hosts. Sharing a pair authenticates against the wrong service.
    """
    if flights:
        return (settings.tripsure_flight_base_url, settings.tripsure_flight_tenant_id,
                settings.tripsure_flight_api_key)
    return (settings.tripsure_base_url, settings.tripsure_tenant_id, settings.tripsure_api_key)


def configured(flights: bool = False) -> bool:
    """Whether we hold enough to call this service at all."""
    return all(_creds(flights))


def new_trace_id() -> str:
    """One correlation id for a whole user journey.

    Their guide asks for a single x-trace-id from the first autosuggest through to
    post-booking, so a support ticket can trace the lot. Generated here and threaded through
    rather than made per call, which would make a journey untraceable.
    """
    return str(uuid.uuid4())


def _headers(trace_id: str | None = None, user_id: str | None = None,
             flights: bool = False) -> dict:
    _base, tenant, key = _creds(flights)
    h = {
        "x-tenant-id": tenant,
        "x-api-key": key,
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
    # The hotel APIs report failure as a singular `error` STRING alongside code 200 — e.g.
    # {"response": null, "error": "No results found.", "code": 200}. Without this, such a
    # payload falls through to the `or payload` below and is handed back as a truthy object,
    # so a caller checking `is None` proceeds on an error envelope: search_hotels reads no
    # .hotels off it and reports "no stays in this city", which is a claim about the city
    # made out of a failure of ours. Absence and failure are not the same answer.
    err = payload.get("error")
    if isinstance(err, str) and err.strip():
        print(f"[tripsure] refused: {err[:120]}")
        return None
    # `data` for search/fare/itinerary; `response` for the hotel autosuggest.
    return payload.get(key) or payload.get("response") or payload


def _call(method: str, base: str, path: str, *, trace_id=None, user_id=None,
          json_body=None, params=None, unwrap_key="data", flights=False, timeout=None,
          retries: int = 0, retry_budget: float = 45.0):
    """One call to Tripsure, optionally retried.

    Retries exist because their preprod fails at random rather than for a reason. Measured
    within one minute: Madrid returned 1,090 hotels in 15.2s, then a 500 after 11s, then three
    instant 500s in 0.2s each. The second Madrid attempt in an earlier run succeeded with 1,073
    hotels. Nothing about the request changed.

    Only transport errors and 5xx are retried. A 4xx is an answer — "Only INR currency is
    supported" will say the same thing however many times it is asked — and retrying a 401 or
    403 just spends time confirming a key or an allowlist is still wrong.

    The pause matters. Those 0.2s 500s arrive immediately after a heavy request, which reads as
    throttling rather than breakage, so hammering straight away would collect the same refusal.

    `retry_budget` caps total elapsed time rather than attempts. A phone is waiting on this: two
    retries at a 35s timeout would be a minute and a half of spinner, and someone would have
    put the phone down long before. Whichever limit is reached first ends it.
    """
    url = f"{base.rstrip('/')}{path}"
    started = time.monotonic()
    for attempt in range(retries + 1):
        again, value = _attempt(method, url, path, trace_id=trace_id, user_id=user_id,
                                json_body=json_body, params=params, unwrap_key=unwrap_key,
                                flights=flights, timeout=timeout)
        if not again:
            return value
        spent = time.monotonic() - started
        if attempt >= retries or spent >= retry_budget:
            if retries:
                print(f"[tripsure] {method} {path} gave up after {attempt + 1} "
                      f"attempt(s), {spent:.1f}s")
            return None
        # 2s, then 4s. Long enough to clear a throttle, short enough that someone holding a
        # phone has not given up.
        time.sleep(min(2.0 * (attempt + 1), 4.0))
    return None


def _attempt(method: str, url: str, path: str, *, trace_id, user_id, json_body, params,
             unwrap_key, flights, timeout):
    """(retry_worth_it, value) for a single request."""
    try:
        r = httpx.request(method, url, headers=_headers(trace_id, user_id, flights),
                          json=json_body, params=params, timeout=timeout or TIMEOUT)
    except Exception as e:
        print(f"[tripsure] {method} {path} unreachable: {type(e).__name__}")
        return True, None
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
        return False, None
    if r.status_code >= 400:
        print(f"[tripsure] {method} {path} -> {r.status_code} {r.text[:120]}")
        # 5xx is theirs and often momentary. 429 is the one 4xx worth repeating: it means slow
        # down, not stop, and this service demonstrably throttles — instant 500s arrive right
        # after a heavy request. Every other 4xx is an answer about the request itself and will
        # say the same thing however many times it is asked.
        return r.status_code >= 500 or r.status_code == 429, None
    try:
        return False, _unwrap(r.json(), unwrap_key)
    except Exception:
        print(f"[tripsure] {method} {path} returned non-JSON")
        return False, None


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
    import json
    from urllib.parse import urlencode

    coords = location.get("coordinates") or {}
    # Copied from a URL their own site produced, captured in a browser rather than guessed.
    # Two things were missing from the first version: `state`, which their API documents as
    # REQUIRED ("When mapSearch is false, city, state, country name and country code are
    # required"), and the guests structure. Without them the search box loaded reading
    # "Travellers" with no occupancy set.
    q = {
        "destination": location.get("name"),
        "locId": location.get("id"),
        "locName": location.get("name"),
        "locType": location.get("type"),
        "city": location.get("city") or location.get("name"),
        "state": location.get("state"),
        "country": location.get("country"),
        "lat": coords.get("lat") or location.get("lat"),
        "lon": coords.get("lon") or location.get("lon"),
        "checkIn": check_in,
        "checkOut": check_out,
        "adults": adults,
        "children": 0,
        "rooms": rooms,
        # Their own shape: one entry per room, "a" adults and "c" children's ages.
        "guests": json.dumps([{"a": adults, "c": []} for _ in range(max(1, rooms))],
                             separators=(",", ":")),
    }
    return f"{WEB_BASE}/stays/results?" + urlencode({k: v for k, v in q.items() if v is not None})


def _km(la1, lo1, la2, lo2) -> float:
    import math
    r = math.radians
    h = (math.sin((r(la2) - r(la1)) / 2) ** 2
         + math.cos(r(la1)) * math.cos(r(la2)) * math.sin((r(lo2) - r(lo1)) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


# How far a matched location may sit from the venue and still be the same place. Generous
# enough for a venue outside the city it is named after, tight enough to reject another
# continent.
MAX_MATCH_KM = 80


def best_location(suggestions: list, venue_lat: float | None = None,
                  venue_lng: float | None = None) -> dict | None:
    """The suggestion that is actually where the show is — verified against the venue.

    A NAME IS NOT A PLACE, and trusting one produced the worst bug in this integration.
    'Yaamava Resort & Casino' is in Highland, CALIFORNIA. Tripsure's top City match for
    "Highland" is Genting Highlands, MALAYSIA, and the first version took it: the Stay tab
    offered hotels 14,180 km away, and because the map fitted them it zoomed out to a view of
    two continents with every pin off-screen. The map looking broken was the symptom; the
    hotels being on the wrong side of the planet was the fault.

    Worse, none of the five "Highland" suggestions IS Highland, California — the others are
    in Maryland, Michigan, Illinois and Wisconsin. So there is no answer to pick, and any
    choice would have been wrong. Which is the point: the venue's own coordinates are the
    only evidence that settles it, and we have them.

    Returns None when nothing is near the venue. That is a real answer — better a tab that
    says it cannot find stays than one confidently listing another country's hotels.
    """
    if not suggestions:
        return None

    def near(s) -> bool:
        if venue_lat is None or venue_lng is None:
            return True     # nothing to check against; fall back to ranking alone
        c = s.get("coordinates") or {}
        la, lo = c.get("lat") or s.get("lat"), c.get("lon") or s.get("lon")
        if la is None or lo is None:
            return False
        return _km(venue_lat, venue_lng, la, lo) <= MAX_MATCH_KM

    # A City first, then the looser place types — but only ones that are actually here.
    for want in ("City", "Locality", "Area", "Region", "MultiCity", "State"):
        for s in suggestions:
            if (s.get("type") or "") == want and near(s):
                return s
    # A state's own popular_locations are cities; try those before giving up.
    for s in suggestions:
        for pop in (s.get("popular_locations") or []):
            if near(pop):
                return pop
    return None


def search_hotels(location: dict, check_in: str, check_out: str, *, adults: int = 2,
                  currency: str = "INR", trace_id: str | None = None) -> dict | None:
    """Hotels available in a location for those dates.

    `location` is one entry from suggest_location — passed through whole, because the listing
    call wants its id, name, type and coordinates together and reconstructing it by hand is
    how the id and the coordinates drift apart.

    Returns the whole envelope, not just the rows. docKey and token live on it and are the
    only way to ask for a property's details later, so returning `hotels` alone threw away
    half of what the call answered.
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
    # 35s, not the shared 20s. A successful Madrid listing was measured at 15.2s and Mumbai
    # returns over 1,200 rows, so 20s was close enough to the real duration that ordinary slow
    # answers were being thrown away as failures.
    data = _call("POST", settings.tripsure_base_url, "/api/hotel/listing",
                 json_body=body, trace_id=trace_id, timeout=35.0, retries=2)
    if data is None:
        return None
    # Confirmed against a live call: docKey, token, totalCount and hotels[], each row
    # { hotelKey, hotelInfo, priceSummary[] }. The guessed names the first version tried are
    # gone — there is no need to hedge about a shape we have now seen.
    hotels = data.get("hotels")
    return {
        "hotels": hotels if isinstance(hotels, list) else [],
        "doc_key": data.get("docKey"),
        "token": data.get("token"),
    }


def hotel_details(doc_key: str, token: str, hotel_id: str, provider: str | None = None,
                  *, trace_id: str | None = None) -> dict | None:
    """The property's own record: address, coordinates, check-in times, rating, amenities.

    `contentOnly=True` is not an optimisation, it is the only thing that works. With it false
    the call asks for live rates as well and answers
    {"response": null, "error": "No results found."} — the search context has already moved
    on by the time anyone picks a hotel. Static content is also all this is for: we are
    answering "where is this person sleeping", not re-quoting a price.

    Confirmed against a live Mumbai call — 20,231 bytes, hotelInfo carrying hotelName,
    address, city, state, zip, latitude, longitude, checkIn "12:00 PM", checkOut "11:00 AM",
    hotelRatings[{ratingType: "STAR", rating: 3.0}], description and hotelAmenities.
    """
    if not configured() or not (doc_key and token and hotel_id):
        return None
    data = _call("POST", settings.tripsure_base_url, "/api/hotel/details",
                 json_body={"docKey": doc_key, "token": token, "hotelId": str(hotel_id),
                            "contentOnly": True, "provider": provider},
                 trace_id=trace_id)
    if not isinstance(data, dict):
        return None
    info = data.get("hotelInfo")
    return info if isinstance(info, dict) else None


# ---------------------------------------------------------------- flights

def suggest_airports(query: str, trace_id: str | None = None) -> list | None:
    """Airports matching a city or code — flight search speaks IATA, an event does not.

    Path confirmed against the live service. The integration guide's quick reference lists
    `/api/v1/autosuggest/airports`, which answers 404 with "Unknown service prefix: 'v1'";
    the service name has to come first, as the Postman collection has it. Real paths are
    {BASE}/discovery/... and {BASE}/booking/..., where BASE already ends in /api.
    """
    if not configured(flights=True) or not query:
        return None
    base = settings.tripsure_flight_base_url
    data = _call("GET", base, "/discovery/api/v1/autosuggest/airports",
                 params={"q": query}, trace_id=trace_id, flights=True)
    if data is None:
        return None
    return data if isinstance(data, list) else []


def search_flights(origin: str, destination: str, depart_on: str, *, adults: int = 1,
                   cabin: str = "ECONOMY", currency: str = "INR",
                   trace_id: str | None = None) -> list | None:
    """One-way offers between two IATA codes on a date.

    One-way by design: the return leg depends on how long someone stays for a festival, which
    a trip planner asks and a search box cannot assume.

    Slow by nature — a live search fans out to suppliers and took 9.5 seconds for DEL-BOM, so
    it gets its own generous timeout rather than the shared one.
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
    data = _call("POST", settings.tripsure_flight_base_url,
                 "/discovery/api/v1/flights/search", json_body=body,
                 trace_id=trace_id, flights=True, timeout=45.0)
    if data is None:
        return None
    # Confirmed against a live search: data.searchResult.ONWARD, 199 offers for DEL-BOM.
    # ONWARD is the outbound leg; a return search would add its own key, which is why the
    # direction is named rather than assumed to be the only list present.
    result = (data.get("searchResult") or {}) if isinstance(data, dict) else {}
    onward = result.get("ONWARD")
    return onward if isinstance(onward, list) else []
