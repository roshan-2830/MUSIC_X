from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import func, nulls_last
from sqlalchemy.orm import Session

from app.api.routes.events import _to_list_items
from app.db.session import SessionLocal, get_db
from app.models.artist import Artist
from app.models.event import Event
from app.models.event_artist import EventArtist
from app.models.event_genre import EventGenre
from app.models.festival import Festival
from app.models.festival_lineup import FestivalLineup
from app.models.genre import Genre
from app.schemas.artist import ArtistDetail, ArtistSearchResult
from app.api.routes.festivals import _cities_for, _to_out, _upcoming
from app.services import deezer, wikidata, wikipedia
from app.services.ingestion import ingest_artist_tour

router = APIRouter(prefix="/artists", tags=["artists"])


def _sync_site(name: str, artist_id) -> None:
    """Background: the artist's official website from Wikidata.

    `artist_official_site` reports whether the lookup COMPLETED separately from whether
    it found anything, and only a completed lookup gets stamped — Wikidata throttles,
    and one throttled call must not become a permanent "this artist has no website".
    """
    site, ok = wikidata.artist_official_site(name)
    if not site and not ok:
        return
    db = SessionLocal()
    try:
        a = db.get(Artist, artist_id)
        if a:
            if site:
                a.website_url = site
            if ok:
                a.links_checked_on = date.today()
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _sync_tour(name: str, artist_id) -> None:
    """Background: fetch the artist's full tour, then stamp the date we did it.

    The stamp is written only on success, so a failed or throttled sync is retried on
    the next visit instead of silently freezing a half-filled tour for a day.
    """
    try:
        ingest_artist_tour(name)
    except Exception:
        return
    db = SessionLocal()
    try:
        a = db.get(Artist, artist_id)
        if a:
            a.tour_synced_on = date.today()
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.get("/search", response_model=list[ArtistSearchResult])
def search_artists(
    q: str = Query(..., min_length=2, description="Artist name"),
    limit: int = Query(20, le=50),
):
    """Search the global artist catalogue (Deezer) so users can find and follow any real
    act — even ones with no show yet."""
    return deezer.search_artists(q, limit)


@router.get("/detail", response_model=ArtistDetail)
def artist_detail(
    background: BackgroundTasks,
    name: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """The artist page — REAL data only (no fabricated stats). Finds (or creates) the
    artist by name, enriches a missing photo from Deezer and a missing cited bio from
    Wikipedia (both cached to the row), and returns their upcoming shows + genres +
    honest counts."""
    clean = name.strip()
    artist = (
        db.query(Artist).filter(func.lower(Artist.name) == clean.lower()).order_by(Artist.id).first()
    )
    if not artist:
        artist = Artist(name=clean)
        db.add(artist)
        db.flush()

    # Enrich on-demand — only fetch what we don't already have; cache to the row.
    if not artist.image_url:
        img = deezer.artist_image(artist.name)
        if img:
            artist.image_url = img
    if not artist.bio or not artist.wiki_url:
        bio, src, wiki = wikipedia.fetch_artist_bio(artist.name)
        if bio:
            artist.bio, artist.bio_source = bio, src
        if wiki:
            artist.wiki_url = wiki

    db.commit()
    db.refresh(artist)

    # Pull this artist's WHOLE tour from the seller, by attraction id — not a keyword
    # search, so a tribute act can never turn up here. Once a day is enough; the daily
    # deep refresh keeps the dates themselves honest after that.
    #
    # It runs AFTER the response, not during it: a 53-date tour plus its provenance took
    # 11.6s inline, which is not a page load. Same DB-first shape as search — show what
    # we hold now, and the fuller list is there on the next open.
    if artist.tour_synced_on != date.today():
        background.add_task(_sync_tour, artist.name, artist.id)

    # The artist's own site (Wikidata P856) is a LINK, not page content — so it also
    # waits until after the response. First open shows Wikipedia only; the official
    # website row appears from the next open on.
    if artist.website_url is None and artist.links_checked_on is None:
        background.add_task(_sync_site, artist.name, artist.id)

    # Upcoming shows: headliner OR line-up, exact (case-insensitive) name match.
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    upcoming = (Event.starts_at >= cutoff) | (Event.starts_at.is_(None))
    lname = artist.name.lower()
    ev_ids: set = set()
    for (eid,) in (
        db.query(Event.id)
        .join(Artist, Event.headliner_artist_id == Artist.id)
        .filter(Event.merged_into.is_(None), upcoming, func.lower(Artist.name) == lname)
        .all()
    ):
        ev_ids.add(eid)
    for (eid,) in (
        db.query(Event.id)
        .join(EventArtist, EventArtist.event_id == Event.id)
        .join(Artist, EventArtist.artist_id == Artist.id)
        .filter(Event.merged_into.is_(None), upcoming, func.lower(Artist.name) == lname)
        .all()
    ):
        ev_ids.add(eid)

    shows = []
    genres = []
    if ev_ids:
        events = (
            db.query(Event)
            .filter(Event.id.in_(ev_ids))
            .order_by(nulls_last(Event.starts_at.asc()))
            .all()
        )
        shows = _to_list_items(db, events)
        genres = [
            g
            for (g,) in db.query(Genre.name)
            .join(EventGenre, EventGenre.genre_id == Genre.id)
            .filter(EventGenre.event_id.in_(ev_ids))
            .distinct()
            .all()
        ]

    # Festivals they are billed on — matched through festival_lineup, so this is the
    # bill as the festival published it, not a guess from the artist's name.
    today = date.today()
    fests = (
        db.query(Festival)
        .join(FestivalLineup, FestivalLineup.festival_id == Festival.id)
        .join(Artist, FestivalLineup.artist_id == Artist.id)
        .filter(func.lower(Artist.name) == lname,
                Festival.merged_into.is_(None),
                _upcoming(today))
        .order_by(nulls_last(Festival.starts_on.asc()))
        .distinct()
        .all()
    )
    fest_cities = _cities_for(db, fests)
    festivals = [_to_out(f, fest_cities.get(f.city_id)) for f in fests]

    city_count = len({s.city for s in shows if s.city})
    return ArtistDetail(
        id=artist.id,
        name=artist.name,
        image_url=artist.image_url,
        bio=artist.bio,
        bio_source=artist.bio_source,
        wiki_url=artist.wiki_url,
        website_url=artist.website_url,
        genres=genres,
        show_count=len(shows),
        city_count=city_count,
        upcoming_shows=shows,
        festivals=festivals,
    )
