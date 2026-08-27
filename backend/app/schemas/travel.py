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
    # Where booking happens. We never take the payment — the PRD bars it in the schema — so
    # this always leads to the supplier, and the referral disclosure sits beside it.
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
    stays: list[Stay] = []
    flights: list[Flight] = []
