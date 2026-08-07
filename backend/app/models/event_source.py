import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class EventSource(Base):
    __tablename__ = "event_sources"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)

    source = Column(String, nullable=False)          # ticketmaster | songkick | bandsintown | ...
    source_event_id = Column(String, nullable=True)  # the provider's own id for this event
    source_url = Column(String, nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("source", "source_event_id", name="uq_event_source"),
    )

    event = relationship("Event")
