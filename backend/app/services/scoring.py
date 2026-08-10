import math
from datetime import date

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.event import Event
from app.models.artist import Artist
from app.services.deezer import artist_fans


def _fans_to_score(fans: int) -> float:
    """Log-scale fan count -> 0..10. ~300 fans -> 0, ~3M+ -> 10."""
    if not fans or fans < 1:
        return 0.0
    raw = (math.log10(fans) - 2.5) / 4.0 * 10
    return round(max(0.0, min(10.0, raw)), 1)


def score_event(db: Session, ev: Event, cache: dict) -> bool:
    """Compute + store the MXS score for ONE event, from its headliner's Deezer
    fan count. `cache` maps artist name -> fans so we don't hit Deezer twice for
    the same artist. Returns True if scored, False if skipped."""
    if not ev.headliner_artist_id:
        return False
    artist = db.get(Artist, ev.headliner_artist_id)
    name = artist.name if artist else None
    if not name or name.upper() in ("TBA", "VARIOUS"):
        return False
    if name not in cache:
        cache[name] = artist_fans(name)
    fans = cache[name]
    if not fans:
        return False
    score = _fans_to_score(fans)
    ev.mxs = score
    ev.mxs_breakdown = {"lineup_strength": score, "source": "deezer", "fans": fans}
    ev.confidence = "low"
    ev.last_verified = date.today()
    return True


def score_all_events():
    """Nightly job: score every event in the database."""
    db: Session = SessionLocal()
    scored = skipped = 0
    cache: dict[str, int | None] = {}
    events = []
    try:
        events = db.query(Event).all()
        for ev in events:
            if score_event(db, ev, cache):
                scored += 1
            else:
                skipped += 1
        db.commit()
    finally:
        db.close()
    return {"total": len(events), "scored": scored, "skipped": skipped}


def score_events_by_ids(ids: list) -> int:
    """Score just these events (used by live search). Returns how many scored."""
    if not ids:
        return 0
    db: Session = SessionLocal()
    cache: dict[str, int | None] = {}
    scored = 0
    try:
        events = db.query(Event).filter(Event.id.in_(ids)).all()
        for ev in events:
            if score_event(db, ev, cache):
                scored += 1
        db.commit()
    finally:
        db.close()
    return scored