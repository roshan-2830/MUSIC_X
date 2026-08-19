import uuid

from sqlalchemy import Column, Date, String, Text, Uuid

from app.db.session import Base


class Artist(Base):
    __tablename__ = "artists"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=True)
    image_url = Column(String, nullable=True)

    bio = Column(Text, nullable=True)          # real bio from a cited source (never fabricated)
    bio_source = Column(String, nullable=True)  # e.g. "Wikipedia"

    # Where a reader can go and check us. Both are real URLs or NULL — we never
    # build a /wiki/<Name> guess, because the wrong namesake is worse than no link.
    wiki_url = Column(String, nullable=True)     # the exact page the bio came from
    website_url = Column(String, nullable=True)  # artist's own site (Wikidata P856)
    # Set only after a lookup that actually COMPLETED. Left NULL when the lookup
    # failed, so a throttled request never becomes a permanent "no website".
    links_checked_on = Column(Date, nullable=True)
    # When we last pulled this artist's full tour from the seller by attraction id.
    tour_synced_on = Column(Date, nullable=True)
