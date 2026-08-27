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
    # Supplier identity, carried so the app can say "this one is my base" and we can then ask
    # for the property's own record. Opaque handles, not credentials: they authenticate
    # nothing on their own — the API key never leaves the server.
    hotel_id: str | None = None
    supplier_provider: str | None = None


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
    # The search context these stays came out of. Sent back when someone marks one as their
    # base, because a property's details can only be asked for inside the search that found
    # it. Handles, not secrets — useless without the server's API key.
    doc_key: str | None = None
    search_token: str | None = None


class StayBase(BaseModel):
    """Where this traveller is sleeping for this show, as they told us.

    Deliberately not called a booking. Tripsure's booking flow requires Music X to collect
    the payment itself and to take a PAN number, so nothing here has been paid for — `source`
    stays 'picked' until that changes. Showing this as a confirmed reservation would be a
    claim we cannot support.
    """
    name: str
    hotel_id: str | None = None
    provider: str | None = None
    address: str | None = None
    city: str | None = None
    postal_code: str | None = None
    lat: float | None = None
    lng: float | None = None
    check_in: str | None = None
    check_out: str | None = None
    # The supplier's own strings, unparsed — "12:00 PM", or sometimes prose.
    check_in_time: str | None = None
    check_out_time: str | None = None
    star_rating: float | None = None
    image_url: str | None = None
    source: str = "picked"
    # Straight-line metres to the venue and the walk it implies. Computed here rather than
    # stored, so it stays right if a venue's coordinates are ever corrected.
    metres_to_venue: int | None = None
    walk_minutes: int | None = None
    # Where "Directions" goes. A Google Maps deep link, which is free and unmetered and opens
    # the app people already have, with live transit times we could not produce ourselves.
    directions_url: str | None = None


class TravelContext(BaseModel):
    """Whether this person has to travel to this show at all.

    The Getting there tab offered flights to everyone, so someone at home in London opening a
    London gig was shown flights to London. This says which of them is looking.
    """
    # local — in the city, or close enough to be. regional — a drive or a train.
    # far — a flight is the sensible answer. unknown — we cannot tell, and say so.
    kind: str
    reason: str | None = None
    distance_km: float | None = None
    origin_city: str | None = None
    venue_name: str | None = None
    event_city: str | None = None
    # Directions to the venue with no origin set, so the map app starts from wherever the
    # phone is. That is the right question for someone already in the city, and it is the one
    # thing we could not answer by looking anything up.
    directions_url: str | None = None
