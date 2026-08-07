import uuid

from sqlalchemy import Column, ForeignKey, Uuid, UniqueConstraint

from app.db.session import Base


class EventGenre(Base):
    __tablename__ = "event_genres"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    genre_id = Column(Uuid, ForeignKey("genres.id"), nullable=False)

    __table_args__ = (
        UniqueConstraint("event_id", "genre_id", name="uq_event_genre"),
    )
