"""People, and inviting them to a show.

FOLLOWING A PERSON REUSES `follows`. That table is already polymorphic — user_id plus a
followable_type and id, unique together — and carries artists today. A person is one more thing
to follow, so this writes followable_type='user'. No new table, no new unique rule, and the
existing artist queries are untouched because every one of them filters on its own type.

WHAT "GOING" MEANS. A calendar entry, which is what saving a show creates. `booked` is separate
and stronger: we cannot learn from Ticketmaster that somebody bought a ticket — the purchase
happens on their site and is never reported back — so it is true only when the person said so
themselves. The two are shown differently rather than blurred into one word.

WHO SEES IT. Only people the caller follows appear. This is not a headcount: "247 going" is a
number nobody can act on, while "Rahul and Priya are going" is the reason to book. It also means
a stranger's plans are never listed to somebody who merely searched their name.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.calendar_entry import CalendarEntry
from app.models.city import City
from app.models.event import Event
from app.models.event_invite import EventInvite
from app.models.follow import Follow
from app.models.notification import Notification
from app.models.profile import Profile
from app.models.venue import Venue
from app.schemas.people import (GoerOut, GoingOut, InviteIn, InviteOut, InviteResult,
                                PersonOut)

router = APIRouter(tags=["people"])

FOLLOW_TYPE = "user"
# How many faces the event page shows before it says "and N others". Three is what fits a phone
# row beside a sentence; the rest are counted, not listed.
GOING_FACES = 3


def _following_ids(db: Session, uid: uuid.UUID) -> set:
    return {r[0] for r in db.query(Follow.followable_id)
            .filter(Follow.user_id == uid, Follow.followable_type == FOLLOW_TYPE).all()}


def _follower_ids(db: Session, uid: uuid.UUID) -> set:
    return {r[0] for r in db.query(Follow.user_id)
            .filter(Follow.followable_type == FOLLOW_TYPE,
                    Follow.followable_id == uid).all()}


def _to_person(p: Profile, city: City | None, following: set, followers: set) -> PersonOut:
    return PersonOut(
        id=p.id,
        display_name=p.display_name,
        avatar_url=p.avatar_url,
        home_city=city.name if city else None,
        home_country=city.country if city else None,
        following=p.id in following,
        follows_you=p.id in followers,
    )


def _cities_for(db: Session, profiles: list) -> dict:
    ids = {p.home_city_id for p in profiles if p.home_city_id}
    return {c.id: c for c in db.query(City).filter(City.id.in_(ids)).all()} if ids else {}


@router.get("/people/search", response_model=list[PersonOut])
def search_people(
    q: str = "",
    limit: int = 20,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Find someone by the name they display.

    There are no handles yet, so this matches display names and shows a home city beside each
    result — which is the only way to tell two people with the same name apart. Handles are the
    right answer before this meets a real number of users; a name search is what the data
    currently supports.

    An empty query returns the people already followed rather than nothing, so opening the
    sheet shows the friends list instead of a blank box.
    """
    uid = uuid.UUID(user_id)
    following, followers = _following_ids(db, uid), _follower_ids(db, uid)
    query = db.query(Profile).filter(Profile.id != uid)
    term = (q or "").strip()
    if term:
        query = query.filter(Profile.display_name.ilike(f"%{term}%"))
    elif following:
        query = query.filter(Profile.id.in_(following))
    else:
        # Nobody followed and nothing typed: show who is here, so a new user has somewhere to
        # start rather than an empty screen with no hint that search is the way in.
        query = query.order_by(Profile.created_at.desc())
    rows = query.limit(min(limit, 50)).all()
    cities = _cities_for(db, rows)
    out = [_to_person(p, cities.get(p.home_city_id) if p.home_city_id else None,
                      following, followers) for p in rows]
    # People already followed first — the friends list is what the invite sheet is for.
    out.sort(key=lambda p: (not p.following, (p.display_name or "").lower()))
    return out


@router.post("/people/{person_id}/follow", response_model=PersonOut, status_code=201)
def follow_person(
    person_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Follow someone. Idempotent — following twice is a no-op, not an error."""
    uid = uuid.UUID(user_id)
    if person_id == uid:
        raise HTTPException(status_code=400, detail="You cannot follow yourself.")
    person = db.get(Profile, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    exists = (db.query(Follow)
                .filter_by(user_id=uid, followable_type=FOLLOW_TYPE, followable_id=person_id)
                .one_or_none())
    if not exists:
        db.add(Follow(user_id=uid, followable_type=FOLLOW_TYPE, followable_id=person_id))
        db.commit()
    city = db.get(City, person.home_city_id) if person.home_city_id else None
    return _to_person(person, city, _following_ids(db, uid), _follower_ids(db, uid))


@router.delete("/people/{person_id}/follow", status_code=204)
def unfollow_person(
    person_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Stop following someone. Their plans stop being visible to you in the same instant,
    because "who is going" is computed from this table at read time rather than stored."""
    uid = uuid.UUID(user_id)
    (db.query(Follow)
       .filter_by(user_id=uid, followable_type=FOLLOW_TYPE, followable_id=person_id)
       .delete())
    db.commit()
    return None


@router.get("/me/people", response_model=list[PersonOut])
def my_people(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Everyone the caller follows, most recent first — the list the invite sheet opens on."""
    uid = uuid.UUID(user_id)
    rows = (db.query(Profile)
              .join(Follow, Follow.followable_id == Profile.id)
              .filter(Follow.user_id == uid, Follow.followable_type == FOLLOW_TYPE)
              .order_by(Follow.created_at.desc())
              .all())
    cities = _cities_for(db, rows)
    following, followers = _following_ids(db, uid), _follower_ids(db, uid)
    return [_to_person(p, cities.get(p.home_city_id) if p.home_city_id else None,
                       following, followers) for p in rows]


def _phrase(names: list, extra: int) -> str:
    """"Rahul, Priya and 3 others you follow are going".

    Built here rather than on the screen so the wording exists once. "you follow" is load
    bearing: without it the line reads as a headcount of strangers, and the whole point is that
    these are people whose plans mean something to the reader.
    """
    who = ""
    if len(names) == 1:
        who = names[0]
    elif len(names) == 2:
        who = f"{names[0]} and {names[1]}"
    elif names:
        who = f"{names[0]}, {names[1]}"
    if extra > 0 and names:
        who += f" and {extra} other{'s' if extra > 1 else ''}"
    tail = "you follow are going" if (extra > 0 or len(names) > 1) else "you follow is going"
    return f"{who} {tail}" if who else ""


@router.get("/events/{event_id}/going", response_model=GoingOut)
def who_is_going(
    event_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """People the caller follows who are going to this show.

    Only people they follow. A public "247 going" is a number nobody can act on, and it would
    also mean listing a stranger's whereabouts to anyone who searched their name. "Rahul and
    Priya are going" is the version that is both useful and defensible.

    Anyone who has saved the show counts as going; `booked` marks those who said they have a
    ticket. Cancelled and past entries are not filtered here because a calendar entry is only
    created for a show somebody chose — an event that is cancelled is still a plan they made,
    and the page says so on its own.
    """
    uid = uuid.UUID(user_id)
    following = _following_ids(db, uid)
    if not following:
        return GoingOut()

    rows = (db.query(Profile, CalendarEntry.booked)
              .join(CalendarEntry, CalendarEntry.user_id == Profile.id)
              .filter(CalendarEntry.event_id == event_id,
                      Profile.id.in_(following))
              .all())
    if not rows:
        return GoingOut()

    # Ticket-holders first: "has a ticket" is the stronger signal, and the faces shown are the
    # first three.
    rows.sort(key=lambda r: (not bool(r[1]), (r[0].display_name or "").lower()))
    people = [GoerOut(id=p.id, display_name=p.display_name, avatar_url=p.avatar_url,
                      booked=bool(b)) for p, b in rows]
    shown = people[:GOING_FACES]
    names = [p.display_name or "Someone" for p in shown]
    return GoingOut(people=shown, total=len(people),
                    summary=_phrase(names, len(people) - len(names)))


@router.post("/events/{event_id}/invites", response_model=InviteResult, status_code=201)
def invite_to_event(
    event_id: uuid.UUID,
    body: InviteIn,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Invite people to a show. Idempotent per person.

    Only people the caller follows can be invited, which is what stops this becoming a way to
    push a notification at a stranger. Ids that are not followed are counted as skipped rather
    than named back, so the caller learns the request was partly refused without learning
    anything about who those ids belong to.

    Re-inviting somebody already invited creates nothing and sends nothing: "invite everyone"
    tapped twice must not arrive as two alerts. The unique constraint enforces that even if
    two taps race.
    """
    uid = uuid.UUID(user_id)
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    wanted = {u for u in body.user_ids if u != uid}
    allowed = wanted & _following_ids(db, uid)
    skipped = len(wanted) - len(allowed)
    if not allowed:
        return InviteResult(invited=0, already=0, skipped=skipped)

    already = {r[0] for r in db.query(EventInvite.to_user_id)
                 .filter(EventInvite.event_id == event_id,
                         EventInvite.from_user_id == uid,
                         EventInvite.to_user_id.in_(allowed)).all()}
    fresh = allowed - already
    if not fresh:
        return InviteResult(invited=0, already=len(already), skipped=skipped)

    me = db.get(Profile, uid)
    sender = (me.display_name if me and me.display_name else "Someone")
    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    city = db.get(City, venue.city_id) if venue and venue.city_id else None
    where = " · ".join(x for x in (venue.name if venue else None, city.name if city else None) if x)
    note = (body.note or "").strip()[:200] or None

    for target in fresh:
        db.add(EventInvite(event_id=event_id, from_user_id=uid, to_user_id=target, note=note))
        # The invitation IS the notification. There is no separate inbox to check, because a
        # second place to look is a second place to miss it.
        db.add(Notification(
            user_id=target,
            type="invite",
            title=f"{sender} invited you",
            body=" — ".join(x for x in (ev.title, where, note) if x),
            event_id=ev.id,
            artist_id=ev.headliner_artist_id,
            # Above a price drop, below a cancellation: a person asked, and it expects a reply,
            # but it is not news about a show falling apart.
            priority="normal",
        ))
    db.commit()
    return InviteResult(invited=len(fresh), already=len(already), skipped=skipped)


@router.get("/events/{event_id}/invites/sent", response_model=list[uuid.UUID])
def already_invited(
    event_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Who the caller has already invited to this show, so the sheet says Invited rather than
    offering it a second time."""
    uid = uuid.UUID(user_id)
    return [r[0] for r in db.query(EventInvite.to_user_id)
              .filter(EventInvite.event_id == event_id, EventInvite.from_user_id == uid).all()]


@router.get("/me/invites", response_model=list[InviteOut])
def my_invites(
    limit: int = 30,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Invitations the caller has received, newest first."""
    uid = uuid.UUID(user_id)
    rows = (db.query(EventInvite, Event, Profile)
              .join(Event, Event.id == EventInvite.event_id)
              .join(Profile, Profile.id == EventInvite.from_user_id)
              .filter(EventInvite.to_user_id == uid,
                      Event.merged_into.is_(None), Event.retired_at.is_(None))
              .order_by(EventInvite.created_at.desc())
              .limit(min(limit, 100)).all())
    venues = {}
    cities = {}
    vids = {e.venue_id for _, e, _ in rows if e.venue_id}
    if vids:
        venues = {v.id: v for v in db.query(Venue).filter(Venue.id.in_(vids)).all()}
        cids = {v.city_id for v in venues.values() if v.city_id}
        if cids:
            cities = {c.id: c for c in db.query(City).filter(City.id.in_(cids)).all()}
    out = []
    for inv, ev, sender in rows:
        v = venues.get(ev.venue_id) if ev.venue_id else None
        c = cities.get(v.city_id) if v and v.city_id else None
        out.append(InviteOut(
            id=inv.id, event_id=ev.id, event_title=ev.title,
            starts_at=ev.starts_at.isoformat() if ev.starts_at else None,
            city=c.name if c else None, venue_name=v.name if v else None,
            image_url=ev.image_url,
            from_name=sender.display_name, from_avatar=sender.avatar_url,
            note=inv.note,
            created_at=inv.created_at.isoformat() if inv.created_at else None,
        ))
    return out
