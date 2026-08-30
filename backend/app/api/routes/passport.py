"""The Concert Passport — reading it.

Nothing here can create an entry. Entries are written only where there is evidence: ticking
Attended after a show (routes/plan.py), and later a ticket upload. That asymmetry is the whole
point of the feature, so there is deliberately no POST on this router.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.city import City
from app.models.passport_entry import PassportEntry
from app.models.setlistfm_account import SetlistfmAccount
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
    # The setlist.fm page this stamp came from. It is the evidence behind an entry nobody
    # confirmed inside the app, AND the attribution link their terms require — one field
    # serving both, which is why an imported entry without it is never created.
    evidence_url: str | None


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
            evidence_url=e.evidence_url,
        ) for e in entries[:limit]],
    )


# ---------------------------------------------------------------- setlist.fm


class LinkIn(BaseModel):
    username: str


class SetlistfmOut(BaseModel):
    username: str | None
    profile_url: str | None
    last_synced_at: str | None
    last_import_count: int | None
    available: bool


@router.get("/setlistfm", response_model=SetlistfmOut)
def setlistfm_status(user_id: str = Depends(get_current_user_id),
                     db: Session = Depends(get_db)):
    from app.services import setlistfm
    row = db.get(SetlistfmAccount, uuid.UUID(user_id))
    return SetlistfmOut(
        username=row.username if row else None,
        profile_url=row.profile_url if row else None,
        last_synced_at=row.last_synced_at.isoformat() if row and row.last_synced_at else None,
        last_import_count=row.last_import_count if row else None,
        available=setlistfm.configured(),
    )


@router.post("/setlistfm")
def link_setlistfm(body: LinkIn, user_id: str = Depends(get_current_user_id),
                   db: Session = Depends(get_db)):
    """Link a setlist.fm profile and import its attended concerts.

    The username is checked to EXIST, not to belong to the caller — setlist.fm offers no way to
    prove that, so imported entries carry their source and the setlist link, and the passport
    shows that provenance rather than claiming they were confirmed here.
    """
    from app.services import setlistfm
    if not setlistfm.configured():
        raise HTTPException(status_code=503, detail="setlist.fm is not configured")

    uid = uuid.UUID(user_id)
    username = (body.username or "").strip().lstrip("@")
    if not username:
        raise HTTPException(status_code=422, detail="Enter your setlist.fm username")

    # NOT checked against /user/{id}: that endpoint returns 200 for ANY string, echoing the
    # name back with a constructed URL. It validates nothing, so calling it would spend a
    # request to learn nothing and would make a typo look like a successful link.
    #
    # The attended list is the real test — it 404s for a name nobody has. But it 404s just the
    # same for a real person who has logged nothing, and those two cases are indistinguishable
    # from out here, so the message below says both rather than picking one and being wrong.
    result = pp.import_from_setlistfm(db, uid, username)
    if not result["ok"]:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Couldn’t read your full history from setlist.fm just now — nothing was "
                   "imported. Try again later.")

    if result["total"] == 0:
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail=f"No attended concerts found for “{username}”. Check the spelling — or mark "
                   f"some concerts as attended on setlist.fm first.")

    row = db.get(SetlistfmAccount, uid)
    if row is None:
        row = SetlistfmAccount(user_id=uid, username=username)
        db.add(row)
    row.username = username
    # Built from the username rather than fetched. /user/{id} returns exactly this URL and
    # nothing else useful, so asking for it would spend one of 1440 daily calls to be told
    # something we can construct — and it is also the attribution link their terms require.
    row.profile_url = f"https://www.setlist.fm/user/{username}"
    row.last_synced_at = datetime.now(timezone.utc)
    row.last_import_count = result["added"]
    db.commit()
    return {"username": username, **result}


@router.delete("/setlistfm", status_code=204)
def unlink_setlistfm(remove_imported: bool = True,
                     user_id: str = Depends(get_current_user_id),
                     db: Session = Depends(get_db)):
    """Unlink, and by default remove what was imported.

    Leaving imported stamps behind after unlinking would make them unremovable through the app,
    and the passport is the user's own record — every entry has to be reversible.
    """
    uid = uuid.UUID(user_id)
    if remove_imported:
        (db.query(PassportEntry)
           .filter(PassportEntry.user_id == uid, PassportEntry.source == "setlist_fm")
           .delete(synchronize_session=False))
    db.query(SetlistfmAccount).filter(SetlistfmAccount.user_id == uid).delete(
        synchronize_session=False)
    db.commit()
