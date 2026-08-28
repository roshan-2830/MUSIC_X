import uuid

from sqlalchemy import Column, Date, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB

from app.db.session import Base


class Artist(Base):
    __tablename__ = "artists"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=True)
    image_url = Column(String, nullable=True)

    bio = Column(Text, nullable=True)          # real bio from a cited source (never fabricated)
    bio_source = Column(String, nullable=True)   # e.g. "Wikipedia"
    # When we last ASKED Wikipedia, found or not. Without it every run re-tried the same
    # artists with no article — 3,000 requests to find 6 bios. Re-tried after 30 days, so an
    # act who gets a page later is still picked up.
    bio_checked_on = Column(Date, nullable=True)

    # Where a reader can go and check us. Both are real URLs or NULL — we never
    # build a /wiki/<Name> guess, because the wrong namesake is worse than no link.
    wiki_url = Column(String, nullable=True)     # the exact page the bio came from
    website_url = Column(String, nullable=True)  # artist's own site (Wikidata P856)
    # Set only after a lookup that actually COMPLETED. Left NULL when the lookup
    # failed, so a throttled request never becomes a permanent "no website".
    links_checked_on = Column(Date, nullable=True)
    # When we last pulled this artist's full tour from the seller by attraction id.
    tour_synced_on = Column(Date, nullable=True)
    # When we last asked Last.fm for similar artists. Only stamped on a lookup that
    # COMPLETED, so a timeout is retried rather than frozen as "nothing similar".
    similar_checked_on = Column(Date, nullable=True)

    # Crowd genre tags from Last.fm, strongest first. This is the genre source that
    # replaced Spotify's stripped `genres` field; it also feeds event_genres, which had
    # coverage on only 485 of 4,708 events before this existed.
    tags = Column(JSONB, nullable=True)
    tags_checked_on = Column(Date, nullable=True)

    # Popularity, cached so MXS reads the database instead of calling two APIs per
    # artist while scoring. Two separate columns, never summed: Deezer counts followers,
    # Last.fm counts distinct listeners — different populations on different scales.
    deezer_fans = Column(Integer, nullable=True)
    lastfm_listeners = Column(Integer, nullable=True)
    popularity_checked_on = Column(Date, nullable=True)
