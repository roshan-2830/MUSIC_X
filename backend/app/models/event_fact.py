import uuid

from sqlalchemy import (
    Column, String, Text, Date, DateTime, ForeignKey, Uuid, func, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


class EventFact(Base):
    __tablename__ = "event_facts"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)

    fact_key = Column(String, nullable=False)     # doors, age_policy, runtime, reentry, bag_policy, language, set_times
    fact_value = Column(Text, nullable=True)       # NULL = "not published" (never invented)

    # Provenance — the whole point
    source_name = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    snapshot = Column(Text, nullable=True)         # saved copy of the source text, as proof
    trust_tier = Column(String, nullable=True)     # high | medium | low
    last_verified = Column(Date, nullable=True)
    captured_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("event_id", "fact_key", name="uq_event_fact_key"),
    )

    event = relationship("Event")
