import uuid

from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, Uuid, text
from sqlalchemy.orm import relationship

from app.db.session import Base


class FestivalLineup(Base):
    __tablename__ = "festival_lineup"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    festival_id = Column(Uuid, ForeignKey("festivals.id", ondelete="CASCADE"), nullable=False)
    artist_id = Column(Uuid, ForeignKey("artists.id"), nullable=False)
    day_label = Column(String, nullable=True)      # 'Day 1'; NULL = not announced yet
    is_headliner = Column(Boolean, nullable=False, server_default=text("false"))
    sort_order = Column(Integer, nullable=False, server_default="0")

    festival = relationship("Festival")
    artist = relationship("Artist")
