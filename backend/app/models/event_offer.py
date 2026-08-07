import uuid

from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, Uuid, text
from sqlalchemy.orm import relationship

from app.db.session import Base


class EventOffer(Base):
    __tablename__ = "event_offers"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    seller_name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    is_official = Column(Boolean, nullable=False, server_default=text("false"))
    is_face_value_resale = Column(Boolean, nullable=False, server_default=text("false"))
    sort_order = Column(Integer, nullable=False, server_default="0")

    event = relationship("Event")
