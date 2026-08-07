from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class SpotifyAccount(Base):
    __tablename__ = "spotify_accounts"

    # One Spotify connection per user
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    spotify_user_id = Column(String, nullable=True)

    # Sensitive — lives only in the backend. (We'll encrypt these at rest before production.)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    scope = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    profile = relationship("Profile")
