from datetime import date
from uuid import UUID

from pydantic import BaseModel


class FestivalOut(BaseModel):
    id: UUID
    name: str
    city: str | None
    country: str | None
    image_url: str | None = None
    starts_on: date | None
    ends_on: date | None
    days: int | None
    artists_count: int | None
    price_from_amount: float | None
    price_from_currency: str | None
    mxs: float | None
    confidence: str | None
    # Only populated by the personalized "Festivals for you" endpoint:
    match_count: int | None = None            # how many of the user's followed artists are on the bill
    matched_artists: list[str] | None = None  # their names, for "feat. X, Y"
