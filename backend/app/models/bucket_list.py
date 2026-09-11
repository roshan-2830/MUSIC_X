import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class BucketListItem(Base):
    __tablename__ = "bucket_list"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    artist_id = Column(Uuid, ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    # The manual "I've seen them", for gigs from before this app existed.
    #
    # Kept HERE and not in passport_entries on purpose. The Passport is evidence-based —
    # every entry carries a source and, for an import, a URL that proves it — and a bare
    # "I've seen them at some point" has none of that. Writing it there would put an
    # unevidenced claim in the one place built to hold only evidenced ones. So a line can
    # be crossed off two ways: a real Passport entry for the artist, or this.
    seen_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "artist_id", name="uq_bucket_user_artist"),
    )

    profile = relationship("Profile")
    artist = relationship("Artist")
