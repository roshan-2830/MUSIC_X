"""when tickets go on sale, so a reminder can be about something

Revision ID: 2e504c3734d8
Revises: eb8cd6216a85

The Reminders control offered "on-sale, a week before, and day-of" and the app held none of
those facts. Ticketmaster does: every payload carries sales.public.startDateTime and
endDateTime, confirmed against three live events. Nothing was reading it.

startTBD / startTBA are in the same object and are why these columns are nullable rather than
defaulted: an announced show whose on-sale date is not set yet has no date, and inventing one
would have the app promise an alert on a day nobody chose.

`sales_end_at` is captured in the same pass because it arrives free in the same object and
answers something the app cannot answer at all today — whether a show is still buyable.
"""
from alembic import op
import sqlalchemy as sa

revision = "2e504c3734d8"
down_revision = "eb8cd6216a85"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("onsale_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("events", sa.Column("sales_end_at", sa.DateTime(timezone=True), nullable=True))
    # The reminder pass asks "which saved shows just went on sale", so this column is read
    # across the catalogue on every run.
    op.create_index("ix_events_onsale_at", "events", ["onsale_at"])


def downgrade() -> None:
    op.drop_index("ix_events_onsale_at", table_name="events")
    op.drop_column("events", "sales_end_at")
    op.drop_column("events", "onsale_at")
