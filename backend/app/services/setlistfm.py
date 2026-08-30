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
from datetime import date, datetime, timezone

import httpx

from app.core.config import settings

BASE = "https://api.setlist.fm/rest/1.0"
PAGE_SIZE = 20          # fixed by the API, not a choice
TIMEOUT = 20.0
# A courtesy ceiling. Somebody with a decade of gigs has a few hundred, not thousands, and an
# unbounded loop against someone else's free API is how a key gets revoked.
# The published limits for a standard key: 2.0 requests/second and 1440 per DAY.
#
# The per-second limit is the easy one. The DAILY one is the constraint that shapes this file,
# because 1440 is not per person — it is the whole app's allowance, shared by everyone. One
# enthusiast with 800 logged gigs would spend 41 of them; forty such imports would spend the
# day's entire budget and every later user would silently get nothing.
PER_SECOND = 2.0
DAILY_BUDGET = 1440
MIN_GAP = 1.0 / PER_SECOND + 0.1      # a little under the limit, not exactly on it
RETRY_AFTER = 2.0                      # how long to wait out a 429, doubling

# 20 setlists a page, so 40 pages is 800 shows — more than almost anybody has logged, and a
# ceiling on what one import can cost the shared allowance.
MAX_PAGES = 40
# Reserve some of the day for everyone else: one import may not take the last of it.
RESERVE = 200

_last_call = 0.0
_spent_on = None       # the UTC date the counter belongs to
_spent = 0


def budget_left() -> int:
    """How many calls are left today. Resets on the UTC day boundary.

    In-process, so it resets on deploy and is per-instance — deliberately simple, because it
    exists to stop a runaway loop, not to be an exact ledger. If this ever runs on more than
    one instance it will need to move into the database.
    """
    global _spent_on, _spent
    today = datetime.now(timezone.utc).date()
    if _spent_on != today:
        _spent_on, _spent = today, 0
    return DAILY_BUDGET - _spent


def _throttled_get(url: str, params: dict | None = None, tries: int = 3):
    """One request, politely spaced, retrying a 429 with a widening gap.

    Returns None when the day's allowance is gone, which callers must treat as "unknown",
    never as "this person has no concerts".
    """
    global _last_call, _spent
    if budget_left() <= 0:
        print("[setlistfm] daily budget spent")
        return None
    delay = RETRY_AFTER
    for attempt in range(tries):
        gap = time.monotonic() - _last_call
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        _last_call = time.monotonic()
        _spent += 1
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
    if r is None:
        return None
    if r.status_code == 404:
        return None
    if r.status_code != 200:
        print(f"[setlistfm] user {r.status_code}")
        return None
    return r.json()


def attended(username: str, max_pages: int = MAX_PAGES) -> tuple[list, bool]:
    """(setlists, complete). Every setlist this person has marked as attended.

    COMPLETE IS NOT DECORATION. A passport built from half of somebody's history is worse than
    no passport: they see 20 of their 300 gigs, believe that is the record, and the stamp wall
    quietly lies about which countries they have been to. So a caller must write NOTHING unless
    complete is True — an empty list with complete False means "we do not know", never "they
    have been to no concerts".
    """
    if not configured():
        return [], False
    # Never spend the last of the day on one person. If there is not enough left to finish a
    # reasonable history, refuse outright rather than return a convincing fragment.
    affordable = budget_left() - RESERVE
    if affordable < 2:
        print("[setlistfm] not enough daily budget left to import safely")
        return [], False
    max_pages = min(max_pages, affordable)
    out, page = [], 1
    while page <= max_pages:
        try:
            r = _throttled_get(f"{BASE}/user/{username}/attended", {"p": page})
        except Exception as e:
            print(f"[setlistfm] page {page} unreachable: {type(e).__name__}")
            return out, False
        if r is None:
            return out, False          # out of budget mid-fetch — what we have is a fragment
        if r.status_code == 404:
            return out, True           # a real answer: this person has none
        if r.status_code != 200:
            print(f"[setlistfm] attended page {page}: HTTP {r.status_code}")
            return out, False
        body = r.json() or {}
        rows = body.get("setlist") or []
        out.extend(_flatten(s) for s in rows)
        total = int(body.get("total") or 0)
        if len(out) >= total or not rows:
            return out, True           # reached the end the API itself declared
        page += 1
    # Ran out of pages before running out of history.
    return out, False
