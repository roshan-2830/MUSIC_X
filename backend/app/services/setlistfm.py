"""Reading somebody's attended concerts from setlist.fm.

setlist.fm records which gigs a person says they were at. That is exactly the history the
Concert Passport cannot otherwise know, because the passport only starts the day you install
this app — everything before it is invisible.

TWO THINGS THIS FILE IS CAREFUL ABOUT.

1. eventDate is DD-MM-YYYY, not ISO. "03-04-2024" is the 3rd of April, and reading it as a date
   string would file it in March. Parsed explicitly, never with a general-purpose parser.

2. A username is not proof. Anyone can type anyone's, so a raw import would let someone inherit
   a stranger's history — and a passport that can be inherited is worth nothing, which is the
   whole reason the passport refuses manual entry. Entries are therefore written with
   source="setlist_fm" and the setlist URL as evidence, and it is the CALLER's job to have
   established that the account belongs to the person importing it.
"""
import time
from datetime import date, datetime

import httpx

from app.core.config import settings

BASE = "https://api.setlist.fm/rest/1.0"
PAGE_SIZE = 20          # fixed by the API, not a choice
TIMEOUT = 20.0
# A courtesy ceiling. Somebody with a decade of gigs has a few hundred, not thousands, and an
# unbounded loop against someone else's free API is how a key gets revoked.
MAX_PAGES = 40
# THEY RATE-LIMIT, and the docs never say by how much. A survey of about ten quick calls earned
# a 429, so requests are spaced and a 429 is waited out rather than hammered. Measured, not
# guessed — and the alternative is a key that stops working mid-import for reasons nobody
# recorded.
MIN_GAP = 0.6          # seconds between calls
RETRY_AFTER = 2.0      # how long to wait out a 429, doubling
_last_call = 0.0


def _throttled_get(url: str, params: dict | None = None, tries: int = 3):
    """One request, politely spaced, retrying a 429 with a widening gap."""
    global _last_call
    delay = RETRY_AFTER
    for attempt in range(tries):
        gap = time.monotonic() - _last_call
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        _last_call = time.monotonic()
        r = httpx.get(url, headers=_headers(), params=params, timeout=TIMEOUT)
        if r.status_code != 429:
            return r
        if attempt < tries - 1:
            print(f"[setlistfm] rate limited, waiting {delay}s")
            time.sleep(delay)
            delay *= 2
    return r


def configured() -> bool:
    return bool(getattr(settings, "setlistfm_api_key", ""))


def _headers() -> dict:
    return {"x-api-key": settings.setlistfm_api_key, "Accept": "application/json"}


def _event_date(raw: str | None) -> date | None:
    """DD-MM-YYYY -> date. Returns None rather than guessing at anything else."""
    if not raw:
        return None
    try:
        return datetime.strptime(raw.strip(), "%d-%m-%Y").date()
    except ValueError:
        return None


def _flatten(sl: dict) -> dict:
    """One setlist as the passport needs it."""
    venue = sl.get("venue") or {}
    city = venue.get("city") or {}
    country = city.get("country") or {}
    return {
        "setlist_id": sl.get("id"),
        "artist_name": (sl.get("artist") or {}).get("name"),
        "venue_name": venue.get("name"),
        "city": city.get("name"),
        # Two letters, the same shape the passport's stamp wall expects.
        "country": (country.get("code") or "").upper()[:2] or None,
        "seen_on": _event_date(sl.get("eventDate")),
        "url": sl.get("url"),
        "tour": (sl.get("tour") or {}).get("name"),
    }


def get_user(username: str) -> dict | None:
    """The public profile. Used to check the account exists before anything else."""
    if not configured():
        return None
    try:
        r = _throttled_get(f"{BASE}/user/{username}")
    except Exception as e:
        print(f"[setlistfm] unreachable: {type(e).__name__}")
        return None
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        print(f"[setlistfm] user {r.status_code}")
        return None
    return r.json()


def attended(username: str, max_pages: int = MAX_PAGES) -> list:
    """Every setlist this person has marked as attended, oldest page first.

    Returns [] both when there are none and when the call fails — the caller must not treat an
    empty result as "this person has been to no concerts" and write anything on the strength
    of it.
    """
    if not configured():
        return []
    out, page = [], 1
    while page <= max_pages:
        try:
            r = _throttled_get(f"{BASE}/user/{username}/attended", {"p": page})
        except Exception as e:
            print(f"[setlistfm] page {page} unreachable: {type(e).__name__}")
            break
        if r.status_code == 404:
            break                      # no attended setlists at all
        if r.status_code != 200:
            print(f"[setlistfm] attended page {page}: HTTP {r.status_code}")
            break
        body = r.json() or {}
        rows = body.get("setlist") or []
        out.extend(_flatten(s) for s in rows)
        total = int(body.get("total") or 0)
        if len(out) >= total or not rows:
            break
        page += 1
    return out
