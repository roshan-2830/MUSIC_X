from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.event import EventListItem
from app.schemas.festival import FestivalOut


class ArtistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # lets us return ORM rows directly

    id: UUID
    name: str
    image_url: str | None = None
    # Cached popularity, so the client can pick the biggest when the same artist has been
    # followed under two spellings ("A.R. Rahman" and "AR Rahman").
    deezer_fans: int | None = None
    lastfm_listeners: int | None = None


class ArtistSearchResult(BaseModel):
    """A real artist from Deezer's global catalogue — what the 'follow artists' screen shows.
    Has no local UUID yet; a local artist row is created when the user actually follows."""
    name: str
    image_url: str | None = None
    deezer_id: int | None = None
    fans: int | None = None


class FollowArtistIn(BaseModel):
    """What the client sends to follow an artist (a picked search result, or a
    Spotify import). `genres` is only populated by the Spotify import — it feeds
    the user's genre taste profile."""
    name: str
    deezer_id: int | None = None
    image_url: str | None = None
    genres: list[str] = []


class BulkFollowIn(BaseModel):
    """A batch of artists to follow at once — e.g. imported from Spotify."""
    artists: list[FollowArtistIn]


class SimilarArtist(BaseModel):
    """An artist genuinely linked to this one, with the link stated in plain English
    so a reader can check it rather than trust it."""
    # Null for a Last.fm suggestion we have never ingested (Diljit Dosanjh, AP Dhillon).
    # Those are often the most useful results, and the artist page opens by NAME, so a
    # missing local id costs nothing.
    id: UUID | None = None
    name: str
    image_url: str | None = None
    reason: str          # e.g. "Also on the bill at Lowlands 2026"
    shared: int = 0      # how many distinct links we found


class ArtistDetail(BaseModel):
    """Everything the artist page shows — all real, no fabricated stats."""
    id: UUID
    name: str
    image_url: str | None = None
    bio: str | None = None
    bio_source: str | None = None
    # Where to go and check us. Null = we could not establish one, shown as absent.
    wiki_url: str | None = None
    website_url: str | None = None
    genres: list[str] = []
    # Audience size, from the two sources that measure different populations: Deezer
    # counts followers, Last.fm counts distinct listeners. Never summed and never
    # averaged into one "popularity" number — they are different measurements, and the
    # UI labels which is which so a reader knows what they are looking at. Null means we
    # could not confidently identify this artist on that service, shown as absent.
    deezer_fans: int | None = None
    lastfm_listeners: int | None = None
    show_count: int = 0
    city_count: int = 0
    upcoming_shows: list[EventListItem] = []
    # Festivals this artist is billed on, from festival_lineup. A festival appearance
    # is a real date they are playing, but it is not a ticketed show of their own, so
    # it is kept separate from upcoming_shows rather than mixed in.
    festivals: list[FestivalOut] = []
    # Empty when nothing qualifies — the section simply does not render.
    similar: list[SimilarArtist] = []
