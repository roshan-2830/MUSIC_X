from datetime import datetime, timezone

import httpx

from app.core.config import settings

BASE = "https://app.ticketmaster.com/discovery/v2/events.json"


def fetch_music_events(size: int = 100, pages: int = 5):
    """Fetch several pages of upcoming music events (bigger, broader set)."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = []
    for page in range(pages):
        params = {
            "apikey": settings.ticketmaster_api_key,
            "classificationName": "music",
            "startDateTime": now,
            "sort": "date,asc",
            "size": size,
            "page": page,
        }
        r = httpx.get(BASE, params=params, timeout=30)
        r.raise_for_status()
        evs = r.json().get("_embedded", {}).get("events", [])
        if not evs:
            break
        out.extend(evs)
    return out
