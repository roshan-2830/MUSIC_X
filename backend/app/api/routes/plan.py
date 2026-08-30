"""Your plan — the four calendar states, and the things that move them.

PRD F3. Three of the four move on their own:

    Interested  saving the show
    Planning    picking a hotel, inviting somebody, or writing a note
    Confirmed   a ticket — pasted confirmation, or declared
    Attended    the show has happened AND there is a ticket (or they ticked "I was there")

The state is never written by a transition. It is derived from those facts on every read, so a
feature added later that touches a plan cannot forget to move it — see services/plan.py.
"""
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.artist import Artist
from app.models.calendar_entry import CalendarEntry
from app.models.city import City
from app.models.event import Event
from app.models.event_invite import EventInvite
from app.models.hotel_booking import HotelBooking
from app.models.venue import Venue
from app.schemas.plan import (NoteIn, PasteIn, PasteResult, PlanOut, PlanStep, ReminderIn,
                              TicketOut)
from app.services import passport
from app.services import plan as planner
from app.services import ticket_paste

# How long after a show the app still asks "were you there?". Six weeks: long enough to catch
# somebody who was away, short enough that it is a reminder rather than a quiz about last year.
ASK_WINDOW_DAYS = 42

router = APIRouter(prefix="/events", tags=["plan"])

REMINDER_LEVELS = ("minimal", "normal", "high")
NOTE_MAX = 500


def _entry(db: Session, uid: uuid.UUID, event_id: UUID) -> CalendarEntry | None:
    return (db.query(CalendarEntry)
              .filter(CalendarEntry.user_id == uid, CalendarEntry.event_id == event_id)
              .one_or_none())


def _build(db: Session, uid: uuid.UUID, ev: Event, entry: CalendarEntry | None) -> PlanOut:
    """The whole card, computed from what is on record."""
    past = planner.is_past(ev.starts_at)
    has_base = db.query(HotelBooking).filter(
        HotelBooking.user_id == uid, HotelBooking.event_id == ev.id).count() > 0
    has_invited = db.query(EventInvite).filter(
        EventInvite.from_user_id == uid, EventInvite.event_id == ev.id).count() > 0
    note = (entry.note if entry else None) or None
    state = planner.derive(entry, past=past, has_base=has_base, has_invited=has_invited)
    booked = bool(entry and entry.booked)

    # The column is a cache for the Calendar and the Passport — kept in step here rather than by
    # whoever caused the change. NEVER written over a stored answer ("I was there" / "I wasn't"),
    # which is an input to the derivation and would otherwise be erased by its own result.
    if (entry is not None and state and entry.state != state
            and entry.state not in planner.STORED_ANSWERS):
        entry.state = state
        db.commit()

    # STAMP IMMEDIATELY when the card already says Attended. The hourly job is the backstop that
    # makes the Passport independent of anybody opening a screen, but waiting an hour for a
    # stamp you can see you have earned reads as broken — and on a free instance that sleeps,
    # the job may not run for far longer than an hour. Both paths are idempotent, so whichever
    # arrives first simply wins.
    if entry is not None and state == "attended" and entry.state != planner.MISSED:
        passport.record_attendance(db, uid, ev, source="music_x")
        db.commit()

    return PlanOut(
        saved=entry is not None,
        state=state,
        steps=[PlanStep(**s) for s in planner.steps(state, past=past, booked=booked)],
        headline=planner.guidance(state, past=past, booked=booked)[0],
        hint=planner.guidance(state, past=past, booked=booked)[1],
        past=past,
        has_base=has_base,
        has_invited=has_invited,
        has_note=bool((note or "").strip()),
        reminder_level=(entry.reminder_level if entry and entry.reminder_level else "normal"),
        note=note,
        ticket=(TicketOut(
            provider=entry.ticket_provider,
            reference=entry.ticket_ref,
            source=entry.ticket_source,
            at=entry.booked_at.isoformat() if entry.booked_at else None,
        ) if entry and entry.booked else None),
    )


def _event_or_404(db: Session, event_id: UUID) -> Event:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return ev


@router.get("/{event_id}/plan", response_model=PlanOut)
def get_plan(event_id: UUID, user_id: str = Depends(get_current_user_id),
             db: Session = Depends(get_db)):
    """The plan card for this show. Works whether or not it has been saved — an unsaved show
    still shows the four steps, greyed, so somebody can see what saving would start."""
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    return _build(db, uid, ev, _entry(db, uid, event_id))


@router.put("/{event_id}/plan/reminder", response_model=PlanOut)
def set_reminder(event_id: UUID, body: ReminderIn,
                 user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """How loudly to be told about this show. Only meaningful once saved."""
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    if body.level not in REMINDER_LEVELS:
        raise HTTPException(status_code=422,
                            detail=f"level must be one of {', '.join(REMINDER_LEVELS)}")
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Save the show first.")
    entry.reminder_level = body.level
    db.commit()
    return _build(db, uid, ev, entry)


@router.put("/{event_id}/plan/note", response_model=PlanOut)
def set_note(event_id: UUID, body: NoteIn,
             user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Their own note. Writing one is also a planning signal, so this can move the state — which
    is exactly why the state is derived rather than transitioned: nothing here has to know that."""
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Save the show first.")
    text = (body.note or "").strip()
    entry.note = text[:NOTE_MAX] or None
    db.commit()
    return _build(db, uid, ev, entry)


@router.post("/{event_id}/plan/ticket/paste", response_model=PasteResult)
def paste_ticket(event_id: UUID, body: PasteIn,
                 user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Paste a booking confirmation; we read the seller and the reference out of it.

    VERIFICATION, NOT SEARCH. The paste arrives on one event's page, so the question is whether
    this text refers to THIS show — never which of thousands it might mean. That is how the PRD's
    "ambiguous ⇒ needsReview, never guessed" is honoured: there is no choice to get wrong.

    A confident match lifts the plan to Confirmed. An unconfident one changes nothing and says
    what it did and did not recognise, so the person can see why and decide for themselves.

    The pasted text is not stored. Only the seller and the reference are kept; the rest of a
    confirmation email is somebody's name, address and card digits.
    """
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Save the show first.")

    text = (body.text or "").strip()
    if len(text) < 20:
        return PasteResult(confident=False, message="That's too short to read anything from.",
                           plan=_build(db, uid, ev, entry))

    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    city = db.get(City, venue.city_id) if venue and venue.city_id else None
    artist = db.get(Artist, ev.headliner_artist_id) if ev.headliner_artist_id else None

    r = ticket_paste.verify(
        text,
        artist=artist.name if artist else None,
        title=ev.title,
        venue=venue.name if venue else None,
        city=city.name if city else None,
        when=ev.starts_at.date() if ev.starts_at else None,
    )
    matched = [k for k, v in r["matched"].items() if v]
    missing = [k for k, v in r["matched"].items() if not v]

    if not r["confident"]:
        return PasteResult(
            confident=False,
            provider=r["seller"], reference=r["reference"],
            matched=matched, missing=missing,
            message=("We couldn't tell that this confirmation is for this show."
                     if matched else
                     "We couldn't match this to this show — nothing in it names the act, "
                     "the venue or the date."),
            plan=_build(db, uid, ev, entry),
        )

    entry.booked = True
    entry.ticket_provider = r["seller"]
    entry.ticket_ref = r["reference"]
    entry.ticket_source = "pasted"
    entry.booked_at = datetime.now(timezone.utc)
    db.commit()
    return PasteResult(
        confident=True, provider=r["seller"], reference=r["reference"],
        matched=matched, missing=missing,
        message=f"Ticket confirmed{f' — {r['seller']}' if r['seller'] else ''}.",
        plan=_build(db, uid, ev, entry),
    )


@router.post("/{event_id}/plan/ticket/declare", response_model=PlanOut)
def declare_ticket(event_id: UUID, user_id: str = Depends(get_current_user_id),
                   db: Session = Depends(get_db)):
    """"I have a ticket" — said by the person, with no confirmation to read.

    Recorded as `declared` rather than `pasted`, because it is a weaker claim and a later feature
    should be able to tell the two apart. It still lifts the state: they know, we do not.
    """
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Save the show first.")
    entry.booked = True
    entry.ticket_source = entry.ticket_source or "declared"
    entry.booked_at = entry.booked_at or datetime.now(timezone.utc)
    db.commit()
    return _build(db, uid, ev, entry)


@router.delete("/{event_id}/plan/ticket", response_model=PlanOut)
def clear_ticket(event_id: UUID, user_id: str = Depends(get_current_user_id),
                 db: Session = Depends(get_db)):
    """Undo a ticket. Somebody who taps this by accident, or whose booking fell through, must be
    able to take it back — a state that can only go forwards eventually lies."""
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Save the show first.")
    entry.booked = False
    entry.ticket_provider = entry.ticket_ref = entry.ticket_source = None
    entry.booked_at = None
    if entry.state == "attended":
        entry.state = "interested"     # let it be derived again from what is left
    db.commit()
    return _build(db, uid, ev, entry)


@router.post("/{event_id}/plan/attended", response_model=PlanOut)
def mark_attended(event_id: UUID, user_id: str = Depends(get_current_user_id),
                  db: Session = Depends(get_db)):
    """"I was there" — the PRD's check-in route to Attended, for somebody who went without a
    ticket we ever saw. Refused before the show: "never clickable early" is enforced here, not
    only hidden in the interface."""
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    if not planner.is_past(ev.starts_at):
        raise HTTPException(status_code=409,
                            detail="You can tick this after the show.")
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Save the show first.")
    entry.state = "attended"
    # THE PROMISE THE PLAN CARD ALREADY MAKES. It has said "Saved to your Concert Passport"
    # since the card was built, and until now nothing wrote the entry — the app was telling
    # people about a record it was not keeping.
    passport.record_attendance(db, uid, ev, source="music_x")
    db.commit()
    return _build(db, uid, ev, entry)


@router.post("/{event_id}/plan/missed", response_model=PlanOut)
def mark_missed(event_id: UUID, user_id: str = Depends(get_current_user_id),
                db: Session = Depends(get_db)):
    """"No, I didn't go."

    The answer to the question the app asks after a show. It exists so the app can stop
    assuming — a ticket is evidence of intent, not of attendance, and somebody who fell ill
    needs a way to say so. It also stops the asking, which is the difference between a helpful
    prompt and a nag.
    """
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    if not planner.is_past(ev.starts_at):
        raise HTTPException(status_code=409, detail="The show hasn’t happened yet.")
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Not in your plan.")
    entry.state = planner.MISSED
    # If they had ticked yes earlier and are correcting it, the stamp has to go too.
    passport.forget_attendance(db, uid, event_id)
    db.commit()
    return _build(db, uid, ev, entry)


@router.delete("/{event_id}/plan/attended", response_model=PlanOut)
def unmark_attended(event_id: UUID, user_id: str = Depends(get_current_user_id),
                    db: Session = Depends(get_db)):
    """"Actually, I didn't go."

    A passport you cannot correct is no more trustworthy than one you can type into: the first
    lies by omission of mistakes, the second by invention. Ticking the wrong show must be
    undoable, and undoing it must remove the stamp — not leave it behind where nobody can
    reach it.
    """
    uid = uuid.UUID(user_id)
    ev = _event_or_404(db, event_id)
    entry = _entry(db, uid, event_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Not in your plan.")
    if entry.state == "attended":
        # Back to the column's own default, not NULL — the column is NOT NULL, and the real
        # state is derived anyway (services/plan.derive). This column is only ever a cache of
        # the one transition that cannot be recomputed: "I was there".
        entry.state = "interested"
    passport.forget_attendance(db, uid, event_id)
    db.commit()
    return _build(db, uid, ev, entry)


class AttendanceAsk(BaseModel):
    event_id: UUID
    title: str
    venue_name: str | None
    city: str | None
    starts_at: str | None
    # The VENUE's timezone. Without it the screen formats in the viewer's, and a 20:45 Madrid
    # show reads as "Monday 31 August" to somebody in India — the wrong day, for the one date
    # the question is about.
    timezone: str | None
    image_url: str | None
    had_ticket: bool


@router.get("/plan/unanswered", response_model=list[AttendanceAsk], tags=["plan"])
def unanswered_attendance(limit: int = 10,
                          user_id: str = Depends(get_current_user_id),
                          db: Session = Depends(get_db)):
    """Shows that have happened and that nobody has asked about yet.

    This is what makes the Passport fill itself. Without it the tick lives on an event page you
    have to remember to visit, so the honest record stays empty for the least honest reason —
    nobody went looking.

    A window, not all of history: asking in January about a gig last March is a quiz, not a
    reminder, and somebody who has ignored the question for a month has answered it.
    """
    uid = uuid.UUID(user_id)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=ASK_WINDOW_DAYS)
    rows = (db.query(CalendarEntry, Event)
              .join(Event, Event.id == CalendarEntry.event_id)
              .filter(CalendarEntry.user_id == uid,
                      CalendarEntry.is_suggestion.is_(False),
                      Event.merged_into.is_(None),
                      # ENDED, not merely started. See services/plan.has_ended.
                      Event.starts_at < now - timedelta(hours=planner.SHOW_HOURS),
                      Event.starts_at >= since,
                      # Already answered, either way.
                      CalendarEntry.state.notin_(["attended", planner.MISSED]))
              .order_by(Event.starts_at.desc())
              .limit(limit).all())

    venues = {}
    vids = {ev.venue_id for _, ev in rows if ev.venue_id}
    if vids:
        venues = {v.id: v for v in db.query(Venue).filter(Venue.id.in_(vids)).all()}
    cities = {}
    cids = {v.city_id for v in venues.values() if v.city_id}
    if cids:
        cities = {c.id: c for c in db.query(City).filter(City.id.in_(cids)).all()}

    out = []
    for entry, ev in rows:
        v = venues.get(ev.venue_id) if ev.venue_id else None
        c = cities.get(v.city_id) if v and v.city_id else None
        out.append(AttendanceAsk(
            event_id=ev.id, title=ev.title or "Your show",
            venue_name=v.name if v else None, city=c.name if c else None,
            starts_at=ev.starts_at.isoformat() if ev.starts_at else None,
            timezone=ev.timezone,
            image_url=ev.image_url,
            # Changes the wording: "you had tickets" reads very differently from "did you go".
            had_ticket=bool(getattr(entry, "booked", False)),
        ))
    return out
