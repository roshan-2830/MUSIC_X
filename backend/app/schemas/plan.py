from uuid import UUID

from pydantic import BaseModel


class PlanStep(BaseModel):
    key: str
    label: str
    reached: bool = False
    current: bool = False
    # Locked means it cannot be reached yet, and the screen should say why rather than ignoring
    # a tap. Only "Attended" is ever locked, and only before the show.
    locked: bool = False


class TicketOut(BaseModel):
    """What we know about the ticket, and how we came to know it."""
    provider: str | None = None
    reference: str | None = None
    # 'pasted' | 'photo' | 'declared' — kept because they are not equally strong.
    source: str | None = None
    at: str | None = None


class PlanOut(BaseModel):
    """The plan card, whole.

    `state` is derived from facts on every read rather than stored, so it cannot drift out of
    step with the hotel, the invites or the ticket underneath it.
    """
    saved: bool = False
    state: str = ""
    steps: list[PlanStep] = []
    headline: str | None = None
    hint: str | None = None
    past: bool = False
    # The three things that lift a plan to Planning, reported individually so the screen can say
    # which one did it — and which are still available.
    has_base: bool = False
    has_invited: bool = False
    has_note: bool = False
    reminder_level: str = "normal"
    note: str | None = None
    ticket: TicketOut | None = None


class ReminderIn(BaseModel):
    level: str


class NoteIn(BaseModel):
    note: str | None = None


class PasteIn(BaseModel):
    text: str


class PasteResult(BaseModel):
    """What the parser made of a pasted confirmation.

    `confident` false is not an error and not a refusal — it is the PRD's "ambiguous ⇒
    needsReview, never guessed". The caller is told what was and was not recognised so it can
    explain itself, and the person can confirm it themselves if they know better than we do.
    """
    confident: bool = False
    provider: str | None = None
    reference: str | None = None
    matched: list[str] = []
    missing: list[str] = []
    message: str | None = None
    plan: PlanOut | None = None
