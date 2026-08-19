"""One-time backfill: fetch a Wikipedia bio for every artist who headlines an event.
Paced to respect Wikipedia's rate limit. Safe to re-run — only touches artists whose
bio is still NULL. Stores nothing when there's no confident musician match."""
import time

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.models.event import Event
from app.services.wikipedia import fetch_artist_bio


def _save(artist_id, bio, source):
    for attempt in range(3):
        s = SessionLocal()
        try:
            a = s.get(Artist, artist_id)
            if a is not None:
                a.bio = bio
                a.bio_source = source
                s.commit()
            s.close()
            return True
        except Exception:
            s.rollback()
            s.close()
            if attempt == 2:
                return False
            time.sleep(0.6)


def backfill():
    db = SessionLocal()
    # distinct headliner artists that don't have a bio yet
    rows = (
        db.query(Artist.id, Artist.name)
        .join(Event, Event.headliner_artist_id == Artist.id)
        .filter(Artist.bio.is_(None))
        .distinct()
        .all()
    )
    db.close()

    total = len(rows)
    print(f"headliner artists to look up: {total}", flush=True)
    got = none = 0
    for i, (artist_id, name) in enumerate(rows, 1):
        bio, source, _url = fetch_artist_bio(name)
        if bio:
            _save(artist_id, bio, source)
            got += 1
        else:
            none += 1
        time.sleep(0.6)  # gentle on Wikipedia
        if i % 20 == 0:
            print(f"  {i}/{total} — {got} bios, {none} no-match", flush=True)
    print(f"DONE — {got} bios found, {none} no confident match", flush=True)


if __name__ == "__main__":
    backfill()
