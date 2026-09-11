"""a wishlist line can be crossed off by hand

Revision ID: 28ed7a70ece9
Revises: 3036e206da09
Create Date: 2026-09-09

The Passport records shows we can PROVE someone attended — a ticket, a setlist.fm match,
a stamp from a finished booking. A wishlist line also needs to be crossable for the gigs
that happened before this app existed, and that claim has no evidence behind it.

Rather than write an unevidenced row into passport_entries and weaken the one table built
to hold only evidenced ones, the manual tick lives on the wishlist line itself. A line
reads as seen if EITHER a passport entry exists for that artist or this column is set.
"""
from alembic import op
import sqlalchemy as sa

revision = "28ed7a70ece9"
down_revision = "3036e206da09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bucket_list", sa.Column("seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("bucket_list", "seen_at")
