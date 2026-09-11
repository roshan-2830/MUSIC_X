from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class WishlistLine(BaseModel):
    """One act on the wishlist, and where they stand.

    `seen` is a fact with a provenance, like everything else here: "passport" means we hold
    a real entry for them — a ticket, a setlist.fm match, a finished booking — and "manual"
    means the person told us so about a gig from before this app existed. The app shows
    which, because those are not the same claim.
    """
    artist_id: UUID
    name: str
    image_url: str | None = None
    deezer_fans: int | None = None
    lastfm_listeners: int | None = None
    added_on: datetime

    seen: bool = False
    seen_via: str | None = None          # "passport" | "manual" | None
    seen_on: date | None = None          # the date the passport holds, when it has one

    # The soonest upcoming show we hold for them, so a want can become a save in one tap.
    # Absent means nothing is announced that we know of — which is a different statement
    # from "they are not playing", and the app words it that way.
    next_event_id: UUID | None = None
    next_event_title: str | None = None
    next_event_starts_at: datetime | None = None
    next_event_city: str | None = None
    next_event_country: str | None = None


class Wishlist(BaseModel):
    """The screen's whole payload: two lists and the count that makes it a progress bar."""
    still_to_see: list[WishlistLine] = []
    seen: list[WishlistLine] = []
    total: int = 0
    seen_count: int = 0
    # How many of the still-to-see acts have a show we hold. The line the screen leads with
    # — "3 on your wishlist are playing" — and the reason this list is not a notes app.
    playing_count: int = 0


class WishlistAddIn(BaseModel):
    """What the client sends to add a line.

    Shaped like FollowArtistIn on purpose: both arrive from the same Deezer search result,
    and both reconcile to a single local artist row by normalised name rather than minting
    a second 'AR Rahman' beside the existing 'A.R. Rahman'.
    """
    name: str
    deezer_id: int | None = None
    image_url: str | None = None
