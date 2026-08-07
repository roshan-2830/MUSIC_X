import uuid

from sqlalchemy import Column, String, Numeric, Date, Integer, DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class TravelLeg(Base):
    __tablename__ = "travel_legs"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)

    mode = Column(String, nullable=False)          # plane | train | bus | car
    from_label = Column(String, nullable=True)
    to_label = Column(String, nullable=True)
    travel_on = Column(Date, nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=True)
    booking_ref = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    free_cancel_until = Column(Date, nullable=True)
    sort_order = Column(Integer, nullable=False, server_default="0")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile = relationship("Profile")
    event = relationship("Event")
