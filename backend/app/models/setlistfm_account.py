from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Uuid, func

from app.db.session import Base


class SetlistfmAccount(Base):
    """A user's linked setlist.fm profile.

    The same shape as lastfm_accounts, and the same caveat, which matters more here: the
    username is NOT authentication. setlist.fm history is public and their API offers no way to
    prove ownership — the profile fields a verification code could be read back from are
    deprecated, and the live API returns only userId and url.

    So this records "whose public history to import", never "who this person is". Imported
    passport entries carry source='setlist_fm' and the setlist URL, and the passport shows that
    provenance instead of presenting them as confirmed.
    """

    __tablename__ = "setlistfm_accounts"

    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    username = Column(String, nullable=False)
    profile_url = Column(String, nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_import_count = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(),
                        onupdate=func.now(), nullable=False)
