"""One-time backfill: fetch each existing Ticketmaster event by id and fill in image_url."""
import time

import httpx

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.event import Event
from app.models.event_source import EventSource
from app.services.ingestion import _pick_image

BASE = "https://app.ticketmaster.com/discovery/v2/events/{}.json"


def backfill():
    db = SessionLocal()
    updated = skipped = failed = 0
    try:
        rows = (
            db.query(Event, EventSource)
            .join(EventSource, EventSource.event_id == Event.id)
            .filter(EventSource.source == "ticketmaster")
            .filter(Event.image_url.is_(None))
            .all()
        )
        total = len(rows)
        print(f"events to backfill: {total}", flush=True)
        for i, (ev, src) in enumerate(rows, 1):
            try:
                r = httpx.get(
                    BASE.format(src.source_event_id),
                    params={"apikey": settings.ticketmaster_api_key},
                    timeout=30,
                )
                if r.status_code == 404:
                    skipped += 1
                else:
                    r.raise_for_status()
                    img = _pick_image(r.json().get("images"))
                    if img:
                        ev.image_url = img
                        updated += 1
                    else:
                        skipped += 1
            except Exception:
                failed += 1
            time.sleep(0.22)  # stay under Ticketmaster's rate limit
            if i % 25 == 0:
                db.commit()
                print(f"  {i}/{total} — {updated} updated, {skipped} skipped, {failed} failed", flush=True)
        db.commit()
    finally:
        db.close()
    print(f"DONE — {updated} updated, {skipped} skipped, {failed} failed", flush=True)


if __name__ == "__main__":
    backfill()
