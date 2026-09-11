"""The two personal ledgers behind the Me tab: My shows, and My bookings.

MONEY IS NEVER CONVERTED. A trip can be paid for in three currencies — a British card for the
flight, euros for the hotel, dollars for the ticket — and we hold no exchange rate we would be
willing to defend three weeks later. So `spend` is a LIST, one entry per currency, and the
screen prints "£220 + €118" rather than a single made-up number. It is the same rule the MXS
scorer follows: state what is known, and do not average two things that are not the same thing.
"""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.event import EventListItem
from app.schemas.festival import FestivalOut


# ---------------------------------------------------------------------- My shows

class MyShow(EventListItem):
    """A saved concert, with where it sits in this person's plans.

    `state` is derived here the same way the plan card derives it, rather than read off the
    cached column — the cache is only written when somebody opens that show's page, so a show
    saved and never re-opened would file itself under Interested forever even after the hotel
    was booked.
    """
    state: str                 # interested | planning | confirmed | attended | missed
    booked: bool
    # True when this row arrived as a suggestion rather than a deliberate save. Shown as
    # "Suggested" and dismissable, exactly as the mockup draws it.
    is_suggestion: bool = False


class MyShows(BaseModel):
    shows: list[MyShow]
    # Saved festivals have no plan states — there is no ticket flow behind them yet — so they
    # sit in their own tab rather than being filed under Interested, which would claim a
    # status nothing ever set.
    festivals: list[FestivalOut]
    counts: dict[str, int]


# ------------------------------------------------------------------- My bookings

class Money(BaseModel):
    amount: float
    currency: str


class TicketLine(BaseModel):
    booked: bool = False
    provider: str | None = None
    reference: str | None = None
    source: str | None = None          # pasted | photo | declared
    at: str | None = None
    cost: float | None = None
    currency: str | None = None


class StayLine(BaseModel):
    name: str
    check_in: date | None = None
    check_out: date | None = None
    cost: float | None = None
    currency: str | None = None
    booking_ref: str | None = None
    free_cancel_until: date | None = None
    # Is that deadline inside the warning window? Decided on the server so the "one week"
    # rule lives in exactly one place, rather than in the API and again in the phone.
    cancel_soon: bool = False
    address: str | None = None
    # 'picked' = pointed at in our hotel search, nothing paid. 'recorded' = they typed in a
    # booking they made themselves. Kept apart because only one of them is a reservation.
    source: str = "picked"


class TravelLine(BaseModel):
    id: UUID
    mode: str                          # plane | train | bus | car
    from_label: str | None = None
    to_label: str | None = None
    travel_on: date | None = None
    cost: float | None = None
    currency: str | None = None
    booking_ref: str | None = None
    free_cancel_until: date | None = None
    cancel_soon: bool = False


class Trip(BaseModel):
    """One show, and everything booked around it."""
    event: EventListItem
    ticket: TicketLine
    stay: StayLine | None = None
    travel: list[TravelLine] = []
    # ticket / stay / travel — how many of the three are done. The mockup's "2/3 booked" dots.
    stages_done: int = 0
    stages_total: int = 3
    spend: list[Money] = []
    # Days until the show. Negative once it has happened; null when the date is unknown, which
    # is why this is not simply a number the phone could subtract itself.
    days_until: int | None = None
    # How many of this trip's lines have a free-cancellation window closing within the week.
    # The card shows a banner when this is non-zero; the lines themselves carry the dates,
    # so no deadline is printed twice.
    cancel_soon: int = 0


class Bookings(BaseModel):
    upcoming: list[Trip]
    past: list[Trip]
    # Every currency this person has spent across all their trips, each summed on its own.
    spend: list[Money] = []
    trips: int = 0
    cancel_windows: int = 0


# --------------------------------------------------------------------- write shapes

class StayIn(BaseModel):
    """A stay somebody booked themselves and is recording here."""
    name: str
    check_in: date | None = None
    check_out: date | None = None
    cost: float | None = None
    currency: str | None = None
    booking_ref: str | None = None
    free_cancel_until: date | None = None


class TravelIn(BaseModel):
    mode: str
    from_label: str | None = None
    to_label: str | None = None
    travel_on: date | None = None
    cost: float | None = None
    currency: str | None = None
    booking_ref: str | None = None
    free_cancel_until: date | None = None


class TicketCostIn(BaseModel):
    cost: float | None = None
    currency: str | None = None
