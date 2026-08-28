from uuid import UUID

from pydantic import BaseModel


class PersonOut(BaseModel):
    """Someone else on Music X, as shown in a search result or a friends list."""
    id: UUID
    display_name: str | None = None
    avatar_url: str | None = None
    home_city: str | None = None
    home_country: str | None = None
    # Whether the caller already follows them, so a search result can say Following.
    following: bool = False
    # Whether they follow the caller back. Not used to gate anything today; shown so a list
    # of strangers and a list of actual friends do not look identical.
    follows_you: bool = False


class GoerOut(BaseModel):
    """Someone the caller follows who is going to this show.

    `booked` is the difference between "has said they want to go" and "has said they have a
    ticket". We cannot know the second from Ticketmaster — a booking happens on their site and
    is never reported back — so it is true only when the person told us themselves.
    """
    id: UUID
    display_name: str | None = None
    avatar_url: str | None = None
    booked: bool = False


class GoingOut(BaseModel):
    """The "who else is going" line, ready to render.

    `total` counts only people the caller follows. A public headcount would be a different
    feature and a different privacy question; this one answers "does anyone I know go to this".
    """
    people: list[GoerOut] = []
    total: int = 0
    # Already-rendered sentence, so the phrasing lives in one place rather than being
    # reassembled by every screen that shows it.
    summary: str | None = None


class InviteIn(BaseModel):
    user_ids: list[UUID]
    note: str | None = None


class InviteResult(BaseModel):
    invited: int = 0
    # Already invited by this person to this show. Not an error: re-inviting is a no-op, and
    # the sheet says "Invited" rather than offering it again.
    already: int = 0
    # Ids that were not people the caller follows. Silently refusing would hide a bug; this
    # says how many were dropped without naming them back.
    skipped: int = 0


class InviteOut(BaseModel):
    """An invitation the caller has received."""
    id: UUID
    event_id: UUID
    event_title: str | None = None
    starts_at: str | None = None
    city: str | None = None
    venue_name: str | None = None
    image_url: str | None = None
    from_name: str | None = None
    from_avatar: str | None = None
    note: str | None = None
    created_at: str | None = None
