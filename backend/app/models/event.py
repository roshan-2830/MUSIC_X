import uuid

from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Numeric, Date, DateTime,
    ForeignKey, Uuid, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)

    # Core details
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)                 # optional; real feeds provide one
    image_url = Column(String, nullable=True)                # event/artist artwork from the source
    starts_at = Column(DateTime(timezone=True), nullable=True)
    doors_at = Column(DateTime(timezone=True), nullable=True)  # NULL = "not published"
    # From Ticketmaster's sales.public. NULL means the seller has not set a date (their
    # startTBD/startTBA), which is different from "already on sale" and must not be guessed.
    onsale_at = Column(DateTime(timezone=True), nullable=True)
    sales_end_at = Column(DateTime(timezone=True), nullable=True)
    timezone = Column(String, nullable=True)
    status = Column(String, nullable=False, server_default="scheduled")  # scheduled | postponed | cancelled
    lineup_complete = Column(Boolean, nullable=False, server_default=text("false"))

    # Links to reference tables
    headliner_artist_id = Column(Uuid, ForeignKey("artists.id"), nullable=True)  # NULL = TBA
    venue_id = Column(Uuid, ForeignKey("venues.id"), nullable=True)

    # Ticket price — numeric + currency, never a marked-up value
    price_from_amount = Column(Numeric(10, 2), nullable=True)
    price_from_currency = Column(String(3), nullable=True)    # ISO-4217, e.g. "EUR"

    # MXS (Music Experience Score) — a computed signal, never purchasable
    mxs = Column(Numeric(3, 1), nullable=True)                # NULL = honest "no rating"
    mxs_breakdown = Column(JSONB, nullable=True)              # {lineup_strength, past_editions, production_scale, fan_rating}

    # Trust / verification
    confidence = Column(String, nullable=True)                # high | medium | low
    last_verified = Column(Date, nullable=True)

    # Consecutive re-verify passes in which Ticketmaster did not return this event. Reset to 0
    # by any response that does return it.
    missing_count = Column(Integer, nullable=False, server_default="0")
    # Stamped on the SECOND consecutive miss, never the first: one absence could be a partial
    # answer or a listing being edited, and hiding a real show somebody holds tickets for is a
    # worse mistake than briefly showing one that has been pulled. Cleared if it comes back.
    retired_at = Column(DateTime(timezone=True), nullable=True)

    # Deduplication: if merged into another event, point to the survivor
    merged_into = Column(Uuid, ForeignKey("events.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # ORM conveniences (not columns)
    headliner = relationship("Artist", foreign_keys=[headliner_artist_id])
    venue = relationship("Venue")
