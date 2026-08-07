import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class Follow(Base):
    __tablename__ = "follows"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)

    # Polymorphic target: you can follow an artist OR a city. Drives new-show / on-sale alerts.
    followable_type = Column(String, nullable=False)   # 'artist' | 'city'
    followable_id = Column(Uuid, nullable=False)        # id of that artist/city

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "followable_type", "followable_id", name="uq_follow"),
    )

    profile = relationship("Profile")
