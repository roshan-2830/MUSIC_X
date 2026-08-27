"""retire shows Ticketmaster has dropped — two strikes, not one

Revision ID: 76909348b254
Revises: 6d279f50764b

22 upcoming shows were still being offered to users after Ticketmaster stopped listing them —
mostly duplicate "Roxette 40th Anniversary Tour" ticket-type rows, plus non-events like
"Sponsorship - Venmo" and "Box-Seat in the Ticketmaster...". The re-verify has always noticed
them (it counted 25 as `gone`) and has never acted on it.

TWO STRIKES, because one is not evidence. A show absent from a single response could be a
partial answer, a supplier hiccup, or a listing being edited — and hiding a real concert
someone holds tickets for is a far worse mistake than briefly showing one that has been pulled.
`missing_count` records consecutive misses; `retired_at` is only stamped on the second.

It is reversible on its own. Any response that returns the event clears both columns, so a
show that comes back reappears without anyone intervening.

The filter goes next to `merged_into IS NULL` — nine places across events, me, artists and
cities. Deliberately not folded into a helper: the existing code states that condition
explicitly at every call site, and one greppable pattern is easier to audit than an
abstraction that can be forgotten.
"""
from alembic import op
import sqlalchemy as sa

revision = "76909348b254"
down_revision = "6d279f50764b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("missing_count", sa.Integer(), nullable=False,
                                      server_default="0"))
    op.add_column("events", sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True))
    # Every listing query filters on this, so it is worth an index — a partial one, because
    # the rows we want are the overwhelming majority and NULL is what we search for.
    op.create_index("ix_events_not_retired", "events", ["starts_at"],
                    postgresql_where=sa.text("retired_at IS NULL"))


def downgrade() -> None:
    op.drop_index("ix_events_not_retired", table_name="events")
    op.drop_column("events", "retired_at")
    op.drop_column("events", "missing_count")
