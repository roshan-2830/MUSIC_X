from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.festival import FestivalOut


class EventListItem(BaseModel):
    id: UUID
    title: str
    # Who is playing, as a resolved artist rather than a substring of the title. Ticketmaster
    # bills the same tour inconsistently — "Foo Fighters: TAKE COVER TOUR 2026" and
    # "FOO FIGHTERS - TAKE COVER TOUR 2026" are the same six-date run — so any client that
    # needs to group or vary a list by artist has to be given the id, not left to parse the
    # title. Null when the headliner is TBA.
    headliner: str | None = None
    headliner_artist_id: UUID | None = None
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


class CalendarEvent(EventListItem):
    """An event as the Calendar page needs it: not just what it is, but where it sits in
    this user's plans. The tag is resolved server-side because that is where the saves,
    follows and booking flags already live."""
    saved: bool                 # in their calendar
    booked: bool                # they have a ticket for it
    tag_kind: str | None        # cancelled | postponed | ticket | plan | following | city
    genres: list[str] = []      # up to two, for the card footer


class CalendarPayload(BaseModel):
    """Both kinds of thing that can sit on a date, for one window of time."""
    events: list[CalendarEvent]
    festivals: list["FestivalOut"]


class RecommendedEvent(EventListItem):
    """An upcoming event matched to the user's taste, with a plain-English reason.
    A match is either by a followed/listened artist, or by a genre the user loves."""
    reason: str                 # full line, e.g. "Because you follow Coldplay"
    reason_label: str           # short pill text: the artist name or the genre
    reason_kind: str            # "artist" (followed) | "listened" (Last.fm) | "genre"


class ArtistOut(BaseModel):
    name: str
    is_headliner: bool
    # The cached artist photo, so the line-up shows faces instead of initials. Null is
    # normal and rendered as initials — 29% of artists have no exact Deezer match and we
    # would rather show a letter than another act's face.
    image_url: str | None = None


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
