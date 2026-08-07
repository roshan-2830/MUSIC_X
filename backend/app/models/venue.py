import uuid

from sqlalchemy import Column, String, Float, ForeignKey, Uuid
from sqlalchemy.orm import relationship

from app.db.session import Base


class Venue(Base):
    __tablename__ = "venues"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    city_id = Column(Uuid, ForeignKey("cities.id"), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    city = relationship("City")
