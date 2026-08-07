import uuid

from sqlalchemy import Column, String, Float, Uuid, UniqueConstraint

from app.db.session import Base


class City(Base):
    __tablename__ = "cities"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    country = Column(String(2), nullable=False)   # ISO-2, e.g. "DE"
    timezone = Column(String, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("name", "country", name="uq_city_name_country"),
    )
