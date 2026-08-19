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
from app.models.artist_similar import ArtistSimilar
from app.models.festival_lineup import FestivalLineup
from app.models.genre import Genre
from app.schemas.artist import ArtistDetail, ArtistSearchResult, SimilarArtist
from app.api.routes.festivals import _cities_for, _to_out, _upcoming
from app.services import deezer, lastfm, wikidata, wikipedia
from app.services.deezer import _norm
from app.services.ingestion import ingest_artist_tour
from app.services.similar import similar_combined

router = APIRouter(prefix="/artists", tags=["artists"])


SIMILAR_REFRESH_DAYS = 30


def _store_similar(db: Session, artist_id, name: str, with_deezer_images: bool) -> bool:
    """Fetch Last.fm similarity and cache it. Returns False if the lookup failed.

    Rows are replaced wholesale, so an act Last.fm stops associating disappears rather
    than lingering. `with_deezer_images` is the expensive half: photos for artists we do
    not already hold cost one Deezer call each, so the first (inline) pass skips them and
    a background pass fills them in.
    """
    rows, ok = lastfm.similar_artists_checked(name, limit=20)
    if not ok:
        return False

    db.query(ArtistSimilar).filter_by(artist_id=artist_id, source="lastfm").delete()
    today = date.today()

    want = [r["name"] for r in rows]
    held = {}
    if want:
        for a in db.query(Artist).filter(Artist.name.in_(want)).all():
            if a.image_url:
                held[_norm(a.name)] = a.image_url

    for r in rows:
        img = held.get(_norm(r["name"]))
        if not img and with_deezer_images:
            try:
                img = deezer.artist_image(r["name"])
            except Exception:
                img = None
        db.add(ArtistSimilar(artist_id=artist_id, name=r["name"], image_url=img,
                             match=r["match"], source="lastfm", fetched_on=today))

    a = db.get(Artist, artist_id)
    if a:
        a.similar_checked_on = today
    return True


def _fill_similar_images(artist_id) -> None:
    """Background: photos for cached rows that do not have one yet (Deezer, one call
    each). Separated from the Last.fm fetch so the section can appear on the FIRST open
    without waiting on twenty image lookups."""
    db = SessionLocal()
    try:
        rows = db.query(ArtistSimilar).filter_by(artist_id=artist_id, source="lastfm") \
                 .filter(ArtistSimilar.image_url.is_(None)).all()
        for r in rows:
            try:
                img = deezer.artist_image(r.name)
            except Exception:
                img = None
            if img:
                r.image_url = img
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _sync_similar(name: str, artist_id) -> None:
    """Background: full monthly refresh — Last.fm plus photos."""
    db = SessionLocal()
    try:
        if _store_similar(db, artist_id, name, with_deezer_images=True):
            db.commit()
        else:
            db.rollback()
    except Exception:
        db.rollback()
    finally:
        db.close()


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

    # Last.fm similarity, refreshed monthly. Cached in artist_similar, so the page reads
    # it from our own DB and never waits on the network.
    if lastfm.enabled():
        cached = (db.query(ArtistSimilar.id)
                    .filter_by(artist_id=artist.id, source="lastfm").first() is not None)
        if not cached:
            # First time we have ever seen this artist. A Last.fm call takes ~0.6s, so we
            # pay it INLINE — otherwise the section is missing on the first open of every
            # artist, which is exactly what happened when you tapped through from Karan
            # Aujla to Diljit Dosanjh. Photos are left to the background pass, because
            # twenty Deezer lookups is a different order of cost.
            if _store_similar(db, artist.id, artist.name, with_deezer_images=False):
                db.commit()
            background.add_task(_fill_similar_images, artist.id)
        elif artist.similar_checked_on is None or (
            (date.today() - artist.similar_checked_on).days > SIMILAR_REFRESH_DAYS
        ):
            background.add_task(_sync_similar, artist.name, artist.id)

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

    # Similar artists — from shared bills and genres. Empty when nothing qualifies.
    similar = [SimilarArtist(**x) for x in similar_combined(db, artist.id, artist.name)]

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
        similar=similar,
    )
