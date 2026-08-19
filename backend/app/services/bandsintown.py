"""Bandsintown — an artist's own tour, including the festivals they are playing.

Why this source exists alongside Ticketmaster
---------------------------------------------
Ticketmaster's attraction lookup gives us the dates TM SELLS. Measured 2026-08-18,
RÜFÜS DU SOL's own site listed 37 dates while TM's attraction returned 15 — and the
22 missing ones were overwhelmingly festival appearances (Bonnaroo, Austin City
Limits, Outside Lands), which TM does not file under the artist. Bandsintown is
built around exactly that: one artist, every date, festivals included.

Access
------
The public endpoint answers 403 — `{"Message": "User is not authorized to access
this resource with an explicit deny in an identity-based policy"}` — for any
unregistered app_id. That is a missing credential, not a dead API: it needs an
app_id issued by Bandsintown. Until `settings.bandsintown_app_id` is filled in,
every function here returns empty and the caller falls back to Ticketmaster alone.

NOTE (2026-08-18): this module is written against Bandsintown's documented response
shape but has NOT been exercised against a live authorised response, because no
app_id exists yet AND this office network's FortiGate firewall is TLS-intercepting
bandsintown.com. Parsing is deliberately defensive: any field we cannot read becomes
None rather than a guess, and a malformed event is skipped instead of half-imported.
"""
from datetime import datetime, timezone

import httpx

from app.core.config import settings

BASE = "https://rest.bandsintown.com/artists"
_HEADERS = {"User-Agent": "MusicX/0.1 (music discovery app; dev)", "Accept": "application/json"}


def enabled() -> bool:
    """No registered app_id means no Bandsintown. Callers skip silently."""
    return bool(settings.bandsintown_app_id)


def fetch_artist_events(name: str) -> list:
    """Every upcoming date Bandsintown lists for this artist. [] when unavailable.

    Bandsintown matches on the artist NAME in the path, and its own catalogue is
    curated per artist, so there is no tribute-act problem of the kind Ticketmaster's
    keyword search has. An unknown artist simply returns an empty list.
    """
    if not enabled() or not name or name.strip().upper() in ("TBA", "VARIOUS"):
        return []
    try:
        r = httpx.get(
            f"{BASE}/{httpx.URL(path=name).path.lstrip('/')}/events",
            params={"app_id": settings.bandsintown_app_id, "date": "upcoming"},
            headers=_HEADERS, timeout=25,
        )
        if r.status_code != 200:
            print(f"[bandsintown] {name}: HTTP {r.status_code} — {r.text[:120]}")
            return []
        data = r.json()
    except Exception as e:
        print(f"[bandsintown] {name}: {type(e).__name__} {e}")
        return []
    return data if isinstance(data, list) else []


def _dt(value):
    if not value or not isinstance(value, str):
        return None
    try:
        when = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def to_common(raw: dict) -> dict | None:
    """One Bandsintown event flattened into the shape our ingest already speaks.

    Returns None when the payload lacks the two things an event cannot exist
    without — a date and a place. A half-known show is not a show.
    """
    if not isinstance(raw, dict):
        return None
    venue = raw.get("venue") or {}
    starts_at = _dt(raw.get("datetime"))
    venue_name = (venue.get("name") or "").strip() or None
    if not starts_at or not venue_name:
        return None

    lineup = [n for n in (raw.get("lineup") or []) if isinstance(n, str) and n.strip()]
    offers = raw.get("offers") or []
    ticket_url = next(
        (o.get("url") for o in offers
         if isinstance(o, dict) and o.get("type") == "Tickets" and o.get("url")),
        raw.get("url") or None,
    )
    # Bandsintown publishes a status per offer ("available" / "sold out"); we only
    # record what it actually says, and leave it out when it says nothing.
    status = next((o.get("status") for o in offers
                   if isinstance(o, dict) and o.get("status")), None)

    return {
        "source": "bandsintown",
        "source_event_id": str(raw["id"]) if raw.get("id") is not None else None,
        "url": ticket_url,
        "title": (raw.get("title") or "").strip() or (lineup[0] if lineup else venue_name),
        "starts_at": starts_at,
        "venue_name": venue_name,
        "city_name": (venue.get("city") or "").strip() or None,
        "country": ((venue.get("country") or "").strip() or None),
        "lat": venue.get("latitude"),
        "lng": venue.get("longitude"),
        "lineup": lineup,
        "offer_status": status,
        "description": (raw.get("description") or "").strip() or None,
    }


def artist_tour(name: str) -> list:
    """The artist's upcoming dates, already flattened. Malformed rows are dropped."""
    return [e for e in (to_common(r) for r in fetch_artist_events(name)) if e]
