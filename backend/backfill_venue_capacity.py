"""One-time: fetch Wikidata capacity for the venues of upcoming events."""
import time
from datetime import datetime, timezone
from app.db.session import SessionLocal
from app.models.event import Event
from app.models.venue import Venue
from app.services.wikidata import venue_capacity

def _save(vid, cap):
    for attempt in range(3):
        s = SessionLocal()
        try:
            v = s.get(Venue, vid)
            if v:
                v.capacity = cap
                s.commit()
            s.close()
            return
        except Exception:
            s.rollback(); s.close()
            if attempt == 2:
                return
            time.sleep(0.5)

def backfill():
    db = SessionLocal()
    cut = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (db.query(Venue.id, Venue.name)
            .join(Event, Event.venue_id == Venue.id)
            .filter((Event.starts_at >= cut) | (Event.starts_at.is_(None)))
            .filter(Venue.capacity.is_(None)).distinct().all())
    db.close()
    total = len(rows); print(f"venues to look up: {total}", flush=True)
    found = none = 0
    for i, (vid, name) in enumerate(rows, 1):
        cap = venue_capacity(name)
        if cap:
            _save(vid, cap); found += 1
        else:
            none += 1
        time.sleep(0.35)
        if i % 25 == 0:
            print(f"  {i}/{total} — {found} found, {none} none", flush=True)
    print(f"DONE — {found} with capacity, {none} none", flush=True)

if __name__ == "__main__":
    backfill()
