"""Fetch a venue's max capacity from Wikidata (P1083) — a real, structured signal
for the MXS Venue component. Disambiguated (the matched entity must *look* like a
venue) so we never attach the wrong building's capacity. Returns None when there's
no confident match — coverage is partial (great for arenas/stadiums, thin for
small clubs), which is fine: the Venue component is simply omitted when unknown.
"""
import httpx

_API = "https://www.wikidata.org/w/api.php"
_HEADERS = {"User-Agent": "MusicX/0.1 (music discovery app; dev)"}
_VENUE_WORDS = (
    "arena", "stadium", "venue", "hall", "theatre", "theater", "amphitheater",
    "amphitheatre", "auditorium", "centre", "center", "club", "ballroom", "pavilion",
    "colosseum", "coliseum", "bowl", "dome", "forum", "garden", "field", "park",
    "music", "concert", "opera", "arts", "grounds", "racecourse", "convention",
)


def venue_capacity(name: str):
    """Return the venue's maximum capacity (int) or None."""
    if not name:
        return None
    try:
        r = httpx.get(_API, params={
            "action": "wbsearchentities", "search": name, "language": "en",
            "type": "item", "limit": 6, "format": "json",
        }, headers=_HEADERS, timeout=20)
        r.raise_for_status()
        hits = r.json().get("search", [])
    except Exception:
        return None

    pick = next((h for h in hits if any(w in (h.get("description") or "").lower() for w in _VENUE_WORDS)), None)
    if not pick:
        return None

    try:
        c = httpx.get(_API, params={
            "action": "wbgetclaims", "entity": pick["id"], "property": "P1083", "format": "json",
        }, headers=_HEADERS, timeout=20)
        c.raise_for_status()
        claims = c.json().get("claims", {}).get("P1083", [])
    except Exception:
        return None

    for cl in claims:
        try:
            cap = int(float(cl["mainsnak"]["datavalue"]["value"]["amount"]))
            if cap > 0:
                return cap
        except (KeyError, TypeError, ValueError):
            continue
    return None


# --- the artist's own website (P856) ----------------------------------------
# An official site is the artist's own words about themselves, so it is worth
# linking above Wikipedia. Same disambiguation discipline as venue_capacity: the
# matched entity has to LOOK like a musician, or we return nothing rather than
# risk linking a footballer's homepage on a singer's page.
_MUSIC_WORDS = (
    "singer", "musician", "band", "rapper", "dj", "composer", "songwriter",
    "group", "duo", "producer", "guitarist", "drummer", "vocalist", "pianist",
    "rock", "pop", "metal", "hip hop", "record producer", "orchestra", "music",
    "artist", "performer", "ensemble", "trio", "quartet", "rock band",
)


def artist_official_site(name: str):
    """(url_or_None, looked_up_ok).

    Two different "no URL" cases have to be told apart, or we cache a lie:

      (None, True)  — we asked Wikidata and it genuinely has no official site for
                      this artist. Safe to remember, so we stop asking.
      (None, False) — the lookup itself failed (timeout, rate limit, bad response).
                      We know nothing. Do NOT record this as "no website", or one
                      throttled request permanently blanks a real artist's link.

    Wikidata rate-limits happily, and this exact case bit during development: Weezer
    came back empty on one call and returned http://www.weezer.com on the next.
    """
    if not name or name.upper() in ("TBA", "VARIOUS"):
        return None, True
    try:
        r = httpx.get(_API, params={
            "action": "wbsearchentities", "search": name, "language": "en",
            "type": "item", "limit": 6, "format": "json",
        }, headers=_HEADERS, timeout=20)
        r.raise_for_status()
        hits = r.json().get("search", [])
    except Exception:
        return None, False

    pick = next((h for h in hits
                 if any(w in (h.get("description") or "").lower() for w in _MUSIC_WORDS)), None)
    if not pick:
        return None, True          # no musician by that name on Wikidata

    try:
        c = httpx.get(_API, params={
            "action": "wbgetclaims", "entity": pick["id"], "property": "P856", "format": "json",
        }, headers=_HEADERS, timeout=20)
        c.raise_for_status()
        claims = c.json().get("claims", {}).get("P856", [])
    except Exception:
        return None, False

    for cl in claims:
        # Wikidata marks superseded values "deprecated" — that is the community
        # saying "this used to be the site". Linking it would send fans to a dead
        # or resold domain, so we take the current one only.
        if cl.get("rank") == "deprecated":
            continue
        url = (cl.get("mainsnak", {}).get("datavalue", {}) or {}).get("value")
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            return url, True
    return None, True
