"""Filling artist pages in before anyone opens them.

Everything the artist page shows — photo, bio, genre tags, similar artists, popularity —
was fetched at VIEW time. That had two consequences, both measured 2026-08-18:

  • the first person to open an artist waited 3-10 seconds while four APIs were called
  • and since nobody had opened most of them, the data simply was not there:
    of 1,556 artists with an upcoming show, 38 had a photo and 11 had similar artists

So the work moves here, to run against the artists who actually have upcoming dates. The
page then reads its own database and returns instantly.

Every source is free (Deezer, Wikipedia, Last.fm) — no Ticketmaster budget is spent.
"""
import time
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.services import deezer, lastfm


def _headliners(db: Session, column: str, limit: int) -> list:
    """Artists with an upcoming show that still need `column` filled, busiest first."""
    return [r[0] for r in db.execute(text(f"""
        SELECT a.id, COUNT(*) AS shows
        FROM artists a JOIN events e ON e.headliner_artist_id = a.id
        WHERE e.starts_at >= now() AND a.{column} IS NULL
        GROUP BY a.id ORDER BY shows DESC LIMIT :lim
    """), {"lim": limit}).all()]


def backfill_popularity(limit: int = 400, pause: float = 0.1, batch: int = 40) -> dict:
    """Cache Deezer followers and Last.fm listeners on the artist row.

    MXS reads these instead of calling two APIs per artist while scoring, and the two
    sources cover different blind spots: Deezer knows chart acts, Last.fm knows small
    ones. An artist only needs ONE of them to become scoreable.

    Network calls happen with NO database connection open. The first version held one
    session for the whole run and Supabase's pooler dropped it — `SSL SYSCALL error:
    Operation timed out` after ten minutes of mostly-idle connection. Same shape as
    reverify_all_events: fetch cold, then write in short bursts.
    """
    db: Session = SessionLocal()
    try:
        todo = [(r[0], r[1]) for r in db.execute(text("""
            SELECT a.id, a.name, COUNT(*) AS shows
            FROM artists a JOIN events e ON e.headliner_artist_id = a.id
            WHERE e.starts_at >= now() AND a.popularity_checked_on IS NULL
            GROUP BY a.id, a.name ORDER BY shows DESC LIMIT :lim
        """), {"lim": limit}).all()]
    finally:
        db.close()

    totals = {"artists": 0, "deezer": 0, "lastfm": 0, "neither": 0}
    pending = []
    for aid, name in todo:
        try:
            fans = deezer.artist_fans(name)
        except Exception:
            fans = None
        listeners, _plays, ok = lastfm.artist_listeners(name)
        pending.append((aid, fans, listeners, ok))

        totals["artists"] += 1
        if fans:
            totals["deezer"] += 1
        if listeners:
            totals["lastfm"] += 1
        if not fans and not listeners:
            totals["neither"] += 1
        time.sleep(pause)

        if len(pending) >= batch:
            _write_popularity(pending)
            pending = []
            print(f"[enrich] popularity {totals}")

    if pending:
        _write_popularity(pending)
    print(f"[enrich] popularity done — {totals}")
    return totals


def _write_popularity(rows: list) -> None:
    """One short-lived session per batch, so a slow run never sits on a connection."""
    db: Session = SessionLocal()
    try:
        today = date.today()
        for aid, fans, listeners, ok in rows:
            a = db.get(Artist, aid)
            if not a:
                continue
            if fans:
                a.deezer_fans = fans
            if listeners:
                a.lastfm_listeners = listeners
            # Only stamp when the Last.fm half completed, so a throttled run is retried
            # rather than frozen as "this artist has no audience".
            if ok:
                a.popularity_checked_on = today
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[enrich] write failed: {type(e).__name__} {e}")
    finally:
        db.close()
