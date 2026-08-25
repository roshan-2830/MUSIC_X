import uuid
from datetime import date
from datetime import date as date_cls
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import nulls_last, or_
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.artist import Artist
from app.models.city import City
from app.models.festival import Festival
from app.models.festival_lineup import FestivalLineup
from app.models.follow import Follow
from app.schemas.festival import FestivalArtist, FestivalDetail, FestivalOut
from app.services.deezer import _norm
from app.services.trust import confidence_for

router = APIRouter(prefix="/festivals", tags=["festivals"])


def _to_out(f: Festival, c: City | None, match_count=None, matched=None) -> FestivalOut:
    return FestivalOut(
        id=f.id,
        name=f.name,
        city=c.name if c else None,
        country=c.country if c else None,
        image_url=f.image_url,
        starts_on=f.starts_on,
        ends_on=f.ends_on,
        days=f.days,
        artists_count=f.artists_count,
        price_from_amount=float(f.price_from_amount) if f.price_from_amount is not None else None,
        price_from_currency=f.price_from_currency,
        mxs=float(f.mxs) if f.mxs is not None else None,
        confidence=confidence_for(
            last_verified=f.last_verified,
            has_when=f.starts_on is not None,
            has_where=f.city_id is not None,
        ),
        match_count=match_count,
        matched_artists=matched,
    )


def _cities_for(db: Session, fests: list[Festival]) -> dict:
    ids = {f.city_id for f in fests if f.city_id}
    return {c.id: c for c in db.query(City).filter(City.id.in_(ids)).all()} if ids else {}


def _upcoming(today: date):
    return or_(Festival.ends_on >= today, Festival.starts_on >= today, Festival.starts_on.is_(None))


@router.get("", response_model=list[FestivalOut])
def list_festivals(limit: int = Query(100, le=300), db: Session = Depends(get_db)):
    """All upcoming/ongoing festivals, soonest first — the open browse list (everyone
    sees the same, regardless of who they follow)."""
    today = date.today()
    fests = (
        db.query(Festival)
        .filter(Festival.merged_into.is_(None), _upcoming(today))
        .order_by(nulls_last(Festival.starts_on.asc()))
        .limit(limit)
        .all()
    )
    cities = _cities_for(db, fests)
    return [_to_out(f, cities.get(f.city_id) if f.city_id else None) for f in fests]


@router.get("/for-you", response_model=list[FestivalOut])
def festivals_for_you(
    user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    """Festivals whose line-up includes artists the user follows, ranked by how many
    ('feat. N artists you follow'). Empty if the user follows no one on any bill —
    the caller then falls back to the open browse list, so nothing is ever hidden."""
    uid = uuid.UUID(user_id)
    followed_norms = {
        _norm(n)
        for (n,) in (
            db.query(Artist.name)
            .join(Follow, Follow.followable_id == Artist.id)
            .filter(Follow.user_id == uid, Follow.followable_type == "artist")
            .all()
        )
    }
    if not followed_norms:
        return []

    today = date.today()
    rows = (
        db.query(Festival, Artist.name)
        .join(FestivalLineup, FestivalLineup.festival_id == Festival.id)
        .join(Artist, FestivalLineup.artist_id == Artist.id)
        .filter(Festival.merged_into.is_(None), _upcoming(today))
        .all()
    )
    matches: dict = {}  # festival_id -> (Festival, {matched display names})
    for fest, aname in rows:
        if _norm(aname) in followed_norms:
            matches.setdefault(fest.id, (fest, set()))[1].add(aname)
    if not matches:
        return []

    fests = [f for f, _ in matches.values()]
    cities = _cities_for(db, fests)
    far = date.max
    ordered = sorted(matches.values(), key=lambda p: (-len(p[1]), p[0].starts_on or far))
    return [
        _to_out(f, cities.get(f.city_id) if f.city_id else None,
                match_count=len(names), matched=sorted(names))
        for f, names in ordered
    ]


@router.get("/{festival_id}", response_model=FestivalDetail)
def get_festival(festival_id: UUID, db: Session = Depends(get_db)):
    """One festival, with its published line-up.

    Registered AFTER /for-you on purpose: FastAPI matches routes in order, and a path
    parameter this loose would otherwise swallow "/for-you" and try to parse it as a UUID.
    """
    f = db.get(Festival, festival_id)
    if not f or f.merged_into is not None:
        raise HTTPException(status_code=404, detail="Festival not found")

    city = db.get(City, f.city_id) if f.city_id else None
    out = FestivalDetail(**_to_out(f, city).model_dump())
    out.about = f.about
    out.lineup_complete = bool(f.lineup_complete)
    out.last_verified = f.last_verified

    # Headliners first, then the seller's own order — the same shape the concert line-up
    # uses, so the two pages read alike.
    rows = (
        db.query(FestivalLineup, Artist)
        .join(Artist, FestivalLineup.artist_id == Artist.id)
        .filter(FestivalLineup.festival_id == f.id)
        .order_by(FestivalLineup.day_label.asc().nullslast(),
                  FestivalLineup.is_headliner.desc(),
                  FestivalLineup.sort_order.asc())
        .all()
    )
    out.lineup = []
    seen_days: list = []
    for fl, a in rows:
        day = None
        if fl.day_label:
            # Written by services/festival_merge as an ISO date. Anything else predates
            # that and is ignored rather than guessed at.
            try:
                day = date_cls.fromisoformat(fl.day_label)
            except ValueError:
                day = None
        if day and day not in seen_days:
            seen_days.append(day)
        out.lineup.append(FestivalArtist(name=a.name, image_url=a.image_url, day=day))
    out.lineup_days = sorted(seen_days)
    return out
