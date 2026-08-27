import uuid

from sqlalchemy import (BigInteger, Column, DateTime, Float, ForeignKey, Integer, String,
                        Uuid, UniqueConstraint, func)
from sqlalchemy.orm import relationship

from app.db.session import Base


class VenuePlace(Base):
    """Somewhere near a venue worth an hour before doors, from OpenStreetMap.

    Cached per venue rather than fetched per view: Overpass is a donated service that asks for
    restraint, a café does not move, and a live fetch takes 5-13 seconds.
    """
    __tablename__ = "venue_places"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    venue_id = Column(Uuid, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)

    # OSM identity, so a re-fetch updates rather than duplicates. Type is needed with the id
    # because node/way/relation ids come from separate sequences.
    osm_type = Column(String, nullable=False)
    osm_id = Column(BigInteger, nullable=False)

    name = Column(String, nullable=False)
    bucket = Column(String, nullable=False)      # 'eat' | 'do'
    category = Column(String, nullable=False)    # "cafe", "museum", "park" — shown as-is
    cuisine = Column(String, nullable=True)
    website = Column(String, nullable=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    distance_m = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("venue_id", "osm_type", "osm_id", name="uq_venue_place"),
    )

    venue = relationship("Venue")
