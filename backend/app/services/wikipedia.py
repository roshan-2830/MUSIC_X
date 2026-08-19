"""Fetch a real, cited artist bio from Wikipedia — with disambiguation so we never
show a bio for the wrong namesake. Returns (bio, source, page_url), all None when we
can't confidently match a musician (trust rule: better nothing than wrong).

The page URL matters as much as the text: it is what lets a reader go and check the
original. We only ever return the URL of the page we actually read the bio from — we
never hand back a guessed /wiki/<Name> link that might be a different person."""
import httpx

_MUSIC_KEYWORDS = (
    "singer", "musician", "band", "rapper", "dj", "composer", "songwriter",
    "group", "duo", "producer", "guitarist", "drummer", "vocalist", "pianist",
    "rock", "pop", "metal", "hip hop", "record producer", "orchestra", "music",
)
_HEADERS = {"User-Agent": "MusicX/0.1 (music discovery app; dev)"}
_SEARCH = "https://en.wikipedia.org/w/rest.php/v1/search/page"
_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{}"


def fetch_artist_bio(name: str):
    """(bio_text, 'Wikipedia', page_url) for a musician, or (None, None, None)."""
    if not name or name.upper() in ("TBA", "VARIOUS"):
        return None, None, None
    try:
        r = httpx.get(_SEARCH, params={"q": name, "limit": 5}, headers=_HEADERS, timeout=20)
        r.raise_for_status()
        pages = r.json().get("pages", [])
    except Exception:
        return None, None, None

    # pick the first candidate whose short description looks musical
    pick = None
    for p in pages:
        desc = (p.get("description") or "").lower()
        if any(k in desc for k in _MUSIC_KEYWORDS):
            pick = p
            break
    if not pick:
        return None, None, None

    try:
        s = httpx.get(_SUMMARY.format(pick["key"]), headers=_HEADERS, timeout=20)
        s.raise_for_status()
        d = s.json()
    except Exception:
        return None, None, None

    if d.get("type") == "disambiguation" or not d.get("extract"):
        return None, None, None
    # the canonical URL of the very page this bio came from
    page_url = (((d.get("content_urls") or {}).get("desktop") or {}).get("page")
                or f"https://en.wikipedia.org/wiki/{pick['key']}")
    return d["extract"], "Wikipedia", page_url
