"""Make sure a show is on someone's calendar before recording a plan against it.

Why this exists
---------------
Plan state is DERIVED, never stored (see services/plan.derive), and its first line is:

    if entry is None:
        return ""          # not saved at all

So a `calendar_entries` row is the anchor for everything else. Picking a hotel wrote to
`hotel_bookings` and sending an invite wrote to `event_invites`, and neither touched
`calendar_entries` — so derive() saw nothing and those shows had NO state at all. Measured
2026-09-10: 3 hotel bookings and roughly 80 invites pointed at shows that were never saved.
People chose a bed or asked a friend along, and the app had forgotten they cared.

The fix belongs here rather than in each endpoint, because the rule is one sentence — an act
of planning implies caring about the show — and two copies of it would drift. Any future
planning signal (a flight leg, a trip stop) calls this too.

Booking a bed for a night is a stronger statement of intent than tapping a bookmark, so this
saves the show rather than refusing until someone has bookmarked it first.
"""
import uuid
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.calendar_entry import CalendarEntry


def ensure_saved(db: Session, uid: uuid.UUID, event_id: UUID) -> CalendarEntry:
    """The caller's calendar entry for this show, created if it is missing.

    Does NOT commit — the caller is mid-transaction writing the hotel or the invite, and one
    commit for the pair keeps the entry and the plan from being written apart. Flushes, so
    the row has an id the caller can rely on.

    `state` is set to "interested" only as the seed the bookmark path uses. It is not the
    answer to "what state is this in": derive() recomputes that from the facts on every read,
    and will report "planning" the moment the hotel or invite this call precedes is written.
    """
    entry = (db.query(CalendarEntry)
               .filter(CalendarEntry.user_id == uid, CalendarEntry.event_id == event_id)
               .one_or_none())
    if entry is None:
        entry = CalendarEntry(user_id=uid, event_id=event_id,
                              state="interested", is_suggestion=False)
        db.add(entry)
        db.flush()
    elif entry.is_suggestion:
        # A suggested show is one WE put in front of them, drawn dotted and not yet theirs.
        # Acting on it makes it theirs, so the dotted line has to go — otherwise the calendar
        # keeps presenting a trip they are actively planning as a suggestion they might like.
        entry.is_suggestion = False
    return entry
