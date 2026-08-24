"""Filling artist pages in before anyone opens them.

Everything the artist page shows — photo, bio, genre tags, similar artists, popularity —
was fetched at VIEW time. That had two consequences, both measured 2026-08-18:

  • the first person to open an artist waited 3-10 seconds while four APIs were called
  • and since nobody had opened most of them, the data simply was not there:
    of 1,556 artists with an upcoming show, 38 had a photo and 11 had similar artists

So the work moves here, to run against the artists who actually have upcoming dates. The
page then reads its own database and returns instantly.

Every source is free (Deezer, Wikipedia, Last.fm) — no Ticketmaster budget is spent.

Two rules hold across every backfill in this file:

  • A failed lookup is never written as an answer. Where a `*_checked_on` column exists
    it is stamped only when the call COMPLETED, so a throttled request is retried rather
    than frozen as "this artist has no similar acts".
  • Nothing is accepted on a fuzzy match. Deezer photos and Last.fm popularity require
    the returned name to equal ours; Wikipedia bios require a page whose description
    reads as musical and is not a disambiguation stub. An artist with no confident match
    keeps a NULL, and the page shows nothing rather than asserting the wrong act.
"""
import time
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.models.artist_similar import ArtistSimilar
from app.services import deezer, lastfm, wikipedia
from app.services.deezer import _norm


def _todo(column: str, limit: int) -> list[tuple]:
    """(id, name) for artists with an upcoming show that still need `column` filled.

    Ordered by how likely the page is to be OPENED — not by how many dates the act has.
    Show count was measured to be the wrong signal (2026-08-24): the busiest names in the
    catalogue are venue residencies and tribute acts — 'Tablao Flamenco 1911' with 247
    dates, 'MJ LIVE - Michael Jackson Tribute Concert' with 109, 'Rumours of Fleetwood
    Mac' with 51 — and those are precisely the acts every source correctly refuses to
    match. A bounded run ordered that way spent its entire budget on artists that can
    never be filled, while Bruno Mars and Metallica sat in the queue behind them.

    So the order is: artists somebody actually follows (the strongest evidence a page
    will be opened), then Deezer fans, then dates as the tie-break. For the popularity
    stage this degrades to follows-then-dates, because fan counts are exactly what that
    stage has not fetched yet — which is fine, it is the stage that creates the signal
    the other four rank on.

    Read with its own short-lived session and handed back as plain tuples, so no
    connection is held open across the network calls that follow.
    """
    db: Session = SessionLocal()
    try:
        return [(r[0], r[1]) for r in db.execute(text(f"""
            SELECT a.id, a.name,
                   (SELECT count(*) FROM follows f
                     WHERE f.followable_type = 'artist' AND f.followable_id = a.id) AS follows,
                   COUNT(*) AS shows
            FROM artists a JOIN events e ON e.headliner_artist_id = a.id
            WHERE e.starts_at >= now() AND a.{column} IS NULL
            GROUP BY a.id, a.name, a.deezer_fans
            ORDER BY follows DESC, a.deezer_fans DESC NULLS LAST, shows DESC
            LIMIT :lim
        """), {"lim": limit}).all()]
    finally:
        db.close()


def _in_session(fn, rows: list, label: str) -> None:
    """Apply `fn(db, row)` for a batch of rows in ONE short-lived session.

    Every backfill writes through this. The first version of backfill_popularity held a
    single session for the whole run and Supabase's pooler dropped it — `SSL SYSCALL
    error: Operation timed out` after ten minutes of a mostly-idle connection. So the
    network calls happen with no connection open, and the writes land in short bursts.
    """
    if not rows:
        return
    db: Session = SessionLocal()
    try:
        for row in rows:
            fn(db, row)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[enrich] {label} write failed: {type(e).__name__} {e}")
    finally:
        db.close()


# ---------------------------------------------------------------- popularity

def backfill_popularity(limit: int = 400, pause: float = 0.1, batch: int = 40) -> dict:
    """Cache Deezer followers and Last.fm listeners on the artist row.

    MXS reads these instead of calling two APIs per artist while scoring, and the two
    sources cover different blind spots: Deezer knows chart acts, Last.fm knows small
    ones. An artist only needs ONE of them to become scoreable.
    """
    todo = _todo("popularity_checked_on", limit)
    totals = {"artists": 0, "deezer": 0, "lastfm": 0, "neither": 0}
    pending = []

    def write(db, row):
        aid, fans, listeners, ok = row
        a = db.get(Artist, aid)
        if not a:
            return
        if fans:
            a.deezer_fans = fans
        if listeners:
            a.lastfm_listeners = listeners
        # Only stamp when the Last.fm half completed, so a throttled run is retried
        # rather than frozen as "this artist has no audience".
        if ok:
            a.popularity_checked_on = date.today()

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
            _in_session(write, pending, "popularity")
            pending = []
            print(f"[enrich] popularity {totals}")

    _in_session(write, pending, "popularity")
    print(f"[enrich] popularity done — {totals}")
    return totals


# -------------------------------------------------------------------- photos

def backfill_images(limit: int = 400, pause: float = 0.1, batch: int = 40) -> dict:
    """Cache a Deezer photo on artists who have none.

    `deezer.artist_image` returns a photo only when a result's name matches ours exactly
    once accents and punctuation are normalised away, so 'Coldplace' never inherits
    Coldplay's face. No match means `image_url` stays NULL and the page shows no photo,
    which is the honest outcome: a tribute act's picture presented as the headliner is a
    lie the page asserts, and one a reader cannot detect.

    There is deliberately no `image_checked_on` column, so an artist with no match is
    re-tried on the next run. At this catalogue size the call is free, and it means an
    act who appears on Deezer next month gets a photo without needing a migration.
    """
    todo = _todo("image_url", limit)
    totals = {"artists": 0, "found": 0, "no_match": 0}
    pending = []

    def write(db, row):
        aid, url = row
        a = db.get(Artist, aid)
        if a and url:
            a.image_url = url

    for aid, name in todo:
        try:
            url = deezer.artist_image(name)
        except Exception:
            url = None
        if url:
            pending.append((aid, url))
            totals["found"] += 1
        else:
            totals["no_match"] += 1
        totals["artists"] += 1
        time.sleep(pause)

        if len(pending) >= batch:
            _in_session(write, pending, "images")
            pending = []
            print(f"[enrich] images {totals}")

    _in_session(write, pending, "images")
    print(f"[enrich] images done — {totals}")
    return totals


# ---------------------------------------------------------------------- bios

def backfill_bios(limit: int = 200, pause: float = 0.2, batch: int = 25) -> dict:
    """Cache a Wikipedia bio, its source label, and the URL it came from.

    Wikipedia is the only bio source. Last.fm also returns a bio blob, but it is
    community-edited text with weaker provenance, and an uncited paragraph on a page
    whose whole promise is citation is worse than a blank. An artist with no Wikipedia
    page keeps a NULL bio.

    `wiki_url` is stored alongside the text and is always the canonical URL of the page
    the bio was actually read from — never a guessed /wiki/<Name>, because the wrong
    namesake's biography is worse than none. It is what lets a reader go and check us.

    Slower pause than the other backfills: this is two Wikipedia calls per artist
    (search, then summary) against a shared community API, so we do not lean on it.
    """
    todo = _todo("bio", limit)
    totals = {"artists": 0, "found": 0, "no_page": 0}
    pending = []

    def write(db, row):
        aid, bio, source, url = row
        a = db.get(Artist, aid)
        if not a:
            return
        a.bio = bio
        a.bio_source = source
        if url:
            a.wiki_url = url

    for aid, name in todo:
        try:
            bio, source, url = wikipedia.fetch_artist_bio(name)
        except Exception:
            bio, source, url = None, None, None
        if bio:
            pending.append((aid, bio, source, url))
            totals["found"] += 1
        else:
            totals["no_page"] += 1
        totals["artists"] += 1
        time.sleep(pause)

        if len(pending) >= batch:
            _in_session(write, pending, "bios")
            pending = []
            print(f"[enrich] bios {totals}")

    _in_session(write, pending, "bios")
    print(f"[enrich] bios done — {totals}")
    return totals


# ------------------------------------------------------------------- similar

def backfill_similar(limit: int = 200, pause: float = 0.2, batch: int = 20) -> dict:
    """Cache Last.fm similar artists so the 'you might also like' strip is never empty.

    Photos for the similar acts are taken from artists we ALREADY hold, not from a fresh
    Deezer call each. Twenty names per artist across a full run would be tens of
    thousands of requests to decorate a strip; the artist page already has a background
    pass that fills a missing face on first open. Run backfill_images before this and
    the local hit rate is high.

    Rows are replaced wholesale per artist, so an act Last.fm stops associating
    disappears rather than lingering. `similar_checked_on` is stamped only when the
    lookup completed.
    """
    todo = _todo("similar_checked_on", limit)
    totals = {"artists": 0, "with_similar": 0, "failed": 0, "rows": 0}
    pending = []

    def write(db, row):
        aid, rows = row
        today = date.today()
        db.query(ArtistSimilar).filter_by(artist_id=aid, source="lastfm").delete()

        held = {}
        want = [r["name"] for r in rows]
        if want:
            for a in db.query(Artist).filter(Artist.name.in_(want)).all():
                if a.image_url:
                    held[_norm(a.name)] = a.image_url

        for r in rows:
            db.add(ArtistSimilar(artist_id=aid, name=r["name"],
                                 image_url=held.get(_norm(r["name"])),
                                 match=r["match"], source="lastfm", fetched_on=today))
        a = db.get(Artist, aid)
        if a:
            a.similar_checked_on = today

    for aid, name in todo:
        try:
            rows, ok = lastfm.similar_artists_checked(name, limit=20)
        except Exception:
            rows, ok = [], False

        totals["artists"] += 1
        if not ok:
            # Not stamped, so the next run tries again.
            totals["failed"] += 1
            time.sleep(pause)
            continue
        if rows:
            totals["with_similar"] += 1
            totals["rows"] += len(rows)
        pending.append((aid, rows))
        time.sleep(pause)

        if len(pending) >= batch:
            _in_session(write, pending, "similar")
            pending = []
            print(f"[enrich] similar {totals}")

    _in_session(write, pending, "similar")
    print(f"[enrich] similar done — {totals}")
    return totals


# ------------------------------------------------------- similar-strip photos

def backfill_similar_photos() -> dict:
    """Fill similar-strip photos from artists we ALREADY hold. No network at all.

    `backfill_similar` deliberately does not buy twenty Deezer photos per artist — that
    is ~29,000 requests across the catalogue to decorate strips most of which nobody
    opens. So the rows it writes start photoless, and this closes the free half of the
    gap with one UPDATE: where a similar act is itself an artist in our catalogue that
    already has a photo, reuse it.

    The ceiling is real and worth stating: similar acts are often bands with no upcoming
    dates — Nirvana, Soundgarden, Chris Cornell next to Foo Fighters — and the backfills
    only cover artists who DO have dates, so we will never hold photos for most of them.
    The remainder is filled lazily by the artist page's background pass, for the artists
    somebody actually opens. Names are complete and instant; photos arrive on second open.

    Matched on lower(name) — case-insensitive but still an exact name match, never fuzzy,
    so a tribute act cannot inherit the real act's face here either.
    """
    db: Session = SessionLocal()
    try:
        res = db.execute(text("""
            UPDATE artist_similar s
               SET image_url = a.image_url
              FROM artists a
             WHERE s.image_url IS NULL
               AND a.image_url IS NOT NULL
               AND lower(a.name) = lower(s.name)
        """))
        db.commit()
        out = {"filled": res.rowcount}
    except Exception as e:
        db.rollback()
        out = {"error": f"{type(e).__name__}: {e}"}
        print(f"[enrich] similar_photos failed: {e}")
    finally:
        db.close()
    print(f"[enrich] similar photos done — {out}")
    return out


# ---------------------------------------------------------------------- tags

def backfill_tags(limit: int = 200) -> dict:
    """Genre tags. Delegates to the tagging service, which owns the whole story:
    it caches tags on the artist AND links them to every event that artist plays,
    because genres live on events in our schema."""
    from app.services import tagging
    return tagging.backfill_tags(limit=limit, only_upcoming=True)


# ----------------------------------------------------------------- the runner

def enrich_all(limit: int = 300) -> dict:
    """Run every backfill against the artists who have upcoming dates.

    Order is deliberate: images run before similar, so the similar strip finds its
    photos in our own table instead of paying Deezer for them.

    `limit` is per stage, not for the run. Each stage asks for the artists still missing
    ITS field, so an artist can be filled by one stage and skipped by another. Bounded on
    purpose — this is thousands of calls to free community APIs, and a run that finishes
    is worth more than one that gets throttled halfway.
    """
    print(f"[enrich] starting — limit {limit} per stage")
    out = {}
    for name, fn in (("popularity", backfill_popularity),
                     ("images", backfill_images),
                     ("bios", backfill_bios),
                     ("similar", backfill_similar),
                     ("tags", backfill_tags),
                     ("similar_photos", lambda limit=None: backfill_similar_photos())):
        try:
            out[name] = fn(limit=limit)
        except Exception as e:
            # One stage failing must not cost the others their work.
            print(f"[enrich] {name} stage failed: {type(e).__name__} {e}")
            out[name] = {"error": f"{type(e).__name__}: {e}"}
    print(f"[enrich] all done — {out}")
    return out
