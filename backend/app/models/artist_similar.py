import uuid

from sqlalchemy import (
    Column, String, Numeric, Date, ForeignKey, Uuid, Index, UniqueConstraint,
)

from app.db.session import Base


class ArtistSimilar(Base):
    """A cached similar-artist claim from an outside source.

    Our own stage-sharing signal is computed live in SQL — it is fast and always current.
    This table exists only for signals that cost a network call, so an artist page never
    waits on Last.fm.

    `name` is stored as free text rather than a foreign key on purpose: Last.fm knows
    thousands of artists we have never ingested (Diljit Dosanjh, AP Dhillon), and those
    are exactly the suggestions worth showing. The artist page opens by NAME, so an act
    we have never heard of still resolves to a real page with a bio and a photo.
    """

    __tablename__ = "artist_similar"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    artist_id = Column(Uuid, ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)

    name = Column(String, nullable=False)          # the similar artist, as the source names them
    match = Column(Numeric(4, 3), nullable=True)   # the source's own 0-1 score, kept as theirs
    # Resolved when the row is cached, not on every page load: an artist we already hold
    # supplies its own photo, and only the rest cost a Deezer lookup.
    image_url = Column(String, nullable=True)
    source = Column(String, nullable=False, server_default="lastfm")
    fetched_on = Column(Date, nullable=True)

    __table_args__ = (
        UniqueConstraint("artist_id", "name", "source", name="uq_artist_similar"),
        Index("ix_artist_similar_artist_id", "artist_id"),
    )
