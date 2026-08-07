from datetime import datetime
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
    mxs: float | None
    confidence: str | None
    price_from_amount: float | None
    price_from_currency: str | None


class ArtistOut(BaseModel):
    name: str
    is_headliner: bool


class OfferOut(BaseModel):
    seller_name: str
    url: str | None
    is_official: bool
    is_face_value_resale: bool


class EventDetail(EventListItem):
    lineup: list[ArtistOut]
    genres: list[str]
    offers: list[OfferOut]
