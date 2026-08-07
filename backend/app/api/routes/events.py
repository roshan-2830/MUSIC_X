from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import nulls_last
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.event import Event
from app.models.venue import Venue
from app.models.city import City
from app.models.artist import Artist
from app.models.event_artist import EventArtist
from app.models.event_genre import EventGenre
from app.models.genre import Genre
from app.models.event_offer import EventOffer
from app.schemas.event import EventListItem, EventDetail, ArtistOut, OfferOut

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
        mxs=float(ev.mxs) if ev.mxs is not None else None,
        confidence=ev.confidence,
        price_from_amount=float(ev.price_from_amount) if ev.price_from_amount is not None else None,
        price_from_currency=ev.price_from_currency,
    )


@router.get("", response_model=list[EventListItem])
def list_events(
    sort: str = Query("date", pattern="^(date|mxs)$"),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Event).filter(Event.merged_into.is_(None))
    if sort == "mxs":
        q = q.order_by(nulls_last(Event.mxs.desc()))
    else:
        q = q.order_by(nulls_last(Event.starts_at.asc()))
    return [_to_list_item(db, e) for e in q.limit(limit).all()]


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

    base = _to_list_item(db, ev).model_dump()
    return EventDetail(**base, lineup=lineup, genres=genres, offers=offers)
