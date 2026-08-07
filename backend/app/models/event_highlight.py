import uuid

from sqlalchemy import Column, Text, Integer, ForeignKey, Uuid

from app.db.session import Base


class EventHighlight(Base):
    __tablename__ = "event_highlights"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, server_default="0")
