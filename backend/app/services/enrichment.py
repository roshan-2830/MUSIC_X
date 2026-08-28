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
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.models.artist_similar import ArtistSimilar
from app.services import deezer, lastfm, wikipedia
from app.services.deezer import _norm


def _todo(column: str, limit: int, *, stale_days: int | None = None) -> list[tuple]:
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

    `stale_days` turns the column from "is it filled" into "when did we last look". Without it
    a stage whose column stays NULL on a miss re-asks about the same artists on every run, which
    is exactly what the bio stage was doing: 3,000 Wikipedia requests a pass to find 6 bios,
    because the artists with articles were filled long ago and the rest are residencies and
    tribute acts Wikipedia rightly has no page for. With it they drain out of the queue and come
    back after the window, so an act who gets an article later is still found.

    Read with its own short-lived session and handed back as plain tuples, so no
    connection is held open across the network calls that follow.
    """
    where = (f"a.{column} IS NULL" if stale_days is None else
             f"(a.{column} IS NULL OR a.{column} < current_date - {int(stale_days)})")
    db: Session = SessionLocal()
    try:
        return [(r[0], r[1]) for r in db.execute(text(f"""
            -- Every artist with something coming up, by ANY route. This used to be a plain
            -- join to events.headliner_artist_id, which meant enrichment had never once
            -- looked at 2,449 artists on a festival bill or 577 support acts — no photo, no
            -- bio, no fan count, and therefore unscoreable. Against 1,538 headliners it
            -- could see, that is two thirds of the catalogue invisible.
            WITH upcoming AS (
                SELECT e.headliner_artist_id AS artist_id
                  FROM events e
                 WHERE e.merged_into IS NULL AND e.starts_at >= now()
                   AND e.headliner_artist_id IS NOT NULL
                UNION ALL
                SELECT ea.artist_id
                  FROM event_artists ea JOIN events e ON e.id = ea.event_id
                 WHERE e.merged_into IS NULL AND e.starts_at >= now()
                UNION ALL
                SELECT fl.artist_id
                  FROM festival_lineup fl JOIN festivals f ON f.id = fl.festival_id
                 WHERE f.merged_into IS NULL
                   AND (f.ends_on >= current_date OR f.starts_on >= current_date
                        OR f.starts_on IS NULL)
            )
            SELECT a.id, a.name,
                   (SELECT count(*) FROM follows f
                     WHERE f.followable_type = 'artist' AND f.followable_id = a.id) AS follows,
                   COUNT(*) AS shows   -- appearances by any route
            FROM artists a JOIN upcoming u ON u.artist_id = a.id
            WHERE {where}
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

# ------------------------------------------------------- fetching in parallel

# Requests per second we allow ourselves PER SOURCE, whatever the worker count. These are
# community APIs given away for nothing, and the cost of being throttled is a run that stops
# halfway — worse than a run that takes longer.
#
# Deezer publishes 50 requests per 5 seconds; 8/s leaves headroom for anything else in the
# process using it. Last.fm does not publish a figure and the widely-honoured convention is
# about 5/s per key, so 4.
#
# THE LIMITER COUNTS ARTISTS, NOT REQUESTS, and that distinction cost Wikipedia twice its
# intended budget. `fetch_artist_bio` makes two calls — a search then a summary — inside a
# single slot, so a measured 5.4 artists/s was really about 11 requests/s at Wikipedia while
# the number here said 6. Halved to 3, which is the ~6 requests/s the comment always claimed.
# Every other source is one call per artist, where the two are the same thing.
# How long a "no Wikipedia page" answer is trusted before asking again.
BIO_RETRY_DAYS = 30

RATES = {"deezer": 8.0, "lastfm": 4.0, "wikipedia": 3.0}
# High enough to keep the rate limiter as the thing that decides the pace, rather than latency.
# A ~300 ms round trip at 8/s needs three in flight; eight leaves room for a slow one.
WORKERS = 8


class _Rate:
    """A shared throttle: no more than `per_sec` requests leave this process for one source.

    The limiter, not the pool size, is what protects the API. Threads make requests overlap so
    latency stops being the bottleneck; without a limiter, eight workers against a 200 ms
    endpoint would be 40 requests a second at whoever is on the other end.
    """

    def __init__(self, per_sec: float):
        self._gap = 1.0 / per_sec
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            due = max(now, self._next)
            self._next = due + self._gap
        delay = due - now
        if delay > 0:
            time.sleep(delay)


def _parallel(todo: list, fetch_one, *, source: str, label: str):
    """Yield (aid, name, value) for each artist, fetched concurrently.

    Order is not preserved and does not matter: every result is written by artist id, and the
    stages already separate fetching from the database entirely — writes happen on this thread,
    in batches, exactly as before. That separation is why this is a safe change; a SQLAlchemy
    session must not be shared across threads and none is.

    A fetch that raises yields None rather than stopping the stage, which is what the sequential
    version did with its per-artist try/except.
    """
    rate = _Rate(RATES.get(source, 4.0))
    total = len(todo)

    def one(item):
        aid, name = item
        rate.wait()
        try:
            return aid, name, fetch_one(name)
        except Exception:
            return aid, name, None

    started = time.monotonic()
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for aid, name, value in pool.map(one, todo):
            done += 1
            if done % 200 == 0:
                per_sec = done / max(time.monotonic() - started, 0.001)
                print(f"[enrich] {label} {done}/{total} ({per_sec:.1f}/s)")
            yield aid, name, value



def backfill_popularity(limit: int = 1500, pause: float = 0.0, batch: int = 60) -> dict:
    """Cache Deezer followers and Last.fm listeners on the artist row.

    `pause` is retained for callers that pass it and is no longer used: the pace is set by the
    shared per-source rate limiter in _parallel, which throttles correctly no matter how many
    requests are in flight. A per-artist sleep could not do that once fetches overlap.

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

    # Both sources for one artist are fetched together, so the pair stays a unit and the
    # Last.fm `ok` flag still decides whether this artist counts as checked. Paced to the
    # slower of the two — Last.fm — because that is the one that throttles.
    def both(name):
        try:
            fans = deezer.artist_fans(name)
        except Exception:
            fans = None
        listeners, _plays, ok = lastfm.artist_listeners(name)
        return fans, listeners, ok

    for aid, name, got in _parallel(todo, both, source="lastfm", label="popularity"):
        fans, listeners, ok = got if got else (None, None, False)
        pending.append((aid, fans, listeners, ok))

        totals["artists"] += 1
        if fans:
            totals["deezer"] += 1
        if listeners:
            totals["lastfm"] += 1
        if not fans and not listeners:
            totals["neither"] += 1

        if len(pending) >= batch:
            _in_session(write, pending, "popularity")
            pending = []
            print(f"[enrich] popularity {totals}")

    _in_session(write, pending, "popularity")
    print(f"[enrich] popularity done — {totals}")
    return totals


# -------------------------------------------------------------------- photos

def backfill_images(limit: int = 1500, pause: float = 0.0, batch: int = 60) -> dict:
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

    for aid, name, url in _parallel(todo, deezer.artist_image,
                                    source="deezer", label="images"):
        if url:
            pending.append((aid, url))
            totals["found"] += 1
        else:
            totals["no_match"] += 1
        totals["artists"] += 1

        if len(pending) >= batch:
            _in_session(write, pending, "images")
            pending = []
            print(f"[enrich] images {totals}")

    _in_session(write, pending, "images")
    print(f"[enrich] images done — {totals}")
    return totals


# ---------------------------------------------------------------------- bios

def backfill_bios(limit: int = 1500, pause: float = 0.0, batch: int = 50) -> dict:
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
    # Selected on the STAMP, not on the bio being NULL, so an artist with no Wikipedia page
    # leaves the queue instead of being re-asked every three hours. 30 days back in.
    todo = _todo("bio_checked_on", limit, stale_days=BIO_RETRY_DAYS)
    totals = {"artists": 0, "found": 0, "no_page": 0}
    pending = []

    def write(db, row):
        aid, bio, source, url = row
        a = db.get(Artist, aid)
        if not a:
            return
        # Stamped for everyone we looked up, including the misses — that is the whole point of
        # the column. Only the text is conditional.
        a.bio_checked_on = date.today()
        if bio:
            a.bio = bio
            a.bio_source = source
            if url:
                a.wiki_url = url

    for aid, name, got in _parallel(todo, wikipedia.fetch_artist_bio,
                                    source="wikipedia", label="bios"):
        bio, bio_source, url = got if got else (None, None, None)
        # Misses are queued as well as hits. They carry no text, but they carry the fact that we
        # looked — without that the artist is picked again on the very next run.
        pending.append((aid, bio, bio_source, url))
        if bio:
            totals["found"] += 1
        else:
            totals["no_page"] += 1
        totals["artists"] += 1

        if len(pending) >= batch:
            _in_session(write, pending, "bios")
            pending = []
            print(f"[enrich] bios {totals}")

    _in_session(write, pending, "bios")
    print(f"[enrich] bios done — {totals}")
    return totals


# ------------------------------------------------------------------- similar

def backfill_similar(limit: int = 1500, pause: float = 0.0, batch: int = 40) -> dict:
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

    for aid, name, got in _parallel(todo, lambda n: lastfm.similar_artists_checked(n, limit=20),
                                    source="lastfm", label="similar"):
        rows, ok = got if got else ([], False)

        totals["artists"] += 1
        if not ok:
            # Not stamped, so the next run tries again.
            totals["failed"] += 1
            continue
        if rows:
            totals["with_similar"] += 1
            totals["rows"] += len(rows)
        pending.append((aid, rows))

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
