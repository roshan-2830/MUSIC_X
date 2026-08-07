import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class DismissedSuggestion(Base):
    __tablename__ = "dismissed_suggestions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_dismissed_user_event"),
    )
