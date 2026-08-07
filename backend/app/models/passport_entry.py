import uuid

from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Uuid, func

from sqlalchemy.orm import relationship

from app.db.session import Base


class PassportEntry(Base):
    __tablename__ = "passport_entries"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)

    # Link to a real Music X event when the show was tracked in-app ("on Music X")
    event_id = Column(Uuid, ForeignKey("events.id"), nullable=True)

    # Denormalized details (needed for imported shows not in our catalogue)
    artist_id = Column(Uuid, ForeignKey("artists.id"), nullable=True)
    artist_name = Column(String, nullable=True)
    venue_name = Column(String, nullable=True)
    city = Column(String, nullable=True)
    country = Column(String(2), nullable=True)     # drives the stamps wall (one per country)
    seen_on = Column(Date, nullable=True)

    # Trust rule: no manual typing. 'music_x' = tracked in-app; imports REQUIRE evidence_url.
    source = Column(String, nullable=False)        # music_x | import_ticket | setlist_fm
    evidence_url = Column(String, nullable=True)   # ticket screenshot / setlist.fm link

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    profile = relationship("Profile")
    event = relationship("Event")
    artist = relationship("Artist")
