"""venues.capacity_checked_on — so a capacity lookup is not repeated forever

Wikidata holds a capacity for roughly a fifth of the venues we carry, and will never hold
one for the rest: "Saxe Theater at Planet Hollywood Inside the Miracle Mile Shops" is not
an encyclopaedia entry. Without a marker, every run re-asks about the same ~2,800 venues
that have no answer.

That is the shape of the bug found in the scorer today, where 1,118 artists were re-fetched
from Deezer on every pass because "not looked up yet" and "looked up, and there is nothing"
were stored identically. A NULL capacity means nothing on its own; NULL capacity plus a
checked date means "asked, and Wikidata does not know".


Revision ID: 09c9f237fde3
Revises: 2d36c0e3cdd2
Create Date: 2026-09-01 15:22:33.689297

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '09c9f237fde3'
down_revision: Union[str, Sequence[str], None] = '2d36c0e3cdd2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("venues", sa.Column("capacity_checked_on", sa.Date(), nullable=True))
    # The handful of capacities that predate this were entered by hand; mark them checked
    # rather than leaving them looking un-asked.
    op.execute("UPDATE venues SET capacity_checked_on = CURRENT_DATE WHERE capacity IS NOT NULL")


def downgrade() -> None:
    op.drop_column("venues", "capacity_checked_on")
