"""calendar_entries ticket cost

What the ticket actually cost, as the person recorded it — not `price_from` off the listing.
The trip ledger's "All-in" figure is a sum of real numbers or it is nothing: price_from is the
cheapest tier advertised at ingest, so adding it up would produce a total nobody paid.

Revision ID: 3c51f564a9da
Revises: 88232913900f
Create Date: 2026-09-05 22:22:21.626705

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c51f564a9da'
down_revision: Union[str, Sequence[str], None] = '88232913900f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("calendar_entries", sa.Column("ticket_cost", sa.Numeric(10, 2), nullable=True))
    op.add_column("calendar_entries", sa.Column("ticket_currency", sa.String(3), nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_entries", "ticket_currency")
    op.drop_column("calendar_entries", "ticket_cost")
