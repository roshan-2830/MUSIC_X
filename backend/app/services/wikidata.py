"""Venue capacity from Wikidata.

WHY WIKIDATA AND NOT OPENSTREETMAP. Both were tested against our own 25 busiest venues.
Wikidata returned a capacity for 6 of them — The O2 20,000, OVO Hydro 13,000, O2 universum
10,000, ABBA Arena 3,000, Melkweg 1,500, Arlene Schnitzer 2,776 — all correct. OSM, matched
by coordinate, returned capacity 26 for The O2, 5 for Blue Note Jazz Club and 2 for Whisky
A Go Go: its `capacity` tag near a venue is parking spaces, bike racks or a lift. Scoring on
that would have made the O2 a 26-seat room.

WHY THE MediaWiki API AND NOT SPARQL. The obvious SPARQL query matches on rdfs:label, which
asks Wikidata to scan every label it holds; it rejected all 25 attempts. Two cheap REST
calls — search for the entity, read one property off it — return in well under a second.

Licence: Wikidata is CC0. No key, no attribution requirement, commercial use fine.
"""
import re
import unicodedata

import httpx

API = "https://www.wikidata.org/w/api.php"
CAPACITY = "P1083"
UA = "MusicX/0.1 (concert discovery; jadhav.r@yangtsofour.com)"
TIMEOUT = 20

# A room can hold a handful of people or a hundred thousand. Outside that, the number is
# not a capacity — it is a year, a postcode, or a different property misfiled.
MIN_CAP = 30
MAX_CAP = 250_000

# Subscript and full-width digits appear in venue names ("O₂ universum"), and the search
# API resolves them while a plain string compare does not.
_SUBS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")


def _tokens(s: str) -> set:
    s = unicodedata.normalize("NFKC", (s or "").translate(_SUBS)).lower()
    return {t for t in re.split(r"[^a-z0-9]+", s) if t and t not in {"the", "at", "of", "and"}}


def _plausible(ours: str, theirs: str) -> bool:
    """Is the entity we found actually the venue we asked about?

    The guard exists because searching "Sphere" returns a French philosophy publication.
    That one happened to carry no capacity and so failed safely, but a one-word venue name
    matching a stadium on another continent would not — it would silently import somebody
    else's number and the score would be built on it.
    """
    a, b = _tokens(ours), _tokens(theirs)
    if not a or not b:
        return False
    if a <= b or b <= a:          # "o2" ⊂ "o2 arena": the same place, named longer
        return True
    return len(a & b) / len(a | b) >= 0.6


def capacity_for(name: str) -> tuple[int | None, str | None]:
    """(capacity, the Wikidata label it came from) — or (None, reason) when there is none.

    Returns the matched label so a backfill can be audited: a number with no provenance is
    exactly the kind of thing that ends up unexplainable three weeks later.
    """
    clean = (name or "").strip()
    if len(clean) < 3:
        return None, "name too short"
    try:
        r = httpx.get(API, params={
            "action": "wbsearchentities", "search": clean, "language": "en",
            "format": "json", "type": "item", "limit": 5,
        }, headers={"User-Agent": UA}, timeout=TIMEOUT)
        r.raise_for_status()
        hits = r.json().get("search", [])
    except Exception as e:
        return None, f"search failed: {type(e).__name__}"

    for h in hits:
        label = h.get("label") or ""
        if not _plausible(clean, label):
            continue
        try:
            c = httpx.get(API, params={
                "action": "wbgetclaims", "entity": h["id"],
                "property": CAPACITY, "format": "json",
            }, headers={"User-Agent": UA}, timeout=TIMEOUT).json()
        except Exception:
            continue
        for claim in c.get("claims", {}).get(CAPACITY, []):
            try:
                amount = claim["mainsnak"]["datavalue"]["value"]["amount"]
                cap = int(float(str(amount).lstrip("+")))
            except (KeyError, TypeError, ValueError):
                continue
            if MIN_CAP <= cap <= MAX_CAP:
                return cap, label
    return None, "no capacity on any plausible match"
