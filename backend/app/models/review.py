import uuid

from sqlalchemy import (
    Column, Integer, Text, String, Numeric, DateTime, ForeignKey, Uuid, func, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)

    rating = Column(Integer, nullable=False)               # 1..5
    body = Column(Text, nullable=True)

    # AI sentiment — feeds the MXS fan-rating component
    sentiment_score = Column(Numeric(4, 3), nullable=True) # -1.000 .. 1.000
    sentiment_label = Column(String, nullable=True)        # "Very positive" ... "Very negative"

    likes_count = Column(Integer, nullable=False, server_default="0")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_review_user_event"),
    )

    event = relationship("Event")
    profile = relationship("Profile")
