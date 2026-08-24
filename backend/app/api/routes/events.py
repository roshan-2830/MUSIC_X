from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import nulls_last, or_
from sqlalchemy.orm import Session, aliased

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

router = APIRouter(prefix="/events", tags=["events"])


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


def _to_list_items(db: Session, events: list[Event]) -> list[EventListItem]:
    """Batch version of _to_list_item — loads all venues + cities in 2 queries
    instead of 2 per event (avoids an N+1 when returning many events)."""
    venue_ids = {e.venue_id for e in events if e.venue_id}
    venues = {v.id: v for v in db.query(Venue).filter(Venue.id.in_(venue_ids)).all()} if venue_ids else {}
    city_ids = {v.city_id for v in venues.values() if v.city_id}
    cities = {c.id: c for c in db.query(City).filter(City.id.in_(city_ids)).all()} if city_ids else {}
    # One more batched query, same reason as venues and cities: never per-event.
    artist_ids = {e.headliner_artist_id for e in events if e.headliner_artist_id}
    artists = ({a.id: a.name for a in db.query(Artist).filter(Artist.id.in_(artist_ids)).all()}
               if artist_ids else {})
    out = []
    for ev in events:
        venue = venues.get(ev.venue_id) if ev.venue_id else None
        city = cities.get(venue.city_id) if venue and venue.city_id else None
        out.append(EventListItem(
            id=ev.id, title=ev.title, starts_at=ev.starts_at, timezone=ev.timezone,
            status=ev.status,
            headliner=artists.get(ev.headliner_artist_id) if ev.headliner_artist_id else None,
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
    db: Session = Depends(get_db),
):
    q = db.query(Event).filter(Event.merged_into.is_(None))
    # Only ongoing/upcoming shows: from the start of today onward (keep undated ones).
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    q = q.filter((Event.starts_at >= cutoff) | (Event.starts_at.is_(None)))
    if city_id:
        q = q.join(Venue, Event.venue_id == Venue.id).filter(Venue.city_id == city_id)
    elif country:
        q = (q.join(Venue, Event.venue_id == Venue.id)
              .join(City, Venue.city_id == City.id)
              .filter(City.country == country.upper()))
    if sort == "mxs":
        q = q.order_by(nulls_last(Event.mxs.desc()))
    else:
        q = q.order_by(nulls_last(Event.starts_at.asc()))
    return _to_list_items(db, q.limit(limit).all())


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
    events = db.query(Event).filter(Event.id.in_(ids)).all()
    by_id = {e.id: e for e in events}
    ordered = [by_id[i] for i in ids if i in by_id]   # keep relevance order
    return _to_list_items(db, ordered)


@router.get("/search-local", response_model=list[EventListItem])
def search_local(
    q: str = Query(..., min_length=1),
    limit: int = Query(60, le=200),
    db: Session = Depends(get_db),
):
    """Search events ALREADY in our database — INSTANT, no live Ticketmaster call.
    Matches by event title, artist (headliner or line-up), or city. The app shows these
    immediately, then supplements with a live search for anything not yet stored."""
    term = f"%{q.strip()}%"
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    upcoming = (Event.starts_at >= cutoff) | (Event.starts_at.is_(None))

    # One query: match title, city, headliner name, OR any line-up artist name.
    LineupArtist = aliased(Artist)
    events = (
        db.query(Event)
        .outerjoin(Venue, Event.venue_id == Venue.id)
        .outerjoin(City, Venue.city_id == City.id)
        .outerjoin(Artist, Event.headliner_artist_id == Artist.id)
        .outerjoin(EventArtist, EventArtist.event_id == Event.id)
        .outerjoin(LineupArtist, EventArtist.artist_id == LineupArtist.id)
        .filter(Event.merged_into.is_(None), upcoming)
        .filter(
            or_(
                Event.title.ilike(term),
                City.name.ilike(term),
                Artist.name.ilike(term),
                LineupArtist.name.ilike(term),
            )
        )
        .distinct()
        .order_by(nulls_last(Event.starts_at.asc()))
        .limit(limit)
        .all()
    )
    return _to_list_items(db, events)


@router.get("/{event_id}", response_model=EventDetail)
def get_event(event_id: UUID, db: Session = Depends(get_db)):
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    lineup = [
        ArtistOut(name=a.name, is_headliner=ea.is_headliner)
        for ea, a in (
            db.query(EventArtist, Artist)
            .join(Artist, EventArtist.artist_id == Artist.id)
            .filter(EventArtist.event_id == ev.id)
            .order_by(EventArtist.sort_order).all()
        )
    ]
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
    return EventDetail(
        **base,
        description=ev.description,
        mxs_breakdown=ev.mxs_breakdown,
        last_verified=ev.last_verified,
        artist_bio=headliner.bio if headliner else None,
        artist_bio_source=headliner.bio_source if headliner else None,
        lineup=lineup, genres=genres, offers=offers,
        facts=facts, missing_facts=missing,
    )