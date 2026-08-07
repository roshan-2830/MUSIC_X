import uuid

from sqlalchemy import (
    Column, String, Text, Boolean, DateTime, ForeignKey, Uuid, func, text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


class CalendarEntry(Base):
    __tablename__ = "calendar_entries"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)

    state = Column(String, nullable=False, server_default="interested")   # interested | planning | confirmed | attended
    is_suggestion = Column(Boolean, nullable=False, server_default=text("false"))  # "dotted" suggested, not yet actively saved
    reminder_level = Column(String, nullable=False, server_default="normal")       # minimal | normal | high
    note = Column(Text, nullable=True)

    booked = Column(Boolean, nullable=False, server_default=text("false"))
    booked_via_link = Column(Boolean, nullable=False, server_default=text("false"))
    ticket_image_url = Column(String, nullable=True)   # uploaded ticket photo (Supabase Storage URL later)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_calendar_user_event"),
    )

    profile = relationship("Profile")
    event = relationship("Event")
