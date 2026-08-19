from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # lets us return ORM rows directly

    id: UUID
    name: str
    country: str


class CityIn(BaseModel):
    """Any real city the user picks/detects — not restricted to cities with shows."""
    name: str
    country: str
    lat: float | None = None
    lng: float | None = None


class CityWithShows(BaseModel):
    """An app city that actually has upcoming concerts — what the picker shows first."""
    id: UUID
    name: str
    country: str
    show_count: int