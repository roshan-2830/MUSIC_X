"""Genre-led onboarding, for the majority of people with no Last.fm account.

Connecting a listening history is the shortest path to real recommendations, but most
people do not have Last.fm and must not be stuck at the door. This is the fallback: pick a
few genres, get real artists to follow.

Both endpoints are open — they run before a user has an account, which is the point.
Following an artist still requires auth, and that is handled by /me/follows.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.genre import GenreArtist, GenreOption

router = APIRouter(prefix="/genres", tags=["genres"])

# A genre needs this many followable artists before we offer it. Below it, picking the
# genre returns almost nothing and the screen feels broken — measured 2026-08-25: 28
# genres clear 8, and they are the recognisable ones (Rock 217, Pop 182, Indie 131).
MIN_ARTISTS = 8


@router.get("", response_model=list[GenreOption])
def list_genres(
    limit: int = Query(30, le=80),
    min_artists: int = Query(MIN_ARTISTS, ge=1),
    db: Session = Depends(get_db),
):
    """Genres worth offering, most-played first.

    Counted over artists who have an UPCOMING show, not the whole catalogue: a genre is
    only useful here if following someone in it leads to a gig. Joined against `genres` so
    only tags that survived the crowd-tag prune are offered — `artists.tags` holds whatever
    Last.fm said, including junk like "Seen Live X7", and that is fine to keep as a record
    but not to put in front of a new user.
    """
    rows = db.execute(text("""
        SELECT g.tag, count(DISTINCT g.id) AS n
        FROM (
            SELECT jsonb_array_elements_text(a.tags) AS tag, a.id
            FROM artists a
            WHERE a.tags IS NOT NULL
              AND EXISTS (SELECT 1 FROM events e
                          WHERE e.headliner_artist_id = a.id AND e.starts_at >= now())
        ) g
        JOIN genres gg ON gg.name = g.tag
        GROUP BY g.tag
        HAVING count(DISTINCT g.id) >= :min
        ORDER BY n DESC, g.tag ASC
        LIMIT :lim
    """), {"min": min_artists, "lim": limit}).all()
    return [GenreOption(name=r[0], artist_count=r[1]) for r in rows]


@router.get("/artists", response_model=list[GenreArtist])
def artists_for_genres(
    genres: str = Query("", description="Comma-separated genre names; empty = most popular"),
    limit: int = Query(30, le=100),
    db: Session = Depends(get_db),
):
    """Artists to follow — for the genres a user picked, or the most popular if they skipped.

    Ordered by whether we hold a photo, then by audience. Photos first is not vanity: this
    is a grid of faces and a screen of grey initials reads as an empty product. Within that,
    the most-followed artist in a genre is the one a newcomer is most likely to recognise.

    Only artists with an upcoming show, and de-duplicated: someone tagged Rock, Indie AND
    Alternative must appear once, not three times.

    EMPTY `genres` IS A REAL REQUEST, not an error. Skipping the genre step used to leave
    the follow screen with nothing to show, which is the worst version of a first screen:
    it asks you to recall an artist's name cold. With no genres this returns the biggest
    names that are actually touring, so the grid is never empty.

    A name that is not a known genre lands in the same place rather than returning []. It
    is a deliberate fallthrough: the caller only ever sends names it got from /genres, so
    this should not happen, and if it does, popular artists are a better answer than a
    blank screen.
    """
    asked = [g.strip() for g in genres.split(",") if g.strip()][:12]
    # Only genres that survived the crowd-tag prune, so this endpoint and /genres agree
    # about what a genre is. Without it a caller could ask for "Seen Live X7" — a real
    # string in artists.tags, and not a genre — and get an answer.
    wanted = [r[0] for r in db.execute(text(
        "SELECT name FROM genres WHERE name = ANY(:asked)"), {"asked": asked}).all()] if asked else []

    # The tag filter is the only difference between the two cases; everything else about
    # what makes a good suggestion is the same, so the query is shared rather than forked.
    tag_filter = "a.tags ?| :wanted AND" if wanted else ""
    params = {"lim": limit}
    if wanted:
        params["wanted"] = wanted

    rows = db.execute(text(f"""
        SELECT a.name, a.image_url, a.deezer_fans, a.lastfm_listeners, a.tags,
               (SELECT count(*) FROM events e
                WHERE e.headliner_artist_id = a.id AND e.starts_at >= now()) AS shows
        FROM artists a
        WHERE {tag_filter}
              EXISTS (SELECT 1 FROM events e
                      WHERE e.headliner_artist_id = a.id AND e.starts_at >= now())
        ORDER BY (a.image_url IS NULL), a.deezer_fans DESC NULLS LAST, a.name
        LIMIT :lim
    """), params).all()

    picked = set(wanted)
    out = []
    for name, img, fans, listeners, tags, shows in rows:
        # Show the genres that match what they asked for first — the card should say why
        # this artist is here, not list everything Last.fm ever tagged them with.
        tags = tags or []
        matched = [t for t in tags if t in picked]
        rest = [t for t in tags if t not in picked]
        out.append(GenreArtist(
            name=name, image_url=img, deezer_fans=fans, lastfm_listeners=listeners,
            genres=(matched + rest)[:3], upcoming_shows=shows,
        ))
    return out
