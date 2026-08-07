import uuid

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class SavedTrip(Base):
    __tablename__ = "saved_trips"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    origin_city_id = Column(Uuid, ForeignKey("cities.id"), nullable=True)

    travel_cap_hours = Column(Integer, nullable=True)     # travel appetite (local/regional/fly)
    total_travel_hours = Column(Integer, nullable=True)
    state = Column(String, nullable=False, server_default="saved")   # saved | adopted | archived

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    profile = relationship("Profile")
    origin_city = relationship("City")
