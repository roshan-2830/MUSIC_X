import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class BucketListItem(Base):
    __tablename__ = "bucket_list"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    artist_id = Column(Uuid, ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "artist_id", name="uq_bucket_user_artist"),
    )

    profile = relationship("Profile")
    artist = relationship("Artist")
