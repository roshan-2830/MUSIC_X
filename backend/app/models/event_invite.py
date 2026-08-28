import uuid

from sqlalchemy import (CheckConstraint, Column, DateTime, ForeignKey, String, Uuid,
                        UniqueConstraint, func)
from sqlalchemy.orm import relationship

from app.db.session import Base


class EventInvite(Base):
    """One person pointing a show at another.

    Not an attendance record — whether they go is `calendar_entries`. This only says the
    invitation happened, so the sheet can show "Invited" instead of offering it twice.
    """
    __tablename__ = "event_invites"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    from_user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    to_user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # Re-inviting is a no-op, not a second notification: "invite everyone" tapped twice
        # must not double somebody's alerts.
        UniqueConstraint("event_id", "from_user_id", "to_user_id", name="uq_event_invite"),
        CheckConstraint("from_user_id <> to_user_id", name="ck_invite_not_self"),
    )

    event = relationship("Event")
