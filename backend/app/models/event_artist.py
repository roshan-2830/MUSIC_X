import uuid

from sqlalchemy import Column, Boolean, Integer, ForeignKey, Uuid, UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.db.session import Base


class EventArtist(Base):
    __tablename__ = "event_artists"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    artist_id = Column(Uuid, ForeignKey("artists.id"), nullable=False)
    is_headliner = Column(Boolean, nullable=False, server_default=text("false"))
    sort_order = Column(Integer, nullable=False, server_default="0")

    __table_args__ = (
        UniqueConstraint("event_id", "artist_id", name="uq_event_artist"),
    )

    event = relationship("Event")
    artist = relationship("Artist")
