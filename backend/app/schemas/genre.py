from pydantic import BaseModel


class GenreOption(BaseModel):
    """A genre a new user can pick during onboarding.

    `artist_count` is how many followable artists carry it — artists with an upcoming show,
    so picking the genre leads somewhere. A genre nobody in the catalogue plays would be a
    dead end, which is why the endpoint has a floor.
    """
    name: str
    artist_count: int


class GenreArtist(BaseModel):
    """An artist suggested from the genres a user picked."""
    name: str
    image_url: str | None = None
    deezer_fans: int | None = None
    lastfm_listeners: int | None = None
    # The genres this artist carries, so the card can say WHY it is being suggested.
    genres: list[str] = []
    # Upcoming shows we hold for them — the honest reason a follow is worth making.
    upcoming_shows: int = 0
