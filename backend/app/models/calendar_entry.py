import uuid

from sqlalchemy import (
    CheckConstraint, Column, String, Text, Boolean, DateTime, ForeignKey, Uuid, func, text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


class CalendarEntry(Base):
    __tablename__ = "calendar_entries"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    # Exactly one of these is set — see the check constraint below. A saved festival is
    # the same promise as a saved show ("I'm going, tell me if it changes"), so both live
    # here and the Calendar tab reads one list instead of merging two tables.
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=True)
    festival_id = Column(Uuid, ForeignKey("festivals.id", ondelete="CASCADE"), nullable=True)

    state = Column(String, nullable=False, server_default="interested")   # interested | planning | confirmed | attended
    is_suggestion = Column(Boolean, nullable=False, server_default=text("false"))  # "dotted" suggested, not yet actively saved
    reminder_level = Column(String, nullable=False, server_default="normal")       # minimal | normal | high
    note = Column(Text, nullable=True)

    booked = Column(Boolean, nullable=False, server_default=text("false"))
    booked_via_link = Column(Boolean, nullable=False, server_default=text("false"))
    ticket_image_url = Column(String, nullable=True)   # uploaded ticket photo (Supabase Storage URL later)
    # Where the ticket claim came from, and what it pointed at. `booked` alone says somebody has
    # a ticket; these say why we believe it. 'pasted' | 'photo' | 'declared' — not equally
    # strong, and kept apart so a later automatic source can tell itself from a self-report.
    ticket_provider = Column(String, nullable=True)     # "Ticketmaster", "Dice", ...
    ticket_ref = Column(String, nullable=True)          # the order/booking reference
    ticket_source = Column(String, nullable=True)
    booked_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # NULLs are distinct in Postgres, so festival rows do not collide under the
        # event constraint, nor shows under the festival one.
        UniqueConstraint("user_id", "event_id", name="uq_calendar_user_event"),
        UniqueConstraint("user_id", "festival_id", name="uq_calendar_user_festival"),
        CheckConstraint(
            "(event_id IS NOT NULL AND festival_id IS NULL) OR "
            "(event_id IS NULL AND festival_id IS NOT NULL)",
            name="ck_calendar_one_target",
        ),
    )

    profile = relationship("Profile")
    event = relationship("Event")
    festival = relationship("Festival")
