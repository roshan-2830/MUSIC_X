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
    saved: bool = False                       # in the caller's calendar (calendar endpoint only)
    # Only populated by the personalized "Festivals for you" endpoint:
    match_count: int | None = None            # how many of the user's followed artists are on the bill
    matched_artists: list[str] | None = None  # their names, for "feat. X, Y"


class FestivalArtist(BaseModel):
    """One act on a festival bill. `image_url` is the cached artist photo, null when we
    could not confidently identify them on Deezer — rendered as initials, never as another
    act's face."""
    name: str
    image_url: str | None = None
    # Which day they play, when the seller sold that day as its own listing. NULL means
    # "on the bill, day not announced" — a different claim from a known day, and shown as
    # such. Ticketmaster's artist objects carry no date at all, so a non-null day here came
    # from a real per-day listing, never from parsing a weekday out of a title.
    day: date | None = None


class FestivalDetail(FestivalOut):
    """Everything the festival page shows. Extends FestivalOut so the list and the page
    can never disagree about the same festival."""
    about: str | None = None
    # The published bill, in the order the seller lists it. Empty means we hold no line-up,
    # which the page states rather than hiding the section silently.
    lineup: list[FestivalArtist] = []
    # Distinct days we actually know a bill for, earliest first. Empty when the seller
    # never split this festival by day.
    lineup_days: list[date] = []
    # False when the seller is still confirming acts. The page says so, because a bill that
    # is still growing is a different claim from a bill that is finished.
    lineup_complete: bool = False
    last_verified: date | None = None
