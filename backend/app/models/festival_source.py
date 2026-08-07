import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class FestivalSource(Base):
    __tablename__ = "festival_sources"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    festival_id = Column(Uuid, ForeignKey("festivals.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, nullable=False)               # ticketmaster | songkick | ...
    source_festival_id = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("source", "source_festival_id", name="uq_festival_source"),
    )

    festival = relationship("Festival")
