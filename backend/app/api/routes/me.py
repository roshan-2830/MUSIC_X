import uuid
from datetime import datetime, timezone
from uuid import UUID

from datetime import date as date_cls, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, nulls_last, or_
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
from app.models.venue import Venue
from app.models.genre import Genre
from app.models.festival import Festival
from app.models.lastfm_account import LastfmAccount
from app.models.profile import Profile
from app.models.taste_profile import TasteProfile
from app.api.routes.festivals import _cities_for, _to_out as _festival_out
from app.schemas.artist import ArtistOut, BulkFollowIn, FollowArtistIn
from app.schemas.festival import FestivalOut
from app.schemas.event import CalendarEvent, CalendarPayload, EventListItem, RecommendedEvent
from app.schemas.profile import ProfileOut, ProfileUpdate
from app.services import artist_lookup
from app.services.deezer import _norm
from app.services.ingestion import search_and_ingest
from app.services.scoring import score_events_by_ids
from app.services.taste import bucketize, genre_weights
from app.services.taste_import import disconnect_lastfm, import_lastfm

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


# ---- Saved festivals -----------------------------------------------------------
# Same table, same promise as a saved show. Declared before /saves/{event_id} would be
# ambiguous only if the paths were the same depth — they are not, but keeping these
# together makes the pair obvious to the next reader.

@router.get("/saves/festivals", response_model=list[FestivalOut])
def list_saved_festivals(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """The user's saved festivals, soonest first."""
    uid = uuid.UUID(user_id)
    fests = (
        db.query(Festival)
        .join(CalendarEntry, CalendarEntry.festival_id == Festival.id)
        .filter(CalendarEntry.user_id == uid, CalendarEntry.is_suggestion.is_(False))
        .order_by(nulls_last(Festival.starts_on.asc()))
        .all()
    )
    cities = _cities_for(db, fests)
    return [_festival_out(f, cities.get(f.city_id) if f.city_id else None) for f in fests]


@router.post("/saves/festivals/{festival_id}", status_code=204)
def save_festival(festival_id: UUID, user_id: str = Depends(get_current_user_id),
                  db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    if not db.get(Festival, festival_id):
        raise HTTPException(404, "Festival not found")
    exists = db.query(CalendarEntry).filter_by(user_id=uid, festival_id=festival_id).first()
    if not exists:
        db.add(CalendarEntry(user_id=uid, festival_id=festival_id,
                             state="interested", is_suggestion=False))
        db.commit()


@router.delete("/saves/festivals/{festival_id}", status_code=204)
def unsave_festival(festival_id: UUID, user_id: str = Depends(get_current_user_id),
                    db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    db.query(CalendarEntry).filter_by(user_id=uid, festival_id=festival_id).delete()
    db.commit()


# ---- The Calendar page --------------------------------------------------------
# One window of time, in one of two scopes. The month grid, the 14-day strip and the
# agenda all read this same payload, so what a dot means and what a card says can never
# drift apart.

def _followed_ids(db: Session, uid) -> tuple[set, set]:
    """(followed artist ids, followed city ids)."""
    arts, cits = set(), set()
    for f in db.query(Follow).filter(Follow.user_id == uid).all():
        (arts if f.followable_type == "artist" else cits).add(f.followable_id)
    return arts, cits


@router.get("/calendar", response_model=CalendarPayload)
def calendar(
    start: date_cls = Query(..., description="first day shown, inclusive"),
    end: date_cls = Query(..., description="last day shown, inclusive"),
    mode: str = Query("mine", pattern="^(mine|city)$"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Everything sitting on a date between `start` and `end`.

    mode=mine — ONLY what this person saved: bookmarked concerts and bookmarked festivals.
                Nothing else. A calendar is a list of commitments, and an entry nobody put
                there is not one. It used to also include anything by a followed artist or
                in a followed city, which is how a calendar showed 22 shows against zero
                saves — the eyebrow explained the split, but the page still read as a list
                of plans. Those shows are not lost: Home's Recommended row is built from
                exactly the same follow graph, which is the right place to DISCOVER a show,
                as opposed to the place that says you are going to it.
    mode=city — what is on in their home city, whoever is playing: both the concerts and
                the festivals held there. Unchanged — this scope never claimed the shows
                were yours, it says whose city it is in the label.
    """
    uid = uuid.UUID(user_id)
    if end < start:
        raise HTTPException(400, "end must not be before start")
    if (end - start).days > 400:
        raise HTTPException(400, "window too wide (max 400 days)")

    # starts_at is a timestamp, so the upper bound is the start of the day after `end`.
    lo, hi = start, end + timedelta(days=1)
    window = and_(Event.starts_at >= lo, Event.starts_at < hi)

    saved_event_ids = {
        r[0] for r in db.query(CalendarEntry.event_id)
        .filter(CalendarEntry.user_id == uid, CalendarEntry.event_id.isnot(None)).all()
    }
    booked_event_ids = {
        r[0] for r in db.query(CalendarEntry.event_id)
        .filter(CalendarEntry.user_id == uid, CalendarEntry.event_id.isnot(None),
                CalendarEntry.booked.is_(True)).all()
    }
    saved_festival_ids = {
        r[0] for r in db.query(CalendarEntry.festival_id)
        .filter(CalendarEntry.user_id == uid, CalendarEntry.festival_id.isnot(None)).all()
    }
    followed_artists, followed_cities = _followed_ids(db, uid)
    lineup_matches: set = set()
    followed_city_venue_ids = {
        r[0] for r in db.query(Venue.id).filter(Venue.city_id.in_(followed_cities)).all()
    } if followed_cities else set()

    prof = db.get(Profile, uid)

    # Events with a followed artist anywhere on the bill, not just headlining. Needed by
    # the tagger in BOTH modes: a support-act match used to render as a card with no
    # reason shown, because the filter checked the whole bill and the tagger only checked
    # headliners. Computed outside the mode branch so the city scope tags them too.
    if followed_artists:
        by_lineup = (db.query(EventArtist.event_id)
                       .filter(EventArtist.artist_id.in_(followed_artists)).subquery())
        lineup_matches = {r[0] for r in db.query(by_lineup.c.event_id).all()}

    q = db.query(Event).filter(Event.merged_into.is_(None), Event.retired_at.is_(None), window)
    if mode == "mine":
        # Saved only. No follow-derived clauses: this scope answers "what am I going to",
        # and the only honest source for that is what the person bookmarked.
        events = q.filter(Event.id.in_(saved_event_ids)).all() if saved_event_ids else []
    else:
        events = (
            q.join(Venue, Venue.id == Event.venue_id)
             .filter(Venue.city_id == prof.home_city_id).all()
            if prof and prof.home_city_id else []
        )

    # Up to two genres per event, for the card footer.
    genres: dict = {}
    if events:
        for eid, gname in (
            db.query(EventGenre.event_id, Genre.name)
            .join(Genre, Genre.id == EventGenre.genre_id)
            .filter(EventGenre.event_id.in_([e.id for e in events])).all()
        ):
            genres.setdefault(eid, []).append(gname)

    def tag_for(ev) -> str | None:
        """Narrow on purpose — one label, strongest claim first. A cancellation outranks
        everything: it is the thing the person most needs to see."""
        if ev.status == "cancelled":
            return "cancelled"
        if ev.status == "postponed":
            return "postponed"
        if ev.id in booked_event_ids:
            return "ticket"
        if ev.id in saved_event_ids:
            return "plan"
        if ev.headliner_artist_id in followed_artists or ev.id in lineup_matches:
            return "following"
        if ev.venue_id in followed_city_venue_ids:
            return "city"
        return None

    items = _to_list_items(db, events)
    out_events = [
        CalendarEvent(
            **item.model_dump(),
            saved=ev.id in saved_event_ids,
            booked=ev.id in booked_event_ids,
            tag_kind=tag_for(ev),
            genres=genres.get(ev.id, [])[:2],
        )
        for ev, item in zip(events, items)
    ]
    out_events.sort(key=lambda e: e.starts_at or datetime.max.replace(tzinfo=timezone.utc))

    # A festival counts as "in the window" if any of its days fall inside it.
    fq = db.query(Festival).filter(
        Festival.merged_into.is_(None),
        Festival.starts_on.isnot(None),
        Festival.starts_on <= end,
        func.coalesce(Festival.ends_on, Festival.starts_on) >= start,
    )
    if mode == "mine":
        fests = fq.filter(Festival.id.in_(saved_festival_ids)).all() if saved_festival_ids else []
    else:
        # In the city scope, festivals are filtered to that city too. An earlier version
        # showed every festival everywhere, on the theory that people travel for them —
        # but with a real catalogue that meant 95 of the 97 festivals under "All in
        # London" were not in London, and they buried the 56 shows that were. A tab that
        # names a city has to mean it.
        fests = (
            fq.filter(Festival.city_id == prof.home_city_id).all()
            if prof and prof.home_city_id else []
        )
    fcities = _cities_for(db, fests)
    out_fests = []
    for f in sorted(fests, key=lambda f: f.starts_on):
        o = _festival_out(f, fcities.get(f.city_id) if f.city_id else None)
        o.saved = f.id in saved_festival_ids
        out_fests.append(o)

    return CalendarPayload(events=out_events, festivals=out_fests)


# ---- Followed artists — the taste graph that drives Recommended + alerts ----

def _get_or_create_artist(db: Session, name: str, image_url: str | None) -> Artist:
    """Reconcile a followed artist to a single local row. Reuse an existing row with the
    same name (case-insensitive) — so following 'Coldplay' points at the row ingestion
    already links to events — otherwise create one. Backfill a missing image."""
    name = name.strip()
    # Shared find-or-create. Matching used to be case-insensitive only, so following
    # 'AR Rahman' created a row beside the existing 'A.R. Rahman' and the same act showed
    # up twice in the Following list, with the same photo, and no way to tell them apart.
    return artist_lookup.get_or_create(db, name, image_url)


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
    if not followed and not genre_w and not (tp and tp.core_artist_ids):
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
        .filter(Event.merged_into.is_(None), Event.retired_at.is_(None), upcoming)
        .all()
    )
    headliner_rows = (
        db.query(Event, Artist.name)
        .join(Artist, Event.headliner_artist_id == Artist.id)
        .filter(Event.merged_into.is_(None), Event.retired_at.is_(None), upcoming)
        .all()
    )
    # Artists from a connected Last.fm account. Kept separate from follows because the
    # promise is different: a follow means "alert me", listening means "this is my taste".
    # So these rank recommendations but never trigger a notification, and the reason says
    # which one it was — "Because you follow X" vs "You listen to X".
    listened_norms: dict[str, str] = {}
    if tp and (tp.core_artist_ids or tp.adjacent_artist_ids):
        ids = list(tp.core_artist_ids or []) + list(tp.adjacent_artist_ids or [])
        for a in db.query(Artist).filter(Artist.id.in_(ids)).all():
            listened_norms.setdefault(_norm(a.name), a.name)

    tier_a: dict = {}        # event_id -> (Event, artist display name, kind)
    for ev, artist_name in lineup_rows + headliner_rows:
        n = _norm(artist_name)
        if ev.id in tier_a:
            continue
        if n in followed_norms:
            tier_a[ev.id] = (ev, followed_norms[n], "artist")
        elif n in listened_norms:
            tier_a[ev.id] = (ev, listened_norms[n], "listened")

    # ---- Tier B: genre discovery, excluding anything already matched by artist ----
    tier_b: dict = {}        # event_id -> (Event, bucket, weight)
    if genre_w:
        genre_rows = (
            db.query(Event, Genre.name)
            .join(EventGenre, EventGenre.event_id == Event.id)
            .join(Genre, EventGenre.genre_id == Genre.id)
            .filter(Event.merged_into.is_(None), Event.retired_at.is_(None), upcoming)
            .all()
        )
        for ev, gname in genre_rows:
            if ev.id in tier_a or ev.id in tier_b:
                continue
            b = bucketize(gname)
            if b and b in genre_w:
                tier_b[ev.id] = (ev, b, genre_w[b])

    # Tier A by date; Tier B by taste weight (desc), then date.
    # Followed artists lead, then the ones they merely listen to — a follow is a stronger
    # statement than a play count. Each group by date within itself.
    a_ordered = sorted(tier_a.values(),
                       key=lambda p: (0 if p[2] == "artist" else 1, p[0].starts_at or far_future))
    b_ordered = sorted(tier_b.values(), key=lambda p: (-p[2], p[0].starts_at or far_future))

    events = [ev for ev, _, _ in a_ordered] + [ev for ev, _, _ in b_ordered]
    meta: dict = {}          # event_id -> (kind, label, full reason)
    for ev, name, kind in a_ordered:
        meta[ev.id] = (
            ("artist", name, f"Because you follow {name}") if kind == "artist"
            else ("listened", name, f"You listen to {name} on Last.fm")
        )
    for ev, bucket, _w in b_ordered:
        meta[ev.id] = ("genre", bucket, f"Matches your {bucket} taste")

    out = []
    for item in _to_list_items(db, events):
        kind, label, reason = meta[item.id]
        out.append(RecommendedEvent(
            **item.model_dump(), reason=reason, reason_label=label, reason_kind=kind,
        ))
    return out

# ---- Last.fm: the taste source Spotify stopped being --------------------------
# A username is all this needs, because Last.fm profiles are public. That is also why the
# username is never treated as a login: anyone could type anyone's.

class LastfmConnectIn(BaseModel):
    username: str


@router.get("/lastfm")
def lastfm_status(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Whether a Last.fm account is connected, and what it gave us."""
    uid = uuid.UUID(user_id)
    acct = db.get(LastfmAccount, uid)
    if not acct:
        return {"connected": False}
    tp = db.query(TasteProfile).filter_by(user_id=uid).first()
    weights = (tp.genre_weights if tp else None) or {}
    return {
        "connected": True,
        "username": acct.username,
        "realname": acct.realname,
        "image_url": acct.image_url,
        "playcount": acct.playcount,
        "last_synced_at": acct.last_synced_at,
        "core_artists": len(tp.core_artist_ids or []) if tp else 0,
        "total_artists": (len(tp.core_artist_ids or []) + len(tp.adjacent_artist_ids or [])) if tp else 0,
        "genres": sorted(weights, key=weights.get, reverse=True)[:8],
    }


@router.post("/lastfm")
def lastfm_connect(body: LastfmConnectIn,
                   user_id: str = Depends(get_current_user_id),
                   db: Session = Depends(get_db)):
    """Connect (or re-sync) a Last.fm account and build the taste profile from it."""
    uid = uuid.UUID(user_id)
    result = import_lastfm(db, uid, body.username)
    if not result.get("ok"):
        db.rollback()
        raise HTTPException(status_code=400, detail=result.get("message", "Could not connect"))
    db.commit()
    return result


@router.delete("/lastfm", status_code=204)
def lastfm_disconnect(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Disconnect and delete the profile it built — nothing is kept behind."""
    disconnect_lastfm(db, uuid.UUID(user_id))
    db.commit()
