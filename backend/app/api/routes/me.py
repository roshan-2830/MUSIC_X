import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import func, nulls_last
from sqlalchemy.orm import Session

from app.api.routes.events import _to_list_item, _to_list_items
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.artist import Artist
from app.models.calendar_entry import CalendarEntry
from app.models.city import City
from app.models.event import Event
from app.models.event_artist import EventArtist
from app.models.event_genre import EventGenre
from app.models.follow import Follow
from app.models.genre import Genre
from app.models.profile import Profile
from app.models.taste_profile import TasteProfile
from app.schemas.artist import ArtistOut, BulkFollowIn, FollowArtistIn
from app.schemas.event import EventListItem, RecommendedEvent
from app.schemas.profile import ProfileOut, ProfileUpdate
from app.services.deezer import _norm
from app.services.ingestion import search_and_ingest
from app.services.scoring import score_events_by_ids
from app.services.taste import bucketize, genre_weights

router = APIRouter(prefix="/me", tags=["me"])


def _to_out(db: Session, p: Profile) -> ProfileOut:
    city = db.get(City, p.home_city_id) if p.home_city_id else None
    return ProfileOut(
        id=p.id,
        display_name=p.display_name,
        avatar_url=p.avatar_url,
        home_city_id=p.home_city_id,
        home_city_name=city.name if city else None,
        home_city_country=city.country if city else None,
    )


@router.get("", response_model=ProfileOut)
def get_me(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    profile = db.get(Profile, uid)
    if not profile:                       # first sign-in → create the profile row
        profile = Profile(id=uid)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return _to_out(db, profile)


@router.put("", response_model=ProfileOut)
def update_me(
    body: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(user_id)
    profile = db.get(Profile, uid)
    if not profile:
        profile = Profile(id=uid)
        db.add(profile)

    data = body.model_dump(exclude_unset=True)   # only the fields the client actually sent
    if "display_name" in data:
        profile.display_name = data["display_name"]
    if "home_city_id" in data:
        profile.home_city_id = data["home_city_id"]

    db.commit()
    db.refresh(profile)
    return _to_out(db, profile)


@router.get("/saves", response_model=list[EventListItem])
def list_saves(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """The user's saved shows, soonest first."""
    uid = uuid.UUID(user_id)
    events = (
        db.query(Event)
        .join(CalendarEntry, CalendarEntry.event_id == Event.id)
        .filter(CalendarEntry.user_id == uid, CalendarEntry.is_suggestion.is_(False))
        .order_by(nulls_last(Event.starts_at.asc()))
        .all()
    )
    return _to_list_items(db, events)


@router.post("/saves/{event_id}", status_code=204)
def save_event(event_id: UUID, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    exists = db.query(CalendarEntry).filter_by(user_id=uid, event_id=event_id).first()
    if not exists:
        db.add(CalendarEntry(user_id=uid, event_id=event_id, state="interested", is_suggestion=False))
        db.commit()


@router.delete("/saves/{event_id}", status_code=204)
def unsave_event(event_id: UUID, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    db.query(CalendarEntry).filter_by(user_id=uid, event_id=event_id).delete()
    db.commit()


# ---- Followed artists — the taste graph that drives Recommended + alerts ----

def _get_or_create_artist(db: Session, name: str, image_url: str | None) -> Artist:
    """Reconcile a followed artist to a single local row. Reuse an existing row with the
    same name (case-insensitive) — so following 'Coldplay' points at the row ingestion
    already links to events — otherwise create one. Backfill a missing image."""
    name = name.strip()
    artist = (
        db.query(Artist)
        .filter(func.lower(Artist.name) == name.lower())
        .order_by(Artist.id)
        .first()
    )
    if artist:
        if image_url and not artist.image_url:
            artist.image_url = image_url
        return artist
    artist = Artist(name=name, image_url=image_url)
    db.add(artist)
    db.flush()  # populate artist.id without ending the transaction
    return artist


def _ingest_artist_shows(name: str) -> None:
    """Best-effort: pull an artist's shows from Ticketmaster into the catalogue, so a
    freshly-followed artist's real tour dates can surface in recommendations. Runs in the
    background (Ticketmaster has no South Asia data, so Indian artists still return nothing)."""
    try:
        ids = search_and_ingest(name)
        if ids:
            score_events_by_ids(ids)
    except Exception:
        pass


@router.get("/follows", response_model=list[ArtistOut])
def list_follows(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """The artists this user follows, most-recently-followed first."""
    uid = uuid.UUID(user_id)
    return (
        db.query(Artist)
        .join(Follow, Follow.followable_id == Artist.id)
        .filter(Follow.user_id == uid, Follow.followable_type == "artist")
        .order_by(Follow.created_at.desc())
        .all()
    )


@router.post("/follows", response_model=ArtistOut, status_code=201)
def follow_artist(
    body: FollowArtistIn,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Follow an artist (from a search result). Idempotent — following twice is a no-op.
    Kicks off a background pull of that artist's Ticketmaster shows so their tour dates
    can show up in recommendations shortly after."""
    uid = uuid.UUID(user_id)
    artist = _get_or_create_artist(db, body.name, body.image_url)
    exists = (
        db.query(Follow)
        .filter_by(user_id=uid, followable_type="artist", followable_id=artist.id)
        .first()
    )
    if not exists:
        db.add(Follow(user_id=uid, followable_type="artist", followable_id=artist.id))
        background_tasks.add_task(_ingest_artist_shows, artist.name)
    db.commit()
    db.refresh(artist)
    return artist


@router.post("/follows/bulk", response_model=list[ArtistOut])
def follow_artists_bulk(
    body: BulkFollowIn,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Follow many artists at once (e.g. a Spotify import). Idempotent and de-duped —
    artists already followed are simply left in place. Returns the whole batch."""
    uid = uuid.UUID(user_id)
    out: list[Artist] = []
    seen: set = set()
    for a in body.artists:
        artist = _get_or_create_artist(db, a.name, a.image_url)
        if artist.id in seen:
            continue
        seen.add(artist.id)
        exists = (
            db.query(Follow)
            .filter_by(user_id=uid, followable_type="artist", followable_id=artist.id)
            .first()
        )
        if not exists:
            db.add(Follow(user_id=uid, followable_type="artist", followable_id=artist.id))
            background_tasks.add_task(_ingest_artist_shows, artist.name)
        out.append(artist)

    # Build the genre taste profile from the imported artists' genres (Spotify only).
    all_genres = [g for a in body.artists for g in (a.genres or [])]
    weights = genre_weights(all_genres)
    if weights:
        tp = db.query(TasteProfile).filter_by(user_id=uid).first()
        if not tp:
            tp = TasteProfile(user_id=uid)
            db.add(tp)
        tp.genre_weights = weights
        tp.core_artist_ids = [a.id for a in out]
        tp.source = "spotify"
        tp.refreshed_at = datetime.now(timezone.utc)

    db.commit()
    for artist in out:
        db.refresh(artist)
    return out


@router.delete("/follows/{artist_id}", status_code=204)
def unfollow_artist(
    artist_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    uid = uuid.UUID(user_id)
    db.query(Follow).filter_by(
        user_id=uid, followable_type="artist", followable_id=artist_id
    ).delete()
    db.commit()


@router.get("/recommended", response_model=list[RecommendedEvent])
def recommended(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Upcoming events matched to the user's taste — soonest first within each tier.

    Tier A: the line-up features an artist the user follows / listens to.
    Tier B (discovery): the event's genre matches a genre the user loves, even when no
    artist they know is playing. Every result carries an honest, explainable reason.
    Empty only when we have neither followed artists nor a genre profile."""
    uid = uuid.UUID(user_id)
    followed = (
        db.query(Artist)
        .join(Follow, Follow.followable_id == Artist.id)
        .filter(Follow.user_id == uid, Follow.followable_type == "artist")
        .all()
    )
    tp = db.query(TasteProfile).filter_by(user_id=uid).first()
    genre_w: dict = (tp.genre_weights if tp else None) or {}
    if not followed and not genre_w:
        return []

    followed_norms: dict[str, str] = {}      # normalized name -> display name
    for a in followed:
        followed_norms.setdefault(_norm(a.name), a.name)

    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    upcoming = (Event.starts_at >= cutoff) | (Event.starts_at.is_(None))
    far_future = datetime.max.replace(tzinfo=timezone.utc)

    # ---- Tier A: artist matches — via the full line-up AND the headliner ----
    # (search-ingested events set only headliner_artist_id, not event_artists rows,
    # so we must check both or those shows never surface.)
    lineup_rows = (
        db.query(Event, Artist.name)
        .join(EventArtist, EventArtist.event_id == Event.id)
        .join(Artist, EventArtist.artist_id == Artist.id)
        .filter(Event.merged_into.is_(None), upcoming)
        .all()
    )
    headliner_rows = (
        db.query(Event, Artist.name)
        .join(Artist, Event.headliner_artist_id == Artist.id)
        .filter(Event.merged_into.is_(None), upcoming)
        .all()
    )
    tier_a: dict = {}        # event_id -> (Event, artist display name)
    for ev, artist_name in lineup_rows + headliner_rows:
        n = _norm(artist_name)
        if n in followed_norms and ev.id not in tier_a:
            tier_a[ev.id] = (ev, followed_norms[n])

    # ---- Tier B: genre discovery, excluding anything already matched by artist ----
    tier_b: dict = {}        # event_id -> (Event, bucket, weight)
    if genre_w:
        genre_rows = (
            db.query(Event, Genre.name)
            .join(EventGenre, EventGenre.event_id == Event.id)
            .join(Genre, EventGenre.genre_id == Genre.id)
            .filter(Event.merged_into.is_(None), upcoming)
            .all()
        )
        for ev, gname in genre_rows:
            if ev.id in tier_a or ev.id in tier_b:
                continue
            b = bucketize(gname)
            if b and b in genre_w:
                tier_b[ev.id] = (ev, b, genre_w[b])

    # Tier A by date; Tier B by taste weight (desc), then date.
    a_ordered = sorted(tier_a.values(), key=lambda p: p[0].starts_at or far_future)
    b_ordered = sorted(tier_b.values(), key=lambda p: (-p[2], p[0].starts_at or far_future))

    events = [ev for ev, _ in a_ordered] + [ev for ev, _, _ in b_ordered]
    meta: dict = {}          # event_id -> (kind, label, full reason)
    for ev, name in a_ordered:
        meta[ev.id] = ("artist", name, f"Because you follow {name}")
    for ev, bucket, _w in b_ordered:
        meta[ev.id] = ("genre", bucket, f"Matches your {bucket} taste")

    out = []
    for item in _to_list_items(db, events):
        kind, label, reason = meta[item.id]
        out.append(RecommendedEvent(
            **item.model_dump(), reason=reason, reason_label=label, reason_kind=kind,
        ))
    return out