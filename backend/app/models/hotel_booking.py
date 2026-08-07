import uuid

from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class HotelBooking(Base):
    __tablename__ = "hotel_bookings"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)

    name = Column(String, nullable=False)
    check_in = Column(Date, nullable=True)
    check_out = Column(Date, nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(3), nullable=True)
    booking_ref = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    free_cancel_until = Column(Date, nullable=True)   # drives the 7-day cancellation alert

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile = relationship("Profile")
    event = relationship("Event")
