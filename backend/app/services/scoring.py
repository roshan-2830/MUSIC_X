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


def score_all_events():
    db: Session = SessionLocal()
    scored = skipped = 0
    cache: dict[str, int | None] = {}
    events = []
    try:
        events = db.query(Event).all()
        for ev in events:
            if not ev.headliner_artist_id:
                skipped += 1
                continue
            artist = db.get(Artist, ev.headliner_artist_id)
            name = artist.name if artist else None
            if not name or name.upper() in ("TBA", "VARIOUS"):
                skipped += 1
                continue
            if name not in cache:
                cache[name] = artist_fans(name)
            fans = cache[name]
            if not fans:
                skipped += 1
                continue
            score = _fans_to_score(fans)
            ev.mxs = score
            ev.mxs_breakdown = {"lineup_strength": score, "source": "deezer", "fans": fans}
            ev.confidence = "low"
            ev.last_verified = date.today()
            scored += 1
        db.commit()
    finally:
        db.close()
    return {"total": len(events), "scored": scored, "skipped": skipped}
