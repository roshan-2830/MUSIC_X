import uuid

from sqlalchemy import (Column, String, Numeric, Float, Date, DateTime, ForeignKey, Uuid,
                        UniqueConstraint, func)
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

    # Where the traveller is actually sleeping. Filled from Tripsure's /api/hotel/details,
    # so it is the property's own record rather than anything we inferred from a search row.
    hotel_id = Column(String, nullable=True)      # supplier's id, to refresh or later book
    provider = Column(String, nullable=True)      # "TRIPSURE"
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    # The supplier's own strings ("12:00 PM"), unparsed — they carry no timezone and are
    # sometimes prose, so a real time here would be invented precision.
    check_in_time = Column(String, nullable=True)
    check_out_time = Column(String, nullable=True)
    star_rating = Column(Numeric(2, 1), nullable=True)

    # 'picked' = the traveller pointed at it. 'booked' = money changed hands and booking_ref
    # is real. Never render a picked row as a booking: Tripsure's booking flow needs us to
    # take the payment and a PAN number, which is a decision nobody has made yet.
    source = Column(String, nullable=False, server_default="picked")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # One base per person per show, so "where are they staying" has one answer.
        UniqueConstraint("user_id", "event_id", name="uq_hotel_booking_user_event"),
    )

    profile = relationship("Profile")
    event = relationship("Event")
