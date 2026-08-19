from uuid import UUID

from pydantic import BaseModel


class ProfileOut(BaseModel):
    id: UUID
    display_name: str | None = None
    avatar_url: str | None = None
    home_city_id: UUID | None = None
    home_city_name: str | None = None
    home_city_country: str | None = None


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    home_city_id: UUID | None = None