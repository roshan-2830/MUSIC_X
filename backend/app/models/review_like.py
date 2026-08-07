import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Uuid, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class ReviewLike(Base):
    __tablename__ = "review_likes"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    review_id = Column(Uuid, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("review_id", "user_id", name="uq_review_like"),
    )
