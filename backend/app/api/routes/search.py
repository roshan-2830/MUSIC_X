"""One search box, three kinds of answer — and the links between them.

Why this is a new endpoint rather than three calls from the app
--------------------------------------------------------------
The screen used to fire the event search, the festival search and Deezer's artist search
separately and stack the three lists. That was dropped for a reason: three unrelated lists
are three answers to a question that named one thing.

What was missing is the RELATION. Searching an artist should surface the shows they play;
searching a festival should surface who is on the bill. The app cannot work that out — a
festival in a list payload carries `artists_count` and not one name — so it is computed
here, in one round trip.

Nothing about the ranking is re-implemented. The concert and festival matches are the tuned
functions from their own routers, so this endpoint cannot drift from what they return. Only
the artist half is new: the existing /artists/search asks DEEZER, a global catalogue with no
link to anything we hold, so it can never answer "and here is where they are playing".

Two rules worth stating
-----------------------
1. Artists matched BY NAME lead, and acts are read off the bills to fill the rest. Either/or
   was wrong: "London" matches artists NAMED London, so it never looked at the bills and a
   city returned acts with the word in their name instead of the acts playing there.
2. With a filter on, the artists are narrowed to acts who have a MATCHING show. "Today"
   should give you people playing tonight, not everyone whose name matched.
"""
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import case, nulls_last, text
from sqlalchemy.orm import Session

from app.api.routes.events import events_matching, match_counts
from app.api.routes.festivals import festivals_matching
from app.core.security import get_current_user_id_optional
from app.db.session import get_db
from app.models.artist import Artist
from app.schemas.event import EventListItem
from app.schemas.festival import FestivalOut
from app.services import search_filters as sf
from app.services import text_search as ts

router = APIRouter(prefix="/search", tags=["search"])

ARTIST_LIMIT = 8
EVENT_LIMIT = 40
FEST_LIMIT = 20


class SearchArtist(BaseModel):
    """An act from OUR catalogue — so it can be tied to dates, unlike a Deezer result."""
    id: UUID
    name: str
    image_url: str | None = None
    deezer_fans: int | None = None
    lastfm_listeners: int | None = None
    # Counted, never estimated. Zero means we hold no upcoming date for them, and the app
    # says nothing rather than "0 concerts".
    upcoming_events: int = 0
    upcoming_festivals: int = 0
    # Why this act is on screen: "name" when the term matched their name, "lineup" when
    # they were found on a show or bill the term matched. Two different claims.
    via: str = "name"


class SearchCounts(BaseModel):
    """How many matching CONCERTS each filter option would leave.

    Concerts only, and the app labels them as such. Festival dates are a different shape
    (a range, not a moment) and two of the filters have no festival answer at all, so
    folding both into one number would produce a count that is true of neither.
    """
    total: int = 0
    today: int = 0
    tomorrow: int = 0
    weekend: int = 0
    d7: int = 0
    month: int = 0
    m3: int = 0
    onsale_now: int = 0
    onsale_coming: int = 0
    rating_8: int = 0
    rating_7: int = 0
    not_scheduled: int = 0


class SearchAll(BaseModel):
    artists: list[SearchArtist] = []
    events: list[EventListItem] = []
    festivals: list[FestivalOut] = []
    counts: SearchCounts | None = None
    # Which filters the server actually applied, so the app can show the truth rather than
    # what it thinks it asked for — "only acts I follow" quietly does nothing when nobody
    # is signed in, and the chip row must not claim otherwise.
    applied: list[str] = []


def _artists_by_name(db: Session, raw: str, safe: str, limit: int,
                     restrict_to: set | None = None) -> list:
    """Name matches, ranked the way the festival search ranks: whole word, then prefix,
    then substring. Ties break on the id — an unbroken tie cost this project 3,094
    drifting scores once already."""
    if limit <= 0:
        return []
    rank = case(
        (ts.whole_word(Artist.name, raw), 0),
        (ts.starts_with(Artist.name, safe), 1),
        else_=2,
    )
    q = (db.query(Artist.id, Artist.name, Artist.image_url,
                  Artist.deezer_fans, Artist.lastfm_listeners)
           .filter(ts.contains(Artist.name, safe)))
    if restrict_to is not None:
        # A filter is on, so a name match only counts if this act has a show that survived
        # it. Empty set means nothing survived, and no artist can qualify.
        if not restrict_to:
            return []
        q = q.filter(Artist.id.in_(restrict_to))
    return q.order_by(rank, nulls_last(Artist.deezer_fans.desc()), Artist.id).limit(limit).all()


def _lineup_ids(db: Session, event_ids: list, fest_ids: list) -> set:
    """Every act on the shows and festivals this term matched. One round trip."""
    if not event_ids and not fest_ids:
        return set()
    rows = db.execute(text("""
        SELECT ea.artist_id AS aid FROM event_artists ea WHERE ea.event_id = ANY(:eids)
        UNION
        SELECT e.headliner_artist_id FROM events e
         WHERE e.id = ANY(:eids) AND e.headliner_artist_id IS NOT NULL
        UNION
        SELECT fl.artist_id FROM festival_lineup fl WHERE fl.festival_id = ANY(:fids)
    """), {"eids": list(event_ids), "fids": list(fest_ids)}).all()
    return {r.aid for r in rows if r.aid}


def _artists_by_ids(db: Session, ids: set, limit: int) -> list:
    """The biggest names among these acts, for the line-up half of the artists section."""
    if not ids or limit <= 0:
        return []
    return db.execute(text("""
        SELECT a.id, a.name, a.image_url, a.deezer_fans, a.lastfm_listeners
          FROM artists a
         WHERE a.id = ANY(:ids)
         ORDER BY a.deezer_fans DESC NULLS LAST, a.id
         LIMIT :lim
    """), {"ids": list(ids), "lim": limit}).all()


def _upcoming_counts(db: Session, artist_ids: list) -> tuple[dict, dict]:
    """How many upcoming concerts and festivals each of these acts has. One trip for both.

    Counted, never estimated — an act we hold no date for comes back absent rather than as
    a zero someone might read as "they are not touring".
    """
    if not artist_ids:
        return {}, {}
    rows = db.execute(text("""
        SELECT 'e' AS kind, ea.artist_id AS aid, count(DISTINCT ea.event_id) AS n
          FROM event_artists ea JOIN events e ON e.id = ea.event_id
         WHERE ea.artist_id = ANY(:ids)
           AND e.merged_into IS NULL AND e.starts_at >= :cutoff
         GROUP BY ea.artist_id
        UNION ALL
        SELECT 'f' AS kind, fl.artist_id AS aid, count(DISTINCT fl.festival_id) AS n
          FROM festival_lineup fl JOIN festivals f ON f.id = fl.festival_id
         WHERE fl.artist_id = ANY(:ids)
           AND f.merged_into IS NULL
           AND (f.ends_on >= :today OR f.starts_on >= :today OR f.starts_on IS NULL)
         GROUP BY fl.artist_id
    """), {"ids": list(artist_ids),
           "cutoff": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0),
           "today": date.today()}).all()
    return ({r.aid: r.n for r in rows if r.kind == "e"},
            {r.aid: r.n for r in rows if r.kind == "f"})


@router.get("", response_model=SearchAll)
def search_everything(
    q: str = Query(..., min_length=2, description="Artist, concert, festival or city"),
    kind: list[str] | None = Query(None, description="concerts | festivals | artists; all if omitted"),
    when: str | None = Query(None, pattern="^(today|tomorrow|weekend|d7|month|m3|custom)$"),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    country: str | None = Query(None, min_length=2, max_length=2),
    city_id: UUID | None = Query(None),
    onsale: str | None = Query(None, pattern="^(now|coming)$"),
    rating: float | None = Query(None, ge=0, le=10),
    following: bool = Query(False),
    hide_off: bool = Query(False, description="Hide cancelled and postponed shows"),
    sort: str = Query("soonest", pattern="^(soonest|rating)$"),
    tz: str = Query("UTC", description="The caller's IANA zone, so 'today' means their today"),
    user_id: str | None = Depends(get_current_user_id_optional),
    db: Session = Depends(get_db),
):
    """Everything this term matches, and the acts behind it.

    DB-only and instant. No Ticketmaster call and no Deezer call: the app runs the live
    seller search alongside this and merges it in, so the free tier's 5,000 calls a day are
    spent at the same rate as before.
    """
    raw = q.strip()
    safe = ts.escape_like(raw)
    kinds = {k.lower() for k in (kind or [])} or {"concerts", "festivals", "artists"}

    # "Only acts I follow" needs to know who is asking. Signed out it is dropped rather
    # than silently returning nothing, and `applied` below reports that it was dropped.
    uid = UUID(user_id) if (following and user_id) else None
    flt = sf.Filters(
        when=when, date_from=date_from, date_to=date_to, country=country, city_id=city_id,
        onsale=onsale, rating=rating, following=bool(uid), hide_off=hide_off,
        sort=sort, tz=tz, user_id=uid,
    )

    events = (events_matching(db, raw, EVENT_LIMIT, flt)
              if "concerts" in kinds else [])
    festivals = (festivals_matching(db, raw, FEST_LIMIT, flt)
                 if "festivals" in kinds else [])

    artists: list = []
    if "artists" in kinds:
        # With a filter on, an act earns its place by having a show that survived the
        # filter — so the ids of everyone on the matching bills are needed either way.
        lineup = _lineup_ids(db, [e.id for e in events], [f.id for f in festivals])
        named = _artists_by_name(db, raw, safe, ARTIST_LIMIT // 2,
                                 restrict_to=lineup if flt.active else None)
        seen = {a.id for a in named}
        on_bills = _artists_by_ids(db, lineup - seen, ARTIST_LIMIT - len(named))
        pairs = [(a, "name") for a in named] + [(a, "lineup") for a in on_bills]

        ev_counts, fest_counts = _upcoming_counts(db, [a.id for a, _ in pairs])
        artists = [
            SearchArtist(
                id=a.id, name=a.name, image_url=a.image_url,
                deezer_fans=a.deezer_fans, lastfm_listeners=a.lastfm_listeners,
                upcoming_events=ev_counts.get(a.id, 0),
                upcoming_festivals=fest_counts.get(a.id, 0),
                via=via,
            )
            for a, via in pairs
        ]

    applied = [n for n in ("when", "country", "city_id", "onsale", "rating",
                           "following", "hide_off") if getattr(flt, n)]
    return SearchAll(
        artists=artists,
        events=events,
        festivals=festivals,
        counts=SearchCounts(**match_counts(db, raw, flt)),
        applied=applied,
    )
