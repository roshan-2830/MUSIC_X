import re
import unicodedata

import httpx


def _norm(s: str) -> str:
    """Lowercase, strip accents + punctuation — so 'Beyoncé' == 'Beyonce' but
    'Coldplace' != 'Coldplay'."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def search_artists(q: str, limit: int = 20) -> list[dict]:
    """Search Deezer's global artist catalogue so users can follow ANY real artist —
    even ones with no show yet (which is exactly what powers 'alert me when they tour').
    Deezer returns results popularity-ranked, so the real act beats tribute bands."""
    try:
        r = httpx.get("https://api.deezer.com/search/artist",
                      params={"q": q, "limit": limit}, timeout=20)
        r.raise_for_status()
        items = r.json().get("data", [])
    except Exception:
        return []
    out = []
    for it in items:
        name = it.get("name")
        if not name:
            continue
        out.append({
            "name": name,
            "image_url": it.get("picture_medium") or it.get("picture") or None,
            "deezer_id": it.get("id"),
            "fans": it.get("nb_fan"),
        })
    # Deezer ranks by fuzzy relevance, so a 73-fan impostor can outrank the real Coldplay.
    # Re-rank by popularity so the act the user actually means comes first.
    out.sort(key=lambda a: a["fans"] or 0, reverse=True)
    return out


def artist_image(name: str) -> str | None:
    """Deezer photo for a NAME-MATCHED artist (no fuzzy fallback — same rule as fans,
    so 'Coldplace' never inherits Coldplay's photo). Used to enrich artist pages."""
    if not name:
        return None
    try:
        r = httpx.get("https://api.deezer.com/search/artist",
                      params={"q": name, "limit": 5}, timeout=20)
        r.raise_for_status()
        items = r.json().get("data", [])
        target = _norm(name)
        for it in items:
            if _norm(it.get("name")) == target:
                return it.get("picture_medium") or it.get("picture") or None
        return None
    except Exception:
        return None


def artist_fans(name: str) -> int | None:
    """Deezer fan count — ONLY when a returned artist's name actually matches.

    No fuzzy fallback: if Deezer's search for 'Coldplace' returns 'Coldplay', the
    names don't match, so we return None (no score) rather than letting a tribute
    inherit the real act's popularity.
    """
    if not name:
        return None
    try:
        r = httpx.get("https://api.deezer.com/search/artist",
                      params={"q": name, "limit": 5}, timeout=20)
        r.raise_for_status()
        items = r.json().get("data", [])
        target = _norm(name)
        for it in items:
            if _norm(it.get("name")) == target:
                return it.get("nb_fan")
        return None  # no confident name match → no fan data
    except Exception:
        return None
