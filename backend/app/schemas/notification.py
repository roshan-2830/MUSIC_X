from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: UUID
    type: str                 # cancellation | postponed | date_change | reinstated | price_drop | new_show
    title: str
    body: str | None = None
    priority: str             # normal | high
    is_read: bool
    created_at: datetime

    # what to open when the row is tapped
    event_id: UUID | None = None
    artist_id: UUID | None = None
    # enough to render the row without a second request
    event_title: str | None = None
    event_starts_at: datetime | None = None
    event_city: str | None = None
    artist_name: str | None = None


class UnreadCount(BaseModel):
    unread: int
    # cancellations / postponements / date moves outstanding — the ones worth a red dot
    urgent: int


class NotificationPrefsOut(BaseModel):
    """The toggles a user actually has. Cancellations, postponements and date changes
    are deliberately absent: they are always delivered, so offering a switch that does
    nothing would be worse than offering none."""
    on_sale: bool
    new_show: bool
    reminder: bool
    price_drop: bool
    bucket_list_live: bool
    trip_cancellation: bool
    push_enabled: bool
    email_enabled: bool


class NotificationPrefsUpdate(BaseModel):
    on_sale: bool | None = None
    new_show: bool | None = None
    reminder: bool | None = None
    price_drop: bool | None = None
    bucket_list_live: bool | None = None
    trip_cancellation: bool | None = None
    push_enabled: bool | None = None
    email_enabled: bool | None = None
