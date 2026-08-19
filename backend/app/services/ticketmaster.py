from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import settings

BASE = "https://app.ticketmaster.com/discovery/v2/events.json"
EVENT_BY_ID = "https://app.ticketmaster.com/discovery/v2/events/{id}.json"


def fetch_event_by_id(tm_id: str):
    """Fetch ONE event by its Ticketmaster id — the precise way to re-verify a show we
    already have (its current status, date, price). Returns the event dict, or None if
    Ticketmaster no longer has it (404) or the call fails."""
    try:
        r = httpx.get(EVENT_BY_ID.format(id=tm_id),
                      params={"apikey": settings.ticketmaster_api_key}, timeout=20)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def fetch_music_events(size: int = 100, months: int = 12, pages_per_window: int = 3):
    """BROAD SWEEP for concerts — walks forward a month at a time.

    The old version asked ONE question — "music events from now, soonest first" — and
    took 5 pages. Measured 2026-08-18: the 500th soonest music event worldwide was two
    days away, so the sweep never saw past ~48 hours. Three days later those events had
    all happened and it fetched the next two days. That is why 1,103 of our 1,441
    concerts sat in a single month and only 513 were still upcoming, while Ticketmaster
    had 10,000+ upcoming worldwide. We were seeing ~5% of the catalogue, always the same
    nearest slice.

    Two limits shape the fix, the same ones the festival sweep hit:
      • Ticketmaster refuses `page * size >= 1000`, so one query can never return more
        than ~1,000 events however many pages you ask for.
      • Sorting by date and taking the first pages only ever returns the soonest events.

    So we ask a separate question per month. `pages_per_window` caps how deep we go in
    each: the point is BREADTH across the year, not exhausting any single month. At the
    defaults that is up to ~3,600 events spread over 12 months, instead of 500 crammed
    into two days.
    """
    seen: dict = {}
    cursor = datetime.now(timezone.utc)
    for _ in range(months):
        window_end = cursor + timedelta(days=31)
        for page in range(pages_per_window):
            if page * size >= 1000:          # Ticketmaster's hard pagination ceiling
                break
            params = {
                "apikey": settings.ticketmaster_api_key,
                "classificationName": "music",
                "startDateTime": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "endDateTime": window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sort": "date,asc",
                "size": size,
                "page": page,
            }
            try:
                r = httpx.get(BASE, params=params, timeout=30)
                r.raise_for_status()
                data = r.json()
            except Exception:
                break                        # one bad window must not kill the sweep
            evs = ((data.get("_embedded") or {}).get("events") or [])
            for e in evs:
                if e.get("id"):
                    seen.setdefault(e["id"], e)
            total_pages = (data.get("page") or {}).get("totalPages", 1)
            if page + 1 >= total_pages or not evs:
                break
        cursor = window_end
    return list(seen.values())


def search_music_events(keyword: str, size: int = 20):
    """Search Ticketmaster's live catalogue for upcoming music events by keyword."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {
        "apikey": settings.ticketmaster_api_key,
        "classificationName": "music",
        "keyword": keyword,
        "startDateTime": now,      # upcoming only
        "sort": "relevance,desc",  # best keyword matches first
        "size": size,              # cap results (keeps scoring fast)
    }
    r = httpx.get(BASE, params=params, timeout=30)
    r.raise_for_status()
    return r.json().get("_embedded", {}).get("events", [])


def search_festivals(size: int = 100, months: int = 12, pages_per_window: int = 10):
    """BROAD SWEEP for festivals — the same shape as the concert sweep, but windowed.

    The old version asked once and took the first 2 pages: 200 events out of the 1,667
    Ticketmaster actually lists, which is why our festivals table had 55 rows.

    Two limits force the windowing:
      • Ticketmaster refuses `page * size >= 1000`, so ONE query can never yield more
        than ~1,000 events however many pages you ask for.
      • Sorting by date then taking the first pages only ever returns the soonest
        festivals — everything past that horizon is invisible.

    So we walk forward a month at a time and paginate inside each window. Same event
    can appear in two windows (multi-day festivals straddle a month end), so results
    are de-duplicated by Ticketmaster id before returning.

    NOTE: Bonnaroo, Outside Lands and ACL are NOT reachable this way — measured
    2026-08-18, Ticketmaster returns 0 results for them because they sell through
    their own platforms, not TM. No amount of sweeping finds what the source lacks.
    """
    seen: dict = {}
    cursor = datetime.now(timezone.utc)
    for _ in range(months):
        window_end = cursor + timedelta(days=31)
        for page in range(pages_per_window):
            if page * size >= 1000:          # Ticketmaster's hard pagination ceiling
                break
            params = {
                "apikey": settings.ticketmaster_api_key,
                "classificationName": "music",
                "keyword": "festival",
                "startDateTime": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "endDateTime": window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sort": "date,asc",
                "size": size,
                "page": page,
            }
            try:
                r = httpx.get(BASE, params=params, timeout=30)
                r.raise_for_status()
                data = r.json()
            except Exception:
                break                        # a bad window must not kill the sweep
            evs = ((data.get("_embedded") or {}).get("events") or [])
            for e in evs:
                if e.get("id"):
                    seen.setdefault(e["id"], e)
            total_pages = (data.get("page") or {}).get("totalPages", 1)
            if page + 1 >= total_pages or not evs:
                break
        cursor = window_end
    return list(seen.values())


# ---------------------------------------------------------------------------
# One artist's whole tour, by ATTRACTION id
#
# Keyword search finds events whose TITLE mentions a name, which is how tribute
# acts end up on a real artist's page. An attraction is Ticketmaster's own entity
# for the performer, so asking for "every event by attraction X" is asking the
# seller directly: what is this act's tour?
#
# The catch, measured 2026-08-18: searching attractions for "Coldplay" returns ten
# hits, and the five with UPCOMING DATES are all tribute bands — "Ultimate Coldplay",
# "A Rush of Coldplay", "Liveplay". The real Coldplay attraction has zero upcoming
# events, because they genuinely have no Ticketmaster dates right now. So ranking by
# event count picks the tribute every time.
#
# The only safe rule is an EXACT name match (accent- and punctuation-insensitive).
# No exact match means no dates — an empty tour is the truth, and far better than a
# club tour by a covers band presented as the real thing.
# ---------------------------------------------------------------------------
ATTRACTIONS = "https://app.ticketmaster.com/discovery/v2/attractions.json"


def artist_attraction(name: str) -> dict | None:
    """Ticketmaster's own entity for this performer, or None if we can't be sure."""
    from app.services.deezer import _norm

    if not name or name.strip().upper() in ("TBA", "VARIOUS"):
        return None
    try:
        r = httpx.get(ATTRACTIONS, params={
            "apikey": settings.ticketmaster_api_key,
            "keyword": name, "classificationName": "music", "size": 20,
        }, timeout=25)
        r.raise_for_status()
        hits = ((r.json().get("_embedded") or {}).get("attractions") or [])
    except Exception:
        return None

    target = _norm(name)
    for a in hits:
        if _norm(a.get("name") or "") == target:
            return a
    return None


def fetch_artist_events(attraction_id: str, size: int = 100, pages: int = 3) -> list:
    """Every upcoming event Ticketmaster lists for this attraction, soonest first."""
    out = []
    for page in range(pages):
        try:
            r = httpx.get(BASE, params={
                "apikey": settings.ticketmaster_api_key,
                "attractionId": attraction_id, "size": size,
                "page": page, "sort": "date,asc",
            }, timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception:
            break
        batch = ((data.get("_embedded") or {}).get("events") or [])
        out.extend(batch)
        total_pages = (data.get("page") or {}).get("totalPages", 1)
        if page + 1 >= total_pages or not batch:
            break
    return out
