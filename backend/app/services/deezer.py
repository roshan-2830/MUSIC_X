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

    # Collapse Deezer's OWN duplicates. Their catalogue files one artist under several
    # spellings — searching "AR Rahman" returns A.R. Rahman (283,680 fans), A. R. Rahman
    # (10,363), A.R.Rahman (6,379), AR Rahman (3,209), A R Rahman (2,191) and A.R Rahman
    # (107): six entries, one man. Showing all six asks the user to guess which is real,
    # which is the opposite of what this app promises. Sorted by fans above, so the first
    # of each normalised name is the entry the audience is actually on.
    seen, unique = set(), []
    for a in out:
        k = _norm(a["name"])
        if k in seen:
            continue
        seen.add(k)
        unique.append(a)
    return unique


def artist_image(name: str) -> str | None:
    """Deezer photo for a NAME-MATCHED artist (no fuzzy fallback — same rule as fans,
    so 'Coldplace' never inherits Coldplay's photo). Used to enrich artist pages."""
    if not name:
        return None
    try:
        r = httpx.get("https://api.deezer.com/search/artist",
                      params={"q": name, "limit": 10}, timeout=20)
        r.raise_for_status()
        items = r.json().get("data", [])
        target = _norm(name)
        # The MOST FOLLOWED exact match, not the first one Deezer happens to list. Their
        # result order is not stable and their catalogue holds several entries per artist,
        # so "first match" was effectively picking at random among them — and a minor
        # duplicate's photo is often a worse or wrong crop.
        best = None
        for it in items:
            if _norm(it.get("name")) == target:
                if best is None or (it.get("nb_fan") or 0) > (best.get("nb_fan") or 0):
                    best = it
        if best is None:
            return None
        return best.get("picture_medium") or best.get("picture") or None
    except Exception:
        return None


def artist_fans(name: str) -> int | None:
    """Deezer fan count — ONLY when a returned artist's name actually matches.

    No fuzzy fallback: if Deezer's search for 'Coldplace' returns 'Coldplay', the
    names don't match, so we return None (no score) rather than letting a tribute
    inherit the real act's popularity.

    Among matches we take the MOST FOLLOWED, because Deezer files one artist under
    several spellings and does not order results predictably. Measured 2026-08-24: this
    had stored 6,379 fans for A.R. Rahman — Deezer id 173750, a minor duplicate — when
    the real entry (id 491) has 283,680. MXS reads this column to decide stature, so
    "whichever duplicate came back first" was scoring him at 2% of his audience.
    """
    if not name:
        return None
    try:
        r = httpx.get("https://api.deezer.com/search/artist",
                      params={"q": name, "limit": 10}, timeout=20)
        r.raise_for_status()
        items = r.json().get("data", [])
        target = _norm(name)
        best = None
        for it in items:
            if _norm(it.get("name")) == target:
                fans = it.get("nb_fan") or 0
                if best is None or fans > best:
                    best = fans
        return best  # None when no confident name match → no fan data
    except Exception:
        return None
