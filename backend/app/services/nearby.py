"""Places worth an hour before doors, from OpenStreetMap.

WHY OSM AND NOT GOOGLE PLACES. Google has star ratings, price levels and photos, and charges
about $32 per 1,000 nearby searches. OSM has none of those three and costs nothing. The trade
was made on what this section is actually for: answering "is there anywhere to eat near this
venue, and can I walk it". Names, categories and coordinates answer that, and coordinates give
walking times for free. What OSM cannot give, this code does not show — a fabricated 4.6 would
be worse than no rating at all.

Overpass is a donated public service. Its usage policy asks for restraint, which is why every
result is cached per venue: a café does not move, so one fetch serves every person who ever
opens that show. Measured live: 129 places for Alexandra Palace in 13.1s, 200 for Madrid's
Wizink Center in 4.5s — far too slow to sit through more than once.
"""
import math
import time

import httpx

# Mirrors, tried in order. Not redundancy for its own sake: measured within one minute,
# overpass-api.de and z.overpass-api.de both answered 504, kumi.systems 502, and only
# lz4.overpass-api.de returned data. overpass.osm.ch answers 200 with zero results outside
# Switzerland, which is worse than an error because it looks like an empty neighbourhood — so
# it is not in this list.
MIRRORS = (
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)

# Their policy asks for a real identifying agent, and a request without one is refused: the
# first attempt at this returned HTTP 406 with no explanation.
HEADERS = {"User-Agent": "MusicX/0.1 (live music trip planner; jadhav.r@yangtsofour.com)"}

# 1.2 km is about a fifteen-minute walk, which is the honest outer edge of "around the venue".
RADIUS_M = 1200
TIMEOUT = 40.0
MAX_STORED = 120

# OSM tag -> which tab it belongs under. Explicit rather than a catch-all, so a tag we have
# not thought about is dropped instead of appearing under a heading it does not belong to.
EAT = {"restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "biergarten"}
DO = {"museum", "gallery", "attraction", "artwork", "viewpoint", "zoo", "aquarium",
      "park", "garden", "theatre", "cinema", "monument", "memorial", "castle", "ruins"}

# Dropped on sight. These carry a `historic` or `tourism` tag and are technically places, but
# nobody spends the hour before a gig at a wartime street shelter or a boundary stone, and a
# list padded with them reads as noise rather than as a recommendation.
SKIP_CATEGORIES = {"shelter", "boundary_stone", "milestone", "wayside_cross", "tomb",
                   "grave", "archaeological_site", "highwater_mark", "survey_point"}

# Categories where OSM's `name` is often an inscription rather than a name. A plaque near
# Alexandra Palace is filed as a memorial called "BBC First regular high definition television
# service", which is a sentence, and it was leading the "worth doing" list ahead of the park.
# A real small sight is named in a few words — "Leo the Lion", "Oliver Tambo statue", "East
# Side Gallery" — so word count separates them where length alone does not.
INSCRIPTION_PRONE = {"memorial", "monument", "artwork", "attraction"}
MAX_NAME_WORDS = 5


def _query(lat: float, lng: float, radius: int) -> str:
    # `nwr` covers nodes, ways and relations: a park or a museum is usually a way, and asking
    # for nodes alone silently loses most of the "worth doing" half. `out center` gives one
    # coordinate per element whatever its geometry, so distance maths is uniform.
    return f"""[out:json][timeout:25];
(
  nwr(around:{radius},{lat},{lng})[amenity~"^({'|'.join(sorted(EAT))})$"][name];
  nwr(around:{radius},{lat},{lng})[tourism][name];
  nwr(around:{radius},{lat},{lng})[leisure~"^(park|garden)$"][name];
  nwr(around:{radius},{lat},{lng})[historic][name];
);
out center 300;"""


def _metres(la1, lo1, la2, lo2) -> float:
    r, p = 6371000.0, math.radians
    dla, dlo = p(la2 - la1), p(lo2 - lo1)
    h = math.sin(dla / 2) ** 2 + math.cos(p(la1)) * math.cos(p(la2)) * math.sin(dlo / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _category(tags: dict) -> str | None:
    """The one word that describes this place, or None if we should not show it."""
    for key in ("amenity", "tourism", "leisure", "historic"):
        v = tags.get(key)
        if v:
            return str(v)
    return None


def _bucket(category: str) -> str | None:
    if category in EAT:
        return "eat"
    if category in DO:
        return "do"
    # An unrecognised tourism/historic value — "hotel", "information", "hostel" — belongs to
    # neither tab. Hotels especially: the Stay tab is where rooms live, and a hotel appearing
    # under "worth doing" would be both wrong and confusing.
    return None


def fetch(lat: float, lng: float, *, radius: int = RADIUS_M,
          exclude_name: str | None = None) -> list | None:
    """Normalised places around a point, nearest first. None if Overpass could not be reached.

    None and [] are different answers and the caller must keep them apart: one means we have
    not managed to look, the other means we looked and this venue really is surrounded by
    nothing — which happens, for a stadium in a retail park.
    """
    body = {"data": _query(lat, lng, radius)}
    elements = None
    for host in MIRRORS:
        started = time.monotonic()
        try:
            r = httpx.post(host, data=body, headers=HEADERS, timeout=TIMEOUT)
        except Exception as e:
            print(f"[nearby] {host.split('/')[2]} unreachable: {type(e).__name__}")
            continue
        if r.status_code != 200:
            print(f"[nearby] {host.split('/')[2]} -> {r.status_code}")
            continue
        try:
            elements = r.json().get("elements") or []
        except Exception:
            print(f"[nearby] {host.split('/')[2]} returned non-JSON")
            continue
        print(f"[nearby] {host.split('/')[2]} -> {len(elements)} raw in "
              f"{time.monotonic() - started:.1f}s")
        break
    if elements is None:
        return None

    skip_key = (exclude_name or "").strip().lower()
    out, seen = [], set()
    for el in elements:
        tags = el.get("tags") or {}
        name = (tags.get("name") or "").strip()
        if not name:
            continue
        category = _category(tags)
        if not category or category in SKIP_CATEGORIES:
            continue
        bucket = _bucket(category)
        if not bucket:
            continue
        if category in INSCRIPTION_PRONE and len(name.split()) > MAX_NAME_WORDS:
            continue
        centre = el.get("center") or el
        plat, plng = centre.get("lat"), centre.get("lon")
        if plat is None or plng is None:
            continue
        # The venue itself comes back in its own search — Alexandra Palace appeared 29 m from
        # Alexandra Palace, tagged as an exhibition centre. Recommending the building someone
        # is already standing in is the sort of thing that makes a list untrustworthy.
        low = name.lower()
        if skip_key and (low in skip_key or skip_key in low):
            continue
        # One entry per name per venue. OSM often holds the same pub as a node and again as
        # the building way, and a list with two Phoenixes in it looks broken.
        if low in seen:
            continue
        seen.add(low)
        out.append({
            "osm_type": str(el.get("type") or "node"),
            "osm_id": int(el.get("id") or 0),
            "name": name,
            "bucket": bucket,
            "category": category,
            "cuisine": (tags.get("cuisine") or "").split(";")[0][:60] or None,
            "website": tags.get("website") or tags.get("contact:website"),
            "lat": float(plat),
            "lng": float(plng),
            "distance_m": int(round(_metres(lat, lng, float(plat), float(plng)))),
        })
    out.sort(key=lambda p: p["distance_m"])
    return out[:MAX_STORED]
