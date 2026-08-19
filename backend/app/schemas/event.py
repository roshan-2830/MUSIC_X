from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class EventListItem(BaseModel):
    id: UUID
    title: str
    starts_at: datetime | None
    timezone: str | None
    status: str
    venue_name: str | None
    city: str | None
    country: str | None
    image_url: str | None
    mxs: float | None
    confidence: str | None
    price_from_amount: float | None
    price_from_currency: str | None


class RecommendedEvent(EventListItem):
    """An upcoming event matched to the user's taste, with a plain-English reason.
    A match is either by a followed/listened artist, or by a genre the user loves."""
    reason: str                 # full line, e.g. "Because you follow Coldplay"
    reason_label: str           # short pill text: the artist name or the genre
    reason_kind: str            # "artist" | "genre"


class ArtistOut(BaseModel):
    name: str
    is_headliner: bool


class OfferOut(BaseModel):
    seller_name: str
    url: str | None
    is_official: bool
    is_face_value_resale: bool


class FactOut(BaseModel):
    """One sourced fact, with its receipt attached."""
    key: str
    label: str
    value: str                      # verbatim, exactly as the source wrote it
    display: str                    # the same fact, rendered for a human
    source_name: str | None
    source_url: str | None
    trust_tier: str | None          # high = copied from a structured field
    last_verified: date | None
    derived: bool                   # True = read out of the listing text, not a field
    snapshot: str | None            # the surrounding source text, kept as proof


class MissingFactOut(BaseModel):
    """Something worth knowing that the source does not publish. Shown as a gap
    rather than filled in with a guess."""
    key: str
    label: str


class EventDetail(EventListItem):
    description: str | None = None
    mxs_breakdown: dict | None = None
    last_verified: date | None = None
    artist_bio: str | None = None
    artist_bio_source: str | None = None
    lineup: list[ArtistOut]
    genres: list[str]
    offers: list[OfferOut]
    facts: list[FactOut] = []
    missing_facts: list[MissingFactOut] = []
