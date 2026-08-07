from sqlalchemy import Column, Boolean, DateTime, ForeignKey, Uuid, func, text
from sqlalchemy.orm import relationship

from app.db.session import Base


class NotificationPref(Base):
    __tablename__ = "notification_prefs"

    # One row per user
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)

    # Optional alert-type toggles. (Cancellations have NO toggle — always delivered, safety first.)
    on_sale = Column(Boolean, nullable=False, server_default=text("true"))
    new_show = Column(Boolean, nullable=False, server_default=text("true"))
    reminder = Column(Boolean, nullable=False, server_default=text("true"))
    price_drop = Column(Boolean, nullable=False, server_default=text("true"))
    bucket_list_live = Column(Boolean, nullable=False, server_default=text("true"))
    trip_cancellation = Column(Boolean, nullable=False, server_default=text("true"))

    # Channels
    push_enabled = Column(Boolean, nullable=False, server_default=text("true"))
    email_enabled = Column(Boolean, nullable=False, server_default=text("false"))

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    profile = relationship("Profile")
