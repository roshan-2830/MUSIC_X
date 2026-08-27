"""where the user is staying — location and identity on hotel_bookings

Revision ID: 02b69835097c
Revises: e1abad0f7a7f

The table was scaffolded with a name, dates and a cost, which is enough to show a card and
enough for the cancellation alert. It is not enough to answer "where is this person sleeping,
and how do they get from there to the doors" — that needs a real address and real coordinates.

`source` is the load-bearing column. Tripsure's booking flow requires us to collect the
payment ourselves and to take a PAN number, so in-app booking is a business decision that has
not been made. Until it is, a row here records a hotel the traveller POINTED AT, which is a
weaker claim than a booking and must never be rendered as one. When real booking arrives it
writes to this same table with source='booked' and a booking_ref, and the two stay
distinguishable forever.
"""
from alembic import op
import sqlalchemy as sa

revision = "02b69835097c"
down_revision = "e1abad0f7a7f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Supplier identity, so the record can be refreshed or later turned into a booking.
    op.add_column("hotel_bookings", sa.Column("hotel_id", sa.String(), nullable=True))
    op.add_column("hotel_bookings", sa.Column("provider", sa.String(), nullable=True))

    # Where it actually is. Verified against a live /api/hotel/details call: address, city,
    # zip, latitude and longitude all come back as strings on hotelInfo.
    op.add_column("hotel_bookings", sa.Column("address", sa.String(), nullable=True))
    op.add_column("hotel_bookings", sa.Column("city", sa.String(), nullable=True))
    op.add_column("hotel_bookings", sa.Column("postal_code", sa.String(), nullable=True))
    # Float, not Numeric: these are only ever used for distance arithmetic and map placement,
    # never summed or compared for equality.
    op.add_column("hotel_bookings", sa.Column("lat", sa.Float(), nullable=True))
    op.add_column("hotel_bookings", sa.Column("lng", sa.Float(), nullable=True))

    # Kept as the supplier's own strings ("12:00 PM"), NOT parsed into times. They arrive
    # without a timezone and sometimes as prose — "as per destination norms" — so parsing
    # would either throw or invent a precision the source does not have.
    op.add_column("hotel_bookings", sa.Column("check_in_time", sa.String(), nullable=True))
    op.add_column("hotel_bookings", sa.Column("check_out_time", sa.String(), nullable=True))

    op.add_column("hotel_bookings", sa.Column("star_rating", sa.Numeric(2, 1), nullable=True))

    # 'picked' — the traveller told us this is their base. 'booked' — money changed hands.
    # Defaulted server-side so the column can be NOT NULL on a table that already has rows
    # (it has none today, but a default that only lives in Python is a trap for scripts).
    op.add_column("hotel_bookings",
                  sa.Column("source", sa.String(), nullable=False, server_default="picked"))

    # One base per person per show. A re-pick replaces rather than accumulates, so the
    # question "where are they staying" always has exactly one answer.
    op.create_unique_constraint("uq_hotel_booking_user_event", "hotel_bookings",
                                ["user_id", "event_id"])


def downgrade() -> None:
    op.drop_constraint("uq_hotel_booking_user_event", "hotel_bookings", type_="unique")
    for col in ("source", "star_rating", "check_out_time", "check_in_time", "lng", "lat",
                "postal_code", "city", "address", "provider", "hotel_id"):
        op.drop_column("hotel_bookings", col)
