import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class TasteProfile(Base):
    __tablename__ = "taste_profiles"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, unique=True)

    core_artist_ids = Column(ARRAY(Uuid), nullable=True)       # favourites (Spotify top artists)
    adjacent_artist_ids = Column(ARRAY(Uuid), nullable=True)   # close matches
    genre_weights = Column(JSONB, nullable=True)               # {"electronic": 0.9, "techno": 0.7}
    source = Column(String, nullable=True)                     # 'spotify'
    refreshed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    profile = relationship("Profile")
