from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Uuid, func

from app.db.session import Base


class LastfmAccount(Base):
    """A user's connected Last.fm profile.

    Mirrors `spotify_accounts` but with no tokens, because none exist: Last.fm profiles
    are public, so a username plus our API key is enough to read someone's listening.
    That is why this works where Spotify did not — no OAuth, no Premium, no five-user cap.

    It also means the username is NOT authentication. Anyone could type anyone's. It is
    stored as "whose public taste to import", never as proof of who is asking.
    """

    __tablename__ = "lastfm_accounts"

    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    username = Column(String, nullable=False)
    realname = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    playcount = Column(Integer, nullable=True)      # their lifetime scrobbles, as context
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
