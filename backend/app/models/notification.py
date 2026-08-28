import uuid

from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, Uuid, func, text
from sqlalchemy.orm import relationship

from app.db.session import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)

    # on_sale | new_show | cancellation | reminder | price_drop | bucket_list_live | trip_cancellation
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)

    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=True)
    artist_id = Column(Uuid, ForeignKey("artists.id", ondelete="CASCADE"), nullable=True)

    priority = Column(String, nullable=False, server_default="normal")  # normal | high
    is_read = Column(Boolean, nullable=False, server_default=text("false"))

    # When this was delivered to a device, or NULL if it has not been. Delivery is a separate
    # pass from creation so the several places that make notifications do not each have to
    # remember to send one.
    pushed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile = relationship("Profile")
    event = relationship("Event")
    artist = relationship("Artist")
