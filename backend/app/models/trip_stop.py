import uuid

from sqlalchemy import Column, Integer, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class TripStop(Base):
    __tablename__ = "trip_stops"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    trip_id = Column(Uuid, ForeignKey("saved_trips.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    travel_hours_from_origin = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=False, server_default="0")

    __table_args__ = (
        UniqueConstraint("trip_id", "event_id", name="uq_trip_stop"),
    )

    trip = relationship("SavedTrip")
    event = relationship("Event")
