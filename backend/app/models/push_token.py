import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import relationship

from app.db.session import Base


class PushToken(Base):
    """One device that can be reached.

    Keyed on the TOKEN, not the user: it is what Expo addresses, and it survives a person
    switching accounts on the same phone — at which point the row's owner changes rather than a
    second row appearing and both being notified.
    """
    __tablename__ = "push_tokens"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    token = Column(String, nullable=False, unique=True)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    platform = Column(String, nullable=True)
    # A BROWSER subscription needs two more things than a phone: the keys its push service uses
    # to encrypt the payload. NULL for phones, set for browsers — which, with `platform`, is how
    # the sender knows which protocol to speak. `token` holds the endpoint URL for a web row.
    p256dh = Column(String, nullable=True)
    auth = Column(String, nullable=True)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile = relationship("Profile")
