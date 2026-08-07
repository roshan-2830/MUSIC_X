import uuid

from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Numeric, Date, DateTime,
    ForeignKey, Uuid, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class Festival(Base):
    __tablename__ = "festivals"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    about = Column(Text, nullable=True)                     # festivals have a real 'about'

    city_id = Column(Uuid, ForeignKey("cities.id"), nullable=True)
    starts_on = Column(Date, nullable=True)
    ends_on = Column(Date, nullable=True)
    days = Column(Integer, nullable=True)
    artists_count = Column(Integer, nullable=True)
    lineup_complete = Column(Boolean, nullable=False, server_default=text("false"))

    price_from_amount = Column(Numeric(10, 2), nullable=True)
    price_from_currency = Column(String(3), nullable=True)

    mxs = Column(Numeric(3, 1), nullable=True)
    mxs_breakdown = Column(JSONB, nullable=True)
    confidence = Column(String, nullable=True)              # high | medium | low
    last_verified = Column(Date, nullable=True)

    merged_into = Column(Uuid, ForeignKey("festivals.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    city = relationship("City")
