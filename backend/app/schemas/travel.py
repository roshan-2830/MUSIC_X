from pydantic import BaseModel


class Stay(BaseModel):
    """A place to sleep near the show, normalised away from any one supplier's field names."""
    name: str
    image_url: str | None = None
    price_amount: float | None = None
    price_currency: str | None = None
    rating: float | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    # From the live response: "0 kms", "1.2 kms" — distance from the search point, which for
    # us is the venue's city.
    distance: str | None = None
    # "Refundable" / "Non-Refundable", and what the rate includes ("Room Only").
    refundability: str | None = None
    board_basis: str | None = None
    # Who actually holds the inventory — the live response says Makemytrip. Shown because a
    # traveller deciding where to sleep is entitled to know who they are buying from.
    supplier: str | None = None
    deep_link: str | None = None
    provider: str = "tripsure"


class Flight(BaseModel):
    airline: str | None = None
    flight_number: str | None = None
    origin: str | None = None
    destination: str | None = None
    departs_at: str | None = None
    arrives_at: str | None = None
    stops: int | None = None
    duration_minutes: int | None = None
    price_amount: float | None = None
    price_currency: str | None = None
    deep_link: str | None = None
    provider: str = "tripsure"


class TravelOptions(BaseModel):
    """The answer, with a stated reason when it is empty.

    `status` exists because "no hotels" and "we could not ask" are different claims, and this
    app says which. A screen that cannot tell them apart ends up implying a city has no
    hotels when the truth is that a credential is missing.
    """
    status: str                       # ok | not_configured | unavailable | no_location
    reason: str | None = None
    check_in: str | None = None
    check_out: str | None = None
    # Where "Book a hotel" goes: Tripsure's own results page, pre-filled with this city and
    # these dates. There is no per-hotel URL, so the hand-over is at city level.
    booking_url: str | None = None
    stays: list[Stay] = []
    flights: list[Flight] = []
