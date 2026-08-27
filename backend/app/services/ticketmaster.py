from datetime import datetime, timedelta, timezone

import time

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
                    # No _mx_keyword here: this is the BROAD sweep, which asks no keyword at
                    # all. A stray `e["_mx_keyword"] = kw` copied from the festival search
                    # raised NameError on every run — and because the caller catches broadly
                    # ("one bad window must not kill the sweep"), it surfaced only as
                    # "[sweep] concerts: 0" with an error line. _is_festival_listing already
                    # reads this with .get(), so absent is the correct state.
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


# Ticketmaster answers about up to 200 events in ONE request when their ids are passed
# together — verified live: 200 ids returned 200 events for a single call, and the payload is
# byte-identical in shape to the one-at-a-time endpoint (same 15 keys, same status, dates,
# timezone, prices, venue and line-up).
#
# 150, not 200, on purpose. 200 ids is a 3,189-character URL, which worked but sits close
# enough to what proxies and CDNs truncate that a silent loss is conceivable, and the whole
# point of this pass is trusting what came back. The margin costs 11 extra requests across the
# entire catalogue.
REVERIFY_BATCH = 150


def fetch_events_by_ids(tm_ids: list, *, delay_seconds: float = 0.2) -> tuple:
    """Full payloads for many events at once.

    (raws, unchecked_ids, requests). Replaces one request per event, which is what made a full
    re-verify impossible: 6,386 upcoming shows needed 6,386 requests against a quota of 5,000 a
    day, so the pass was capped at the soonest 2,000 and everything beyond about two months went
    unchecked for weeks. The same work is now ~43 requests.

    MISSING AND UNCHECKED ARE DIFFERENT ANSWERS and the caller must keep them apart. An id that
    is absent from a successful response is genuinely gone from Ticketmaster — verified: a batch
    containing an unknown id still returns HTTP 200 with every valid event and simply omits the
    bad one, so one dead show cannot spoil the rest. But a batch whose REQUEST failed says
    nothing about any of its 150 events, and counting those as gone would report a network blip
    as 150 cancellations.
    """
    raws, unchecked, requests = [], [], 0
    for start in range(0, len(tm_ids), REVERIFY_BATCH):
        chunk = tm_ids[start:start + REVERIFY_BATCH]
        got = None
        for attempt in (1, 2):
            try:
                requests += 1
                r = httpx.get(BASE, params={
                    "id": ",".join(chunk),
                    "size": REVERIFY_BATCH,
                    "apikey": settings.ticketmaster_api_key,
                }, timeout=40)
                r.raise_for_status()
                got = ((r.json().get("_embedded") or {}).get("events") or [])
                break
            except Exception as e:
                if attempt == 2:
                    print(f"[refresh] batch {start//REVERIFY_BATCH + 1} failed twice: "
                          f"{type(e).__name__}")
                else:
                    time.sleep(1.5)
        if got is None:
            unchecked.extend(chunk)
            continue
        raws.extend(got)
        # What was asked for and not returned is worked out by the caller, against the ids it
        # asked for minus the ids that came back minus the ones it knows went unchecked.
        time.sleep(delay_seconds)
    return raws, unchecked, requests


# Festival discovery is keyword-only, and that is a limit of the source rather than a
# choice. Measured 2026-08-25 against 200 music events: `classifications[].type` and
# `subType` are "Undefined" on every one, `dates.spanMultipleDays` is false on every one,
# and passing `subType=Festival` is silently ignored — it returns the whole catalogue led
# by "Eagles Live at Sphere". Ticketmaster exposes no structural festival flag, so there is
# nothing to filter on but the name.
#
# Which is why this list exists. "festival" alone found 1,587 listings and missed Amsterdam
# Dance Event entirely — ADE has 21 events on Ticketmaster and not one of them says
# "festival". The generic terms below are the broad net; the named ones are the festivals
# big enough that missing them is embarrassing and whose names carry no generic word.
#
# This is a curated allowlist, and the difference from a blocklist matters: a blocklist has
# to enumerate everything bad and can never keep up, while every entry here is a festival
# somebody confirmed exists. It will always be incomplete, and adding a name is the honest
# way to fix a specific gap. What it must never become is a guess — "ade" as a substring
# would match Parade, Decade and Renegade, so it is sent as a keyword to Ticketmaster's own
# search rather than matched against titles ourselves.
FESTIVAL_KEYWORDS = (
    # generic — the broad net, and the only terms allowed to qualify a listing on their own
    "festival", "fest", "weekender", "all dayer", "carnival", "jamboree",
    # Named festivals, for the ones whose LISTINGS carry no generic word — Creamfields
    # sells "Creamfields 2026 - Parking - Weekend Camping", which says nothing about a
    # festival. A name here vouches for a listing, so every entry must be a distinctive
    # proper noun.
    #
    # Measured 2026-08-25, these were REMOVED for being common words or place names, and
    # the damage each did is why the rule is now "distinctive or not at all":
    #   Leeds, Reading   -> cities. "An Afternoon of Indie LEEDS", "Breakin Science ... Leeds"
    #   Latitude         -> "Changes In Latitudes"
    #   Boomtown         -> "Boomtown Rats", a band
    #   Ultra            -> "54 Ultra - LIVE IN EU"
    #   Movement, Download, Exit, Wireless, EDC -> ordinary English
    #   ADE              -> matched the venue attraction "Ademelkweg" on 18 club nights
    # None of them were needed: 'Reading Festival 2026' and 'Download Festival' already
    # match the generic net. A name only earns a place here if the generic net CANNOT
    # find it.
    # Each of these was MEASURED (2026-08-25) by asking Ticketmaster and counting the
    # listings it rescues — ones that name the festival but carry no generic word, so the
    # broad net cannot reach them:
    #   Download    30 rescued, all "Download 2027 - <ticket type>". Without it Download
    #               Festival is absent from the app entirely — not one of its listings
    #               says "festival".
    #   Latitude    28, "Latitude Luxury 2027 - ...". EDC 14, "EDC Orlando".
    #   Time Warp   19.  DGTL 1.
    # And these were tried and REJECTED on the same measurement, because what they rescued
    # was not the festival:
    #   Movement 58 -> "Improvement Movement".  Ultra 17 -> "Ultra Sunn", "54 Ultra".
    #   Boomtown 2 -> "Boomtown Rats".  Leeds 10 -> "Day Fever - Leeds" (a city).
    #   Exit 7 -> "Last Exit", "Slow Exit".  ADE 7 -> club nights, which are concerts.
    #   Awakenings, Sonar, Lowlands, Wireless, Sonic Temple -> 0 rescued, so no loss.
    # A name belongs here only if the generic net cannot find the festival AND what it
    # drags in is the festival rather than something that shares a word with it.
    "Creamfields", "Tomorrowland", "Glastonbury", "Coachella", "Lollapalooza",
    "Bonnaroo", "Roskilde", "Sziget", "Pukkelpop", "Pinkpop", "Wacken", "Hellfest",
    "Dekmantel", "Primavera Sound", "Kappa Futur", "Rock Werchter", "Parklife",
    "Download", "Latitude", "EDC", "Time Warp", "DGTL",
)


def search_festivals(size: int = 100, months: int = 12, pages_per_window: int = 10,
                     deep: bool = False):
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
    calls = 0
    # Tiered, because breadth costs requests and the quota is 5,000 a DAY shared with the
    # nightly re-verify. This runs from the 3-hourly sweep AND the daily refresh — nine
    # times a day — so asking every keyword every time came to ~7,100 requests and would
    # have silently exhausted the quota. The two cheap generics run every time; the long
    # tail and the named festivals run once a day, from refresh_catalogue.
    generic = [k for k in FESTIVAL_KEYWORDS if k.islower()]
    if not deep:
        generic = [k for k in generic if k in ("festival", "fest")]
    named = [k for k in FESTIVAL_KEYWORDS if not k.islower()] if deep else []

    for kw in named:
        for page in range(2):
            params = {
                "apikey": settings.ticketmaster_api_key,
                "classificationName": "music",
                "keyword": kw,
                "startDateTime": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sort": "date,asc",
                "size": size,
                "page": page,
            }
            try:
                calls += 1
                r = httpx.get(BASE, params=params, timeout=30)
                r.raise_for_status()
                data = r.json()
            except Exception:
                break
            evs = ((data.get("_embedded") or {}).get("events") or [])
            for e in evs:
                if e.get("id"):
                    # Remember WHICH keyword found this. The ingest needs it: a listing
                    # called 'Creamfields 2026 - Parking' is a festival because we asked
                    # for Creamfields, and nothing in its title says so.
                    e["_mx_keyword"] = kw
                    seen.setdefault(e["id"], e)
            if page + 1 >= (data.get("page") or {}).get("totalPages", 1) or not evs:
                break

    cursor = datetime.now(timezone.utc)
    for _ in range(months):
        window_end = cursor + timedelta(days=31)
        for kw in generic:
          # "festival" is the one that genuinely has hundreds per month; the rest are a
          # long tail and paging them ten deep spends requests on empty pages.
          for page in range(pages_per_window if kw == "festival" else 3):
            if page * size >= 1000:          # Ticketmaster's hard pagination ceiling
                break
            params = {
                "apikey": settings.ticketmaster_api_key,
                "classificationName": "music",
                "keyword": kw,
                "startDateTime": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "endDateTime": window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sort": "date,asc",
                "size": size,
                "page": page,
            }
            try:
                calls += 1
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
    print(f"[festivals] sweep {'deep' if deep else 'light'}: {calls} Ticketmaster requests, "
          f"{len(seen)} distinct listings")
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
