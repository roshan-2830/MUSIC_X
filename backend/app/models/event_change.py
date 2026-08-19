import uuid

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey, Uuid, Index, func,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


class EventChange(Base):
    """The receipt for a change.

    Re-checking an event only means something if we notice when the answer moves.
    Every time a source tells us something different from what we already hold, we
    write one row here: which field moved, from what to what, and when we spotted it.

    A row exists ONLY because a source said so — nothing here is inferred. Brand-new
    events produce no rows (there is nothing to compare against yet).

    `notified_at` stays NULL until the alerts job has turned this change into
    notifications for the people who care, so nobody gets told twice.
    """

    __tablename__ = "event_changes"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)

    field = Column(String, nullable=False)   # status | starts_at | price_from_amount
    # cancelled | postponed | reinstated | date_moved | price_drop | price_rise
    kind = Column(String, nullable=False)
    old_value = Column(Text, nullable=True)  # text, so one table can hold every field
    new_value = Column(Text, nullable=True)

    source = Column(String, nullable=False, server_default="ticketmaster")
    detected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notified_at = Column(DateTime(timezone=True), nullable=True)  # NULL = alerts not sent yet

    event = relationship("Event")

    __table_args__ = (
        Index("ix_event_changes_event_id", "event_id"),
        Index("ix_event_changes_notified_at", "notified_at"),
    )
