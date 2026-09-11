from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, inspect as sa_inspect, nulls_last, or_, text
from sqlalchemy.orm import Session, aliased, joinedload, load_only

from app.core.security import get_current_user_id_optional
from app.db.session import get_db
from app.models.event import Event
from app.models.venue import Venue
from app.models.city import City
from app.models.artist import Artist
from app.models.event_artist import EventArtist
from app.models.event_genre import EventGenre
from app.models.genre import Genre
from app.models.event_offer import EventOffer
from app.models.event_fact import EventFact
from app.models.event_source import EventSource
from app.services.provenance import display_value, label_for, missing_expected, sort_key
from app.services.trust import confidence_for
from app.schemas.event import FactOut, MissingFactOut, EventListItem, EventDetail, ArtistOut, OfferOut
from app.services.ingestion import search_and_ingest
from app.services.scoring import score_events_by_ids
from app.services import search_filters as sf
from app.services import text_search as ts

router = APIRouter(prefix="/events", tags=["events"])

# How a filtered search orders its results. "soonest" keeps the relevance bands first —
# the whole reason the match is ranked — and sorts by date inside each band. "rating"
# is asked for explicitly, so it leads on the score and breaks ties on the band.
# The match itself, shared by the ranked search and by the filter counts so the two can
# never disagree about what a term matches. Four branches, one per place a term can appear,
# each driven by its own GIN trigram index — see events_matching for why it is not an OR.
_MATCH_CTE = """
        WITH m AS (
            SELECT e.id,
                   CASE WHEN mx_fold(e.title) LIKE mx_fold(:t) || '%' ESCAPE '\\'
                        THEN 0 ELSE 1 END AS rank
              FROM events e
             WHERE mx_fold(e.title) LIKE '%' || mx_fold(:t) || '%' ESCAPE '\\'
            UNION ALL
            SELECT e.id, 2
              FROM artists a JOIN events e ON e.headliner_artist_id = a.id
             WHERE mx_fold(a.name) LIKE '%' || mx_fold(:t) || '%' ESCAPE '\\'
            UNION ALL
            SELECT ea.event_id, 2
              FROM artists a JOIN event_artists ea ON ea.artist_id = a.id
             WHERE mx_fold(a.name) LIKE '%' || mx_fold(:t) || '%' ESCAPE '\\'
            UNION ALL
            SELECT e.id, 3
              FROM cities c
              JOIN venues v ON v.city_id = c.id
              JOIN events e ON e.venue_id = v.id
             WHERE mx_fold(c.name) LIKE '%' || mx_fold(:t) || '%' ESCAPE '\\'
        )
"""

_ORDER = {
    "soonest": "match_rank, e.starts_at ASC NULLS LAST",
    "rating": "e.mxs DESC NULLS LAST, match_rank, e.starts_at ASC NULLS LAST",
}


def _to_list_item(db: Session, ev: Event) -> EventListItem:
    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    city = db.get(City, venue.city_id) if venue and venue.city_id else None
    return EventListItem(
        id=ev.id, title=ev.title, starts_at=ev.starts_at, timezone=ev.timezone,
        status=ev.status,
        venue_name=venue.name if venue else None,
        city=city.name if city else None,
        country=city.country if city else None,
        image_url=ev.image_url,
        mxs=float(ev.mxs) if ev.mxs is not None else None,
        confidence=confidence_for(
            last_verified=ev.last_verified,
            has_when=ev.starts_at is not None,
            has_where=venue is not None,
        ),
        price_from_amount=float(ev.price_from_amount) if ev.price_from_amount is not None else None,
        price_from_currency=ev.price_from_currency,
    )


def with_related(q):
    """Load an Event query's venue, city and headliner IN THE SAME QUERY.

    Apply this to any Event query whose rows are handed to _to_list_items. Without it the
    serialiser has to fetch those three things itself, which is three extra round trips to the
    database — and a round trip is the expensive unit here, not the row count. On the deployed
    API a single trivial query measured 2.2 seconds, so four trips is most of a slow search.

    joinedload emits LEFT OUTER JOINs rather than follow-up SELECTs, so a search that cost four
    round trips costs one. _to_list_items notices what is already loaded and asks for nothing.
    """
    return q.options(
        joinedload(Event.venue).joinedload(Venue.city),
        joinedload(Event.headliner),
    )


def _unloaded(ev: Event, attr: str) -> bool:
    """True when this attribute would hit the database if touched."""
    return attr in sa_inspect(ev).unloaded


def _to_list_items(db: Session, events: list[Event]) -> list[EventListItem]:
    """Serialise events, fetching ONLY what the caller did not already load.

    Callers that used with_related() arrive with everything joined in, so the loops below query
    nothing at all. Callers that did not still get the old batched behaviour — never one query
    per event. That is why this checks rather than assumes: reading ev.venue on an event that
    was not eager-loaded would lazy-load it, turning a fixed three queries into one per event,
    which is far worse than what it replaced.
    """
    # Venue AND city together. Even on the fallback path this is one query rather than two:
    # a venue's city is a join away, and joining costs nothing next to a second round trip.
    need_venues = {e.venue_id for e in events
                   if e.venue_id and _unloaded(e, "venue")}
    fetched: dict = {}
    if need_venues:
        rows = (db.query(Venue, City)
                  .outerjoin(City, Venue.city_id == City.id)
                  .filter(Venue.id.in_(need_venues)).all())
        fetched = {v.id: (v, c) for v, c in rows}

    need_artists = {e.headliner_artist_id for e in events
                    if e.headliner_artist_id and _unloaded(e, "headliner")}
    names = ({a.id: a.name for a in
              db.query(Artist.id, Artist.name).filter(Artist.id.in_(need_artists)).all()}
             if need_artists else {})

    def venue_city(ev: Event):
        if not ev.venue_id:
            return None, None
        if ev.venue_id in fetched:
            return fetched[ev.venue_id]
        v = ev.venue                      # already loaded — free
        return v, (v.city if v else None)

    def headliner_name(ev: Event):
        if not ev.headliner_artist_id:
            return None
        if ev.headliner_artist_id in names:
            return names[ev.headliner_artist_id]
        a = ev.headliner                  # already loaded — free
        return a.name if a else None

    out = []
    for ev in events:
        venue, city = venue_city(ev)
        out.append(EventListItem(
            id=ev.id, title=ev.title, starts_at=ev.starts_at, timezone=ev.timezone,
            status=ev.status,
            headliner=headliner_name(ev),
            headliner_artist_id=ev.headliner_artist_id,
            venue_name=venue.name if venue else None,
            city=city.name if city else None,
            country=city.country if city else None,
            image_url=ev.image_url,
            mxs=float(ev.mxs) if ev.mxs is not None else None,
            confidence=confidence_for(
                last_verified=ev.last_verified,
                has_when=ev.starts_at is not None,
                has_where=venue is not None,
            ),
            price_from_amount=float(ev.price_from_amount) if ev.price_from_amount is not None else None,
            price_from_currency=ev.price_from_currency,
        ))
    return out


@router.get("", response_model=list[EventListItem])
def list_events(
    sort: str = Query("date", pattern="^(date|mxs)$"),
    limit: int = Query(50, le=200),
    city_id: UUID | None = Query(None),
    country: str | None = Query(None, min_length=2, max_length=2),
    when: str | None = Query(None, pattern="^(today|tomorrow|weekend|d7|month|m3|custom)$"),
    date_from: date_cls | None = Query(None, alias="from"),
    date_to: date_cls | None = Query(None, alias="to"),
    onsale: str | None = Query(None, pattern="^(now|coming)$"),
    rating: float | None = Query(None, ge=0, le=10),
    following: bool = Query(False),
    hide_off: bool = Query(False),
    tz: str = Query("UTC"),
    user_id: str | None = Depends(get_current_user_id_optional),
    db: Session = Depends(get_db),
):
    """The browse list. Takes the same filters as /search, so the funnel means one thing
    everywhere — city_id and country stay as their own params because callers already
    send them that way."""
    q = db.query(Event).filter(Event.merged_into.is_(None), Event.retired_at.is_(None))
    # Only ongoing/upcoming shows: from the start of today onward (keep undated ones).
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    q = q.filter((Event.starts_at >= cutoff) | (Event.starts_at.is_(None)))
    if city_id:
        q = q.join(Venue, Event.venue_id == Venue.id).filter(Venue.city_id == city_id)
    elif country:
        q = (q.join(Venue, Event.venue_id == Venue.id)
              .join(City, Venue.city_id == City.id)
              .filter(City.country == country.upper()))

    flt = sf.Filters(when=when, date_from=date_from, date_to=date_to, onsale=onsale,
                     rating=rating, following=bool(following and user_id),
                     hide_off=hide_off, tz=tz,
                     user_id=UUID(user_id) if (following and user_id) else None)
    clauses, params = sf.event_clauses(flt, "events")
    for c in clauses:
        q = q.filter(text(c))
    if params:
        q = q.params(**params)

    if sort == "mxs":
        q = q.order_by(nulls_last(Event.mxs.desc()))
    else:
        q = q.order_by(nulls_last(Event.starts_at.asc()))
    return _to_list_items(db, with_related(q).limit(limit).all())


@router.get("/countries")
def event_countries(db: Session = Depends(get_db)):
    """Countries we hold upcoming shows in, biggest first — the filter's own option list.

    The old filter offered a hardcoded fifteen, four of which we have almost nothing in, so
    tapping them looked broken. An option that returns nothing should not be offered.
    """
    rows = db.execute(text("""
        SELECT c.country AS code, count(*) AS n
          FROM events e JOIN venues v ON v.id = e.venue_id JOIN cities c ON c.id = v.city_id
         WHERE e.merged_into IS NULL AND e.retired_at IS NULL AND e.starts_at >= now()
         GROUP BY c.country HAVING count(*) >= 25
         ORDER BY n DESC LIMIT 20
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/search", response_model=list[EventListItem])
def search_events(
    q: str = Query(..., min_length=1, description="Keyword: artist, city, or genre"),
    db: Session = Depends(get_db),
):
    """Live search: query Ticketmaster by keyword, upsert + score the matches,
    and return them in Ticketmaster's relevance order."""
    ids = search_and_ingest(q)      # live Ticketmaster -> upsert -> event IDs
    score_events_by_ids(ids)        # MXS score just these results (Deezer)
    if not ids:
        return []
    events = with_related(db.query(Event)).filter(Event.id.in_(ids)).all()
    by_id = {e.id: e for e in events}
    ordered = [by_id[i] for i in ids if i in by_id]   # keep relevance order
    return _to_list_items(db, ordered)


def events_matching(db: Session, raw: str, limit: int,
                    flt: sf.Filters | None = None) -> list[EventListItem]:
    """Events ALREADY in our database that match this term, ranked. No seller call.

    A plain function, not only a route, because /search needs exactly this and calling one
    handler from another is how the two would come to disagree about the same term.

    `flt` narrows the match in SQL. That placement is the point: applied to the rows this
    function already returned, "today" would report nothing whenever none of the top 40
    happened to be today — while 179 shows were on. A filter that lies is worse than no
    filter.
    """
    flt = flt or sf.Filters()
    # The same filters, written twice for two aliases: the ranked match is raw SQL where
    # the table is `e`, the typo tier below is an ORM query where it is `events`. Handing
    # the ORM one the `e` clauses raises "missing FROM-clause entry for table e" — and only
    # for a MISSPELLED term, because that is the only path that reaches the second tier.
    fclauses, fparams = sf.event_clauses(flt, "e")
    oclauses, _ = sf.event_clauses(flt, "events")
    raw = (raw or "").strip()
    # Escape the LIKE wildcards, or a search for "50%" matches the entire catalogue.
    safe = ts.escape_like(raw)
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    upcoming = (Event.starts_at >= cutoff) | (Event.starts_at.is_(None))

    # One query: match title, city, headliner name, OR any line-up artist name.
    LineupArtist = aliased(Artist)

    def joined(query):
        return (
            query
            .outerjoin(Venue, Event.venue_id == Venue.id)
            .outerjoin(City, Venue.city_id == City.id)
            .outerjoin(Artist, Event.headliner_artist_id == Artist.id)
            .outerjoin(EventArtist, EventArtist.event_id == Event.id)
            .outerjoin(LineupArtist, EventArtist.artist_id == LineupArtist.id)
            .filter(Event.merged_into.is_(None), Event.retired_at.is_(None), upcoming)
        )

    # Every comparison folds accents on both sides, so "gulsen" finds Gülşen and "joao"
    # finds João Gomes. Folding only ever widens a match — it cannot drop a row the plain
    # comparison found — so the ranking below is unchanged for anyone typing ASCII.
    #
    # Rank by WHERE the term matched, then by date inside each band. Date alone was the
    # wrong order for a search box: typing "corona" put Corona Capital SIXTH, behind a
    # gospel tour in Corona, California and a mariachi act called Banda Corona Del Rey,
    # because those happen sooner. A search box is asked "find me this thing", not "what
    # is on next" — so a title that begins with what you typed wins, then a title that
    # contains it, then the artists on the bill, and a city match comes last because it is
    # the loosest reading of what you meant.
    # One branch per place the term can match, UNION'd — NOT four OR'd conditions over one
    # big join, which is what this was and why it was slow.
    #
    # Measured 2026-09-09. An OR spanning four TABLES cannot be answered from any single
    # index: Postgres has to build the whole events x event_artists x artists x venues x
    # cities join first — 26,598 rows — and evaluate mx_fold(...) LIKE on every one. The
    # plan was five sequential Seq Scans, the GIN trigram indexes from migration
    # 3396219474a7 were never touched once, and the events scan alone took 3.0s of a 5.4s
    # query. Split into four branches, each branch starts from its OWN indexed column and
    # every one becomes a Bitmap Index Scan: 5,381ms -> 18ms of database time.
    #
    # Written as SQL rather than assembled in the ORM because the shape is the point. A
    # UNION of four differently-shaped selects reads as noise in SQLAlchemy, and the next
    # person needs to see immediately that these are four separate index lookups.
    #
    # min(rank) still collapses an event that matched several ways to its strongest reason,
    # and the bands are unchanged: a title that BEGINS with the term wins, then a title
    # containing it, then the artists (headliner or bill), and a city match comes last
    # because it is the loosest reading of what was meant. Verified against the previous
    # implementation on weekend / weeknd / coldplay / london / wembley / corona / ade:
    # identical ids in identical order, every time.
    rows = db.execute(text(_MATCH_CTE + """
        SELECT m.id, min(m.rank) AS match_rank
          FROM m JOIN events e ON e.id = m.id
         WHERE e.merged_into IS NULL AND e.retired_at IS NULL
           AND (e.starts_at >= :cutoff OR e.starts_at IS NULL)
           """ + sf.sql_and(fclauses) + """
         GROUP BY m.id, e.starts_at, e.mxs
         ORDER BY """ + _ORDER[flt.sort] + """
         LIMIT :lim
    """), {"t": safe, "cutoff": cutoff, "lim": limit, **fparams}).all()

    # Nothing matched, so the term may be misspelled. This tier runs ONLY here, on a screen
    # that would otherwise read "No results" — a search that works today is untouched, and
    # a wrong guess costs nothing where there was nothing.
    #
    # Scored against the ARTIST name, never the title: measured on this catalogue, a short
    # clean name puts the right answer first ("Metalica" -> Metallica, 0.73) while the same
    # call against a long title ranked "Scene Queen: METALICIOUS" above it.
    if not rows and len(raw) >= 4:
        close = or_(ts.is_close(Artist.name, raw), ts.is_close(LineupArtist.name, raw))
        score = func.greatest(
            func.coalesce(ts.similarity(Artist.name, raw), 0),
            func.coalesce(ts.similarity(LineupArtist.name, raw), 0),
        ).label("sim")
        # Headliner before bill, the same order the strict tier uses. Without it "Foo
        # Figthers" led with Rock in Rio — they ARE on that bill, and a bill match scores
        # exactly as high as a headline match, so the tie fell to whichever was sooner.
        # Someone typing a band's name wants that band's own show first.
        fuzzy_rank = case((ts.is_close(Artist.name, raw), 0), else_=1)
        best_rank, best_sim = func.min(fuzzy_rank).label("fr"), func.max(score).label("sim")
        fq = joined(db.query(Event.id, best_rank, best_sim)).filter(close)
        for c in oclauses:
            fq = fq.filter(text(c))
        if fparams:
            fq = fq.params(**fparams)
        rows = (
            fq.group_by(Event.id)
              .order_by(best_rank, best_sim.desc(), nulls_last(Event.starts_at.asc()))
              .limit(limit)
              .all()
        )

    # The ranking above must GROUP BY, and a grouped query cannot also carry the extra columns
    # a join-load needs. So it returns IDS ONLY, and the rows are fetched once, joined — two
    # round trips for the whole endpoint instead of four. On the deployed API, where one round
    # trip measured over two seconds, that is most of the wait.
    ids = [r[0] for r in rows]
    if not ids:
        return []
    # Only the columns EventListItem actually prints. `events` rows average 2.1 kB and two
    # columns are most of that — `description` (Ticketmaster small print) and
    # `mxs_breakdown` (the scorer's own output) — neither of which a list row shows. This
    # is the same fix that took the scoring pass from 1,255 B a row to 458 B; the search
    # path had it too. Measured here: 40 rows fetched in 1,633ms -> 214ms.
    #
    # Proved with raiseload=True, which makes touching a deferred column raise instead of
    # quietly firing one SELECT per event: the whole endpoint completed, so nothing below
    # reads a column that is not in this list.
    found = {e.id: e for e in
             with_related(db.query(Event))
             .options(load_only(
                 Event.id, Event.title, Event.starts_at, Event.timezone, Event.status,
                 Event.headliner_artist_id, Event.venue_id, Event.image_url, Event.mxs,
                 Event.last_verified, Event.price_from_amount, Event.price_from_currency,
             ))
             .filter(Event.id.in_(ids)).all()}
    # Reordered in Python: IN () returns rows in whatever order the database likes, and the
    # ranking is the entire point of this endpoint.
    return _to_list_items(db, [found[i] for i in ids if i in found])


def match_counts(db: Session, raw: str, flt: sf.Filters) -> dict:
    """How many matching concerts sit in each filter bucket, in ONE round trip.

    Every bucket is a `count(*) FILTER (WHERE ...)` over the same matched set, so the whole
    panel costs one query rather than one per option — which matters on an instance where
    the same query has measured 212ms and 1,371ms depending on its mood.

    The counts answer for the TERM and ignore the filters themselves. Two reasons. It keeps
    the numbers still while you tick boxes, instead of every label changing under your
    finger. And a count that ignored the term would be a lie by juxtaposition: "Today (179)"
    beside a search for Coldplay, where tapping it gives you one.
    """
    raw = (raw or "").strip()
    if not raw:
        return {}
    t = sf.today_for(flt.tz)
    we_lo, we_hi = sf.window(sf.Filters(when="weekend", tz=flt.tz))
    _, month_end = sf.window(sf.Filters(when="month", tz=flt.tz))
    day = "((e.starts_at AT TIME ZONE COALESCE(e.timezone, 'UTC'))::date)"
    row = db.execute(text(_MATCH_CTE + f"""
        , ev AS (
            SELECT DISTINCT e.id, {day} AS day, e.mxs, e.status,
                   e.onsale_at, e.sales_end_at
              FROM m JOIN events e ON e.id = m.id
             WHERE e.merged_into IS NULL AND e.retired_at IS NULL
               AND (e.starts_at >= :cutoff OR e.starts_at IS NULL)
        )
        SELECT count(*)                                                    AS total,
               count(*) FILTER (WHERE day = :today)                        AS today,
               count(*) FILTER (WHERE day = :tomorrow)                     AS tomorrow,
               count(*) FILTER (WHERE day BETWEEN :we_lo AND :we_hi)       AS weekend,
               count(*) FILTER (WHERE day BETWEEN :today AND :d7)          AS d7,
               count(*) FILTER (WHERE day BETWEEN :today AND :month_end)   AS month,
               count(*) FILTER (WHERE day BETWEEN :today AND :m3)          AS m3,
               count(*) FILTER (WHERE onsale_at IS NOT NULL AND onsale_at <= now()
                                  AND (sales_end_at IS NULL OR sales_end_at > now()))
                                                                           AS onsale_now,
               count(*) FILTER (WHERE onsale_at > now())                   AS onsale_coming,
               count(*) FILTER (WHERE mxs >= 8)                            AS rating_8,
               count(*) FILTER (WHERE mxs >= 7)                            AS rating_7,
               count(*) FILTER (WHERE status <> 'scheduled')               AS not_scheduled
          FROM ev
    """), {
        "t": ts.escape_like(raw),
        "cutoff": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0),
        "today": t, "tomorrow": t + timedelta(days=1),
        "we_lo": we_lo, "we_hi": we_hi, "d7": t + timedelta(days=6),
        "month_end": month_end, "m3": t + timedelta(days=90),
    }).mappings().first()
    return dict(row) if row else {}


@router.get("/search-local", response_model=list[EventListItem])
def search_local(
    q: str = Query(..., min_length=1),
    limit: int = Query(60, le=200),
    db: Session = Depends(get_db),
):
    """The unfiltered form, kept for anything calling it directly. /search adds filters."""
    return events_matching(db, q, limit)


@router.get("/{event_id}", response_model=EventDetail)
def get_event(event_id: UUID, db: Session = Depends(get_db)):
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    lineup = [
        ArtistOut(name=a.name, is_headliner=ea.is_headliner, image_url=a.image_url)
        for ea, a in (
            db.query(EventArtist, Artist)
            .join(Artist, EventArtist.artist_id == Artist.id)
            .filter(EventArtist.event_id == ev.id)
            .order_by(EventArtist.sort_order).all()
        )
    ]
    # Fall back to the headliner when no bill is stored. This is not a guess: the
    # headliner is on `events` because Ticketmaster named them, and they are unarguably
    # on the bill. Without it the Line-up section rendered on 39 of 3,692 events, because
    # the broad sweep never wrote event_artists rows — so the honest, useful answer was
    # sitting one column away the whole time. Support acts appear once a payload lists
    # them; a line-up of one is a real answer, not a placeholder.
    if not lineup and ev.headliner_artist_id:
        head = db.get(Artist, ev.headliner_artist_id)
        if head:
            lineup = [ArtistOut(name=head.name, is_headliner=True, image_url=head.image_url)]
    genres = [
        name for (name,) in (
            db.query(Genre.name)
            .join(EventGenre, EventGenre.genre_id == Genre.id)
            .filter(EventGenre.event_id == ev.id).all()
        )
    ]
    offers = [
        OfferOut(seller_name=o.seller_name, url=o.url,
                 is_official=o.is_official, is_face_value_resale=o.is_face_value_resale)
        for o in (
            db.query(EventOffer)
            .filter(EventOffer.event_id == ev.id)
            .order_by(EventOffer.is_official.desc(), EventOffer.sort_order).all()
        )
    ]

    # Fallback: search-ingested events have no EventOffer row, but every
    # Ticketmaster event has a source URL — use it so "Get tickets" always works.
    if not offers:
        src = db.query(EventSource).filter_by(event_id=ev.id, source="ticketmaster").first()
        if src and src.source_url:
            offers = [OfferOut(seller_name="Ticketmaster", url=src.source_url,
                               is_official=True, is_face_value_resale=False)]

    # Provenance — the receipts. Ordered so what you plan a night around comes first;
    # whatever the source does not publish is reported as a gap, never filled in.
    rows = db.query(EventFact).filter(EventFact.event_id == ev.id,
                                      EventFact.fact_value.isnot(None)).all()
    rows.sort(key=lambda f: sort_key(f.fact_key))
    facts = [
        FactOut(
            key=f.fact_key, label=label_for(f.fact_key), value=f.fact_value,
            display=display_value(f.fact_key, f.fact_value, ev.timezone),
            source_name=f.source_name, source_url=f.source_url,
            trust_tier=f.trust_tier, last_verified=f.last_verified,
            derived=f.trust_tier == "medium", snapshot=f.snapshot,
        )
        for f in rows
    ]
    missing = [MissingFactOut(key=k, label=label_for(k))
               for k in missing_expected(f.fact_key for f in rows)]

    headliner = db.get(Artist, ev.headliner_artist_id) if ev.headliner_artist_id else None
    base = _to_list_item(db, ev).model_dump()
    map_venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    return EventDetail(
        **base,
        venue_lat=map_venue.lat if map_venue else None,
        venue_lng=map_venue.lng if map_venue else None,
        description=ev.description,
        mxs_breakdown=ev.mxs_breakdown,
        last_verified=ev.last_verified,
        artist_bio=headliner.bio if headliner else None,
        artist_bio_source=headliner.bio_source if headliner else None,
        lineup=lineup, genres=genres, offers=offers,
        facts=facts, missing_facts=missing,
    )