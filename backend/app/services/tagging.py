"""Genres, from Last.fm crowd tags.

`event_genres` had coverage on 485 of 4,708 events — 10% — because Ticketmaster only
supplies a genre on some listings and its whole taxonomy is 23 broad buckets. That thin
coverage is why two things stayed broken: Tier B genre recommendations had almost nothing
to match on, and MXS's `context` component fired on a handful of events.

Genres live on EVENTS in our schema, while tags come per ARTIST — so this fetches an
artist's tags once and applies them to every event that artist plays. That is a real
claim, not a guess: a Bhangra artist's show is a Bhangra show.

Tags are also kept on the artist row, because that is what a taste profile needs.
"""
from datetime import date

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.artist import Artist
from app.models.event_genre import EventGenre
from app.models.genre import Genre
from app.services import lastfm


def _genre_ids(db: Session, names: list) -> dict:
    """Genre rows for these names, creating any we do not hold yet."""
    if not names:
        return {}
    found = {g.name: g for g in db.query(Genre).filter(Genre.name.in_(names)).all()}
    for n in names:
        if n not in found:
            g = Genre(name=n)
            db.add(g)
            found[n] = g
    db.flush()
    return {n: g.id for n, g in found.items()}


def apply_artist_tags(db: Session, artist: Artist) -> dict:
    """Fetch this artist's tags, store them, and tag their events. Commits nothing."""
    tags, ok = lastfm.artist_tags(artist.name)
    if not ok:
        # A failed lookup must not be recorded as "this artist has no genres" — the same
        # rule as the website and similarity lookups.
        return {"artist": artist.name, "ok": False, "tags": 0, "events_tagged": 0}

    artist.tags = tags
    artist.tags_checked_on = date.today()
    if not tags:
        return {"artist": artist.name, "ok": True, "tags": 0, "events_tagged": 0}

    # The raw tags stay on the artist row; only publishable ones become genres.
    tags = publishable(tags)
    if not tags:
        return {"artist": artist.name, "ok": True, "tags": 0, "events_tagged": 0}

    ids = _genre_ids(db, tags)

    # Their events: as headliner or anywhere in the line-up.
    event_ids = {r[0] for r in db.execute(text("""
        SELECT e.id FROM events e WHERE e.headliner_artist_id = :aid
        UNION
        SELECT ea.event_id FROM event_artists ea WHERE ea.artist_id = :aid
    """), {"aid": artist.id}).all()}
    if not event_ids:
        return {"artist": artist.name, "ok": True, "tags": len(tags), "events_tagged": 0}

    held = {(r[0], r[1]) for r in db.execute(text("""
        SELECT event_id, genre_id FROM event_genres WHERE event_id = ANY(:ids)
    """), {"ids": list(event_ids)}).all()}

    added = 0
    for eid in event_ids:
        for gname in tags:
            gid = ids[gname]
            if (eid, gid) in held:
                continue
            held.add((eid, gid))
            db.add(EventGenre(event_id=eid, genre_id=gid))
            added += 1
    return {"artist": artist.name, "ok": True, "tags": len(tags), "events_tagged": added}


def backfill_tags(limit: int = 200, only_upcoming: bool = True) -> dict:
    """Tag the artists who actually headline shows, most shows first.

    Bounded on purpose: one Last.fm call per artist, and 3,600 artists is a lot of calls
    for a catalogue where most of them have no upcoming date anyway.
    """
    from app.db.session import SessionLocal

    db: Session = SessionLocal()
    try:
        where = "AND e.starts_at >= now()" if only_upcoming else ""
        rows = db.execute(text(f"""
            SELECT a.id, COUNT(*) AS shows
            FROM artists a JOIN events e ON e.headliner_artist_id = a.id
            WHERE a.tags_checked_on IS NULL {where}
            GROUP BY a.id ORDER BY shows DESC LIMIT :lim
        """), {"lim": limit}).all()

        totals = {"artists": 0, "tagged": 0, "event_links": 0, "failed": 0}
        for aid, _n in rows:
            artist = db.get(Artist, aid)
            if not artist:
                continue
            res = apply_artist_tags(db, artist)
            totals["artists"] += 1
            if not res["ok"]:
                totals["failed"] += 1
            elif res["tags"]:
                totals["tagged"] += 1
                totals["event_links"] += res["events_tagged"]
            if totals["artists"] % 25 == 0:
                db.commit()
                print(f"[tags] {totals}")
        db.commit()
        print(f"[tags] done — {totals}")
        return totals
    finally:
        db.close()


# Ticketmaster's own taxonomy stays whatever its coverage — it is a real published
# vocabulary, not a crowd tag, and some of its buckets are legitimately rare.
protected = {
    "Alternative", "Ballads/Romantic", "Blues", "Classical", "Community/Civic",
    "Country", "Dance/Electronic", "Extreme", "Fairs & Festivals", "Folk",
    "Hip-Hop/Rap", "Jazz", "Latin", "Magic & Illusion", "Metal", "Multimedia",
    "Pop", "R&B", "Reggae", "Religious", "Rock", "Theatre", "World",
}

# Single-artist alone is too blunt at this data volume: with 150 artists tagged, real
# sub-genres legitimately have only one act, and the first run took "Pirate Metal",
# "Christian Rock" and "Acoustic" along with the junk. So a tag also has to look
# nothing like a genre before we drop it. Almost every real genre name contains one
# of these heads; "Pittsburgh", "Greatest Ever" and "Sailing" contain none.
GENRE_WORDS = (
    "rock", "pop", "metal", "jazz", "punk", "soul", "folk", "blues", "rap", "hop",
    "house", "techno", "trance", "core", "wave", "indie", "electro", "reggae",
    "country", "classic", "ambient", "funk", "disco", "gospel", "latin", "acoustic",
    "orchestr", "symphon", "choir", "opera", "ska", "grunge", "emo", "dub", "garage",
    "gaze", "psych", "prog", "alt", "dance", "swing", "bhangra", "desi", "punjabi",
    "afro", "kpop", "k pop", "j pop", "salsa", "cumbia", "reggaeton", "worship",
    "christian", "instrumental", "experimental", "industrial", "hardcore", "tempo",
    "bass", "drill", "grime", "chanson", "flamenco", "celtic", "bluegrass", "americana",
    # Added 2026-08-24 after reading what a dry run would actually delete. The first list
    # was written when 150 artists were tagged; at 1,003 it was throwing away 45 real
    # genres — Baroque, Bebop, Riot Grrrl, Honky Tonk, Jungle, Ranchera, Stoner Doom.
    # These are HEADS, not names: "bop" covers bebop, post-bop and hard bop without
    # anyone enumerating them, which is what makes this different from the blocklist the
    # docstring rightly says can never keep up.
    "bop", "wop", "tonk", "grind", "crust", "grrrl", "doom", "kore", "phonk",
    "baroque", "quartet", "big band", "capella", "aor", "jungle", "ragga", "ranchera",
    "regional mexican", "goth", "drone", "balearic", "batcave", "bolero", "bollywood",
    "forro", "piseiro", "mpb", "turntabl", "volksmusik", "schlager", "entexno",
    "estrada", "cantautor", "eurobeat", "spoken", "showtune", "musical", "theater",
    "romantic", "crossover", "brass", "world", "chh",
    # A second pass over what the improved filter still dropped. NOT added: "mod" — the
    # Mod revival is a real genre, but "mod" is a substring of "modern", so it would
    # rescue 'Modtoday' and every other junk tag containing it. One real genre lost is
    # cheaper than a head that lets junk back in.
    "ccm", "twee", "hauntolog", "8bit", "8 bit", "hands up",
)

# Junk that a genre word alone cannot catch, because it CONTAINS one. Checked before the
# genre-word test and overrides it: 'Funk_Add_To_Lidarr_Batch_1' survived on "funk", and
# it is a music-manager import queue, not a genre. Mechanical strings only — this is not
# where names or places go, those are handled by the one-artist test.
JUNK_MARKERS = (
    "_", "seen live", "add to", "batch", "lidarr", "nonstreamable", "rutracker",
)


def looks_like_junk(name: str) -> bool:
    """A mechanical string that a genre word would otherwise rescue."""
    low = (name or "").lower()
    return any(j in low for j in JUNK_MARKERS)


def publishable(tags: list) -> list:
    """The tags we are willing to turn into genre rows.

    `artist.tags` keeps whatever Last.fm said, because that is the provenance record and
    a taste profile reads it. `genres` is what we PUBLISH, which is a different promise —
    so mechanical junk is filtered here, at the point of linking, rather than by editing
    what the source told us.

    Only the corpus-independent half of the filter can run here. "Claimed by one artist
    only" needs the event links to already exist, which is why prune_single_artist_genres
    has to run LAST, after any rebuild.
    """
    return [t for t in tags if t and not looks_like_junk(t)]


def looks_like_a_genre(name: str) -> bool:
    """Does this name contain any word a real genre almost always contains?"""
    low = (name or "").lower()
    return any(w in low for w in GENRE_WORDS)


def prune_single_artist_genres(db: Session, min_artists: int = 2,
                               dry_run: bool = True) -> dict:
    """Drop genres only ever claimed by ONE artist.

    This is the structural half of the filter, and it exists because a blocklist can
    never keep up. Crowd tags include artist names ("Westlife", "Donny Osmond", "Eiji
    Oue"), venue names ("Dallas Symphony Orchestra"), private notes ("Beentheredonethat",
    "Artisttagola") and place names — an unbounded set, impossible to enumerate.

    But they share a shape: each belongs to exactly one artist. A real genre is a thing
    several artists have in common, which is the whole point of a genre. So rather than
    guess from the text, we ask how many artists carry it, and drop the ones that only
    describe a single act.

    The trade-off, stated plainly: a genuinely rare genre held by one artist in our
    catalogue is dropped too. It comes back as soon as a second artist arrives with it.
    """
    rows = db.execute(text("""
        SELECT g.id, g.name, COUNT(DISTINCT a.id) AS artists
        FROM genres g
        JOIN event_genres eg ON eg.genre_id = g.id
        JOIN events e        ON e.id = eg.event_id
        LEFT JOIN artists a  ON a.id = e.headliner_artist_id
        GROUP BY g.id, g.name
        HAVING COUNT(DISTINCT a.id) < :m
    """), {"m": min_artists}).all()


    def survives(name: str) -> bool:
        if looks_like_junk(name):
            return False              # overrides everything below
        return name in protected or looks_like_a_genre(name)

    doomed = [(r[0], r[1]) for r in rows if not survives(r[1])]
    kept = [r[1] for r in rows if survives(r[1])]
    if not doomed:
        return {"dropped": 0, "names": [], "kept_rare": kept, "dry_run": dry_run}

    # Dry run by default: this deletes rows, and the trade-off below means it will always
    # take some real genres with the junk. Look at the list before committing to it.
    if not dry_run:
        ids = [i for i, _ in doomed]
        db.execute(text("DELETE FROM event_genres WHERE genre_id = ANY(:ids)"), {"ids": ids})
        db.execute(text("DELETE FROM genres WHERE id = ANY(:ids)"), {"ids": ids})
    return {"dropped": len(doomed), "names": sorted(n for _, n in doomed),
            "kept_rare": sorted(kept), "dry_run": dry_run}


def reapply_cached_tags(db: Session) -> dict:
    """Re-link events to genres from tags already cached on artist rows.

    No network calls: `artist.tags` holds what Last.fm said, so the event links can be
    rebuilt whenever the filter changes, without spending another API request per artist.

    RUN ORDER MATTERS, and getting it wrong is silent. This CREATES any genre row it does
    not hold, straight from the cached tags — so running it after
    prune_single_artist_genres puts every pruned genre back. Measured 2026-08-24: prune
    then rebuild took 753 genres to 788, a net increase, while looking like it had
    worked. Rebuild first, prune LAST — the prune counts how many artists share a genre,
    so it needs the links to exist before it can judge anything.
    """
    artists = db.query(Artist).filter(Artist.tags.isnot(None)).all()
    totals = {"artists": 0, "links": 0}
    for a in artists:
        tags = publishable(a.tags or [])
        if not tags:
            continue
        ids = _genre_ids(db, tags)
        event_ids = {r[0] for r in db.execute(text("""
            SELECT e.id FROM events e WHERE e.headliner_artist_id = :aid
            UNION
            SELECT ea.event_id FROM event_artists ea WHERE ea.artist_id = :aid
        """), {"aid": a.id}).all()}
        if not event_ids:
            continue
        held = {(r[0], r[1]) for r in db.execute(text("""
            SELECT event_id, genre_id FROM event_genres WHERE event_id = ANY(:ids)
        """), {"ids": list(event_ids)}).all()}
        for eid in event_ids:
            for g in tags:
                gid = ids[g]
                if (eid, gid) in held:
                    continue
                held.add((eid, gid))
                db.add(EventGenre(event_id=eid, genre_id=gid))
                totals["links"] += 1
        totals["artists"] += 1
    return totals
