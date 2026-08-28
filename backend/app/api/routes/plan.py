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
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
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
from app.services import plan as planner
from app.services import ticket_paste

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

    # The column is a cache for the Calendar and, later, the Passport — kept in step here rather
    # than by whoever caused the change. Never written for the check-in case, which IS the stored
    # value and would otherwise be overwritten by its own derivation.
    if entry is not None and state and entry.state != state and entry.state != "attended":
        entry.state = state
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
    db.commit()
    return _build(db, uid, ev, entry)
