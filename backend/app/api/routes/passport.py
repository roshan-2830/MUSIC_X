"""The Concert Passport — reading it.

Nothing here can create an entry. Entries are written only where there is evidence: ticking
Attended after a show (routes/plan.py), and later a ticket upload. That asymmetry is the whole
point of the feature, so there is deliberately no POST on this router.
"""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.city import City
from app.models.passport_entry import PassportEntry
from app.models.profile import Profile
from app.services import passport as pp

router = APIRouter(prefix="/me/passport", tags=["passport"])


class PassportShow(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID | None
    artist_name: str | None
    venue_name: str | None
    city: str | None
    country: str | None
    seen_on: str | None
    source: str


class Stamp(BaseModel):
    country: str
    shows: int
    first_seen_on: str | None


class PassportOut(BaseModel):
    display_name: str | None
    avatar_url: str | None
    home_city: str | None
    member_since: int | None
    shows: int
    country_count: int
    city_count: int
    hours_in_the_crowd: int
    top_artist: str | None
    top_artist_count: int
    tier: str
    next_tier: str | None
    shows_to_next_tier: int | None
    milestones: dict
    stamps: list[Stamp]
    recent: list[PassportShow]


@router.get("", response_model=PassportOut)
def my_passport(limit: int = 50,
                user_id: str = Depends(get_current_user_id),
                db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    entries = (db.query(PassportEntry)
                 .filter(PassportEntry.user_id == uid)
                 .order_by(PassportEntry.seen_on.desc().nullslast())
                 .all())
    s = pp.summarise(entries)

    # One stamp per country, with how many shows earned it and when it was first stamped.
    by_country: dict = {}
    for e in entries:
        if not e.country:
            continue
        cur = by_country.setdefault(e.country, {"country": e.country, "shows": 0,
                                                "first_seen_on": None})
        cur["shows"] += 1
        if e.seen_on and (cur["first_seen_on"] is None or e.seen_on < cur["first_seen_on"]):
            cur["first_seen_on"] = e.seen_on
    stamps = sorted(by_country.values(), key=lambda c: (-c["shows"], c["country"]))

    prof = db.get(Profile, uid)
    home = db.get(City, prof.home_city_id) if prof and prof.home_city_id else None

    return PassportOut(
        display_name=prof.display_name if prof else None,
        avatar_url=prof.avatar_url if prof else None,
        home_city=home.name if home else None,
        member_since=s["member_since"],
        shows=s["shows"], country_count=s["country_count"], city_count=s["city_count"],
        hours_in_the_crowd=s["hours_in_the_crowd"],
        top_artist=s["top_artist"], top_artist_count=s["top_artist_count"],
        tier=s["tier"], next_tier=s["next_tier"],
        shows_to_next_tier=s["shows_to_next_tier"], milestones=s["milestones"],
        stamps=[Stamp(country=c["country"], shows=c["shows"],
                      first_seen_on=c["first_seen_on"].isoformat() if c["first_seen_on"] else None)
                for c in stamps],
        recent=[PassportShow(
            id=e.id, event_id=e.event_id, artist_name=e.artist_name,
            venue_name=e.venue_name, city=e.city, country=e.country,
            seen_on=e.seen_on.isoformat() if e.seen_on else None, source=e.source,
        ) for e in entries[:limit]],
    )
