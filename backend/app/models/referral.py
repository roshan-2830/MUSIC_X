import uuid

from sqlalchemy import Column, String, Text, Boolean, Numeric, DateTime, ForeignKey, Uuid, func, text
from sqlalchemy.orm import relationship

from app.db.session import Base


class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    # Kept even if the user/event is later deleted (SET NULL) — for honest fee reporting.
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="SET NULL"), nullable=True)

    partner = Column(String, nullable=False)   # booking | ticketmaster | google_flights | ...
    click_id = Column(String, nullable=True)
    deep_link = Column(Text, nullable=True)
    clicked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    converted = Column(Boolean, nullable=False, server_default=text("false"))
    revenue = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile = relationship("Profile")
    event = relationship("Event")
