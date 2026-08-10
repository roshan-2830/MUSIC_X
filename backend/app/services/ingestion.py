from datetime import datetime, date

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.city import City
from app.models.venue import Venue
from app.models.artist import Artist
from app.models.genre import Genre
from app.models.event import Event
from app.models.event_artist import EventArtist
from app.models.event_genre import EventGenre
from app.models.event_offer import EventOffer
from app.models.event_source import EventSource
from app.services.ticketmaster import fetch_music_events, search_music_events


def _get_or_create(db, model, defaults=None, **filters):
    obj = db.query(model).filter_by(**filters).first()
    if obj:
        return obj
    obj = model(**{**filters, **(defaults or {})})
    db.add(obj)
    db.flush()
    return obj


def _parse_start(dates):
    start = dates.get("start", {})
    if start.get("dateTime"):
        try:
            return datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
        except ValueError:
            pass
    if start.get("localDate"):
        try:
            return datetime.fromisoformat(start["localDate"] + "T00:00:00+00:00")
        except ValueError:
            pass
    return None


def _map_status(dates):
    code = (dates.get("status") or {}).get("code")
    if code == "cancelled":
        return "cancelled"
    if code in ("postponed", "rescheduled"):
        return "postponed"
    return "scheduled"


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def upsert_event(db: Session, e: dict, full: bool = True):
    """Map ONE raw Ticketmaster event into our DB (create or update its rows).

    full=True  (nightly import): write everything — lineup, genres, offers.
    full=False (live search): write only the event core + city + venue +
               headliner + price. That's all a search result needs to display,
               open, and be scored — and it keeps search fast (far fewer writes
               to the remote DB). The rest is filled in later by the full import.

    Returns (event, created):
      - event   = the Event row, or None if the raw payload was unusable (skipped)
      - created = True if a brand-new Event was inserted, False if one was updated
    """
    tm_id, name = e.get("id"), e.get("name")
    if not tm_id or not name:
        return None, False

    emb = e.get("_embedded", {})
    dates = e.get("dates", {})

    venue = None
    vlist = emb.get("venues") or []
    if vlist:
        v = vlist[0]
        loc = v.get("location") or {}
        city_obj = None
        cname = (v.get("city") or {}).get("name")
        ccode = (v.get("country") or {}).get("countryCode")
        if cname and ccode:
            city_obj = _get_or_create(
                db, City, name=cname, country=ccode[:2],
                defaults={"timezone": v.get("timezone"),
                          "lat": _num(loc.get("latitude")),
                          "lng": _num(loc.get("longitude"))},
            )
        if v.get("name"):
            venue = _get_or_create(
                db, Venue, name=v["name"],
                city_id=(city_obj.id if city_obj else None),
                defaults={"lat": _num(loc.get("latitude")),
                          "lng": _num(loc.get("longitude"))},
            )

    attractions = emb.get("attractions") or []
    headliner = None
    if attractions and attractions[0].get("name"):
        headliner = _get_or_create(db, Artist, name=attractions[0]["name"])

    pr = (e.get("priceRanges") or [{}])[0]

    src = db.query(EventSource).filter_by(
        source="ticketmaster", source_event_id=tm_id).first()
    if src:
        event = db.get(Event, src.event_id)
        created = False
    else:
        event = Event()
        db.add(event)
        created = True

    event.title = name
    event.starts_at = _parse_start(dates)
    event.timezone = dates.get("timezone")
    event.status = _map_status(dates)
    event.headliner_artist_id = headliner.id if headliner else None
    event.venue_id = venue.id if venue else None
    event.price_from_amount = pr.get("min")
    event.price_from_currency = pr.get("currency")
    event.confidence = "low"
    event.last_verified = date.today()
    db.flush()

    if not src:
        db.add(EventSource(event_id=event.id, source="ticketmaster",
                           source_event_id=tm_id, source_url=e.get("url")))

    # Live-search mode: stop here. The event, its venue/city, headliner and price
    # are enough to show a result and score it; skip the extra round-trips.
    if not full:
        return event, created

    if e.get("url") and not db.query(EventOffer).filter_by(
            event_id=event.id, seller_name="Ticketmaster").first():
        db.add(EventOffer(event_id=event.id, seller_name="Ticketmaster",
                          url=e.get("url"), is_official=True))

    # line-up — dedupe within this event (in-memory + existing rows)
    seen_artists = {ea.artist_id for ea in
                    db.query(EventArtist).filter_by(event_id=event.id).all()}
    for i, att in enumerate(attractions):
        if not att.get("name"):
            continue
        artist = _get_or_create(db, Artist, name=att["name"])
        if artist.id in seen_artists:
            continue
        seen_artists.add(artist.id)
        db.add(EventArtist(event_id=event.id, artist_id=artist.id,
                           is_headliner=(i == 0), sort_order=i))

    # genres — dedupe within this event (Ticketmaster repeats the same genre)
    seen_genres = {eg.genre_id for eg in
                   db.query(EventGenre).filter_by(event_id=event.id).all()}
    for c in e.get("classifications") or []:
        gname = (c.get("genre") or {}).get("name")
        if not gname or gname.lower() in ("undefined", "other"):
            continue
        genre = _get_or_create(db, Genre, name=gname)
        if genre.id in seen_genres:
            continue
        seen_genres.add(genre.id)
        db.add(EventGenre(event_id=event.id, genre_id=genre.id))

    return event, created


def ingest_from_ticketmaster(size: int = 100):
    """Bulk import: fetch broad 'upcoming music' events and upsert them all."""
    events = fetch_music_events(size=size)
    db: Session = SessionLocal()
    created = updated = skipped = 0
    try:
        for e in events:
            event, was_created = upsert_event(db, e)
            if event is None:
                skipped += 1
            elif was_created:
                created += 1
            else:
                updated += 1
        db.commit()
    finally:
        db.close()
    return {"fetched": len(events), "created": created, "updated": updated, "skipped": skipped}


def search_and_ingest(keyword: str, size: int = 20):
    """Live search: query Ticketmaster by keyword, upsert every match, and
    return the affected event IDs (kept in Ticketmaster's relevance order)."""
    events = search_music_events(keyword, size=size)
    db: Session = SessionLocal()
    ids = []
    try:
        for e in events:
            event, _ = upsert_event(db, e, full=False)
            if event is not None:
                ids.append(event.id)
        db.commit()
    finally:
        db.close()
    return ids