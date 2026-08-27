import uuid

from sqlalchemy import Column, DateTime, Integer, String, Float, ForeignKey, Uuid
from sqlalchemy.orm import relationship

from app.db.session import Base


class Venue(Base):
    __tablename__ = "venues"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    city_id = Column(Uuid, ForeignKey("cities.id"), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    capacity = Column(Integer, nullable=True)   # max capacity (from Wikidata), for the Venue MXS signal
    # When we last ASKED OpenStreetMap for nearby places — recorded whether or not it worked,
    # because Overpass 504s often and a venue in a thin part of the map must not be re-asked
    # and re-waited-for on every single view.
    places_fetched_at = Column(DateTime(timezone=True), nullable=True)

    city = relationship("City")
