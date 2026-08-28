"""The four calendar states, derived rather than stored.

PRD F3: Interested -> Planning -> Confirmed -> Attended. "Attended is earned (post-date + booked
or check-in), never clickable early. Booking capture lifts state automatically."

DERIVED, NOT TRANSITIONED, and that is the whole design. A stored state has to be moved by
whoever causes the change, which means every future feature that touches a plan has to remember
to move it — and the one that forgets leaves somebody on "Interested" while their hotel is
booked. Here the state is a function of facts that already exist:

    attended   the show has happened AND there is a ticket
    confirmed  there is a ticket
    planning   they have started building the trip
    interested they saved it

Nothing can drift, because there is nothing to keep in step. "Attended" also arrives on its own
as time passes, which no mutation could have triggered.

The column is still written on read when it has changed, so the Calendar and, later, the
Passport can query it without recomputing. The column is a cache; this function is the truth.
"""
from datetime import datetime, timezone

STATES = ["interested", "planning", "confirmed", "attended"]
LABELS = {"interested": "Interested", "planning": "Planning",
          "confirmed": "Confirmed", "attended": "Attended"}


def is_past(starts_at) -> bool:
    """Has the show happened? False when the date is unknown — an unknown date cannot be past,
    and treating it as past would hand somebody an "Attended" badge for a show that may not have
    been scheduled yet."""
    if starts_at is None:
        return False
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    return starts_at < datetime.now(timezone.utc)


def derive(entry, *, past: bool, has_base: bool, has_invited: bool) -> str:
    """The state this plan is actually in."""
    if entry is None:
        return ""                       # not saved at all
    booked = bool(getattr(entry, "booked", False))
    # THE ONE STORED THING, and the PRD asks for it: "Attended is earned (post-date + booked or
    # CHECK-IN)". A ticket is not the only way somebody was there — they may have been given one,
    # or bought at the door — so a post-show "I was there" is a legitimate second route. It is
    # recorded in `state` because there is no other fact to derive it from, and it is honoured
    # only once the date has passed, so it can never be claimed early.
    if past and (getattr(entry, "state", None) == "attended"):
        return "attended"
    if booked and past:
        return "attended"
    if booked:
        return "confirmed"
    # PLANNING is the step the PRD leaves undefined, so it is defined by what somebody has
    # actually done beyond bookmarking: chosen where to sleep, asked somebody to come, or written
    # themselves a note. All three are real acts of planning and all three are already recorded,
    # so nothing new is tracked to know this.
    if has_base or has_invited or (getattr(entry, "note", None) or "").strip():
        return "planning"
    return "interested"


def steps(state: str, *, past: bool, booked: bool) -> list:
    """Each step with whether it is reached, current, and locked.

    "Attended" is locked until the show has happened — the PRD's "never clickable early" — and
    the lock is reported rather than merely enforced, so the screen can say why instead of
    silently doing nothing when somebody taps it.
    """
    idx = STATES.index(state) if state in STATES else -1
    out = []
    for i, s in enumerate(STATES):
        locked = (s == "attended" and not past)
        out.append({
            "key": s,
            "label": LABELS[s],
            "reached": idx > i,
            "current": idx == i,
            "locked": locked,
        })
    return out


def guidance(state: str, *, past: bool, booked: bool) -> tuple:
    """(headline, hint) — what to say under the stepper.

    Written here rather than on the screen so the wording for a state lives in one place, next
    to the rule that produces it.
    """
    if not state:
        return ("Save this show to start planning.",
                "Nothing is tracked until you do.")
    # PAST-SHOW WORDING FIRST. Every line below advises somebody about a show that has not
    # happened yet; once it has, all of that advice is about the past. Checking `past` after the
    # state would let the generic branch answer first, which is exactly the bug this ordering
    # fixes — a finished concert being told to pick a hotel.
    if past and state in ("interested", "planning"):
        return ("The show has happened.",
                "Were you there? Tick “Attended” and it goes in your Passport.")
    if state == "interested":
        return ("You're interested in this show.",
                "Pick a hotel, invite a friend or add a note and this moves on its own.")
    if state == "planning":
        return ("You're planning this trip.",
                "Add your ticket confirmation and this becomes Confirmed.")
    if state == "confirmed" and not past:
        return ("You're all set.",
                "“Attended” unlocks after the show.")
    return ("You were there.",
            "Saved to your Concert Passport.")
