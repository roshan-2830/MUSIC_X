"""artists.live_facts — cache what setlist.fm says an artist plays live

setlist.fm allows 2 requests a second and 1,440 a day. The reviews screen would otherwise
ask about the artist on every single view, which burns the day's budget on a handful of
users and then fails for everybody else.

`live_facts_checked_on` exists for the same reason as venues.capacity_checked_on: a NULL
cache cannot say whether we have never asked or asked and setlist.fm had nothing. Most
artists in a Ticketmaster catalogue have no setlist at all, so without the date the cache
re-asks about them forever — the bug that was costing the scorer 1,118 wasted Deezer calls
per run until today.


Revision ID: 831ce161d070
Revises: 09c9f237fde3
Create Date: 2026-09-01 16:09:45.764376

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '831ce161d070'
down_revision: Union[str, Sequence[str], None] = '09c9f237fde3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("artists", sa.Column("live_facts", postgresql.JSONB(), nullable=True))
    op.add_column("artists", sa.Column("live_facts_checked_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("artists", "live_facts_checked_on")
    op.drop_column("artists", "live_facts")
