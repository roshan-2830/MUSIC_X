"""stamp when a bio was last looked for, so the pool drains

Revision ID: c21ea6df92cc
Revises: 76909348b254

Bios had no "checked" column, so `_todo` selected every artist whose bio was NULL — the same
artists, in the same order, on every run. A 1,500-artist pass spent 3,000 Wikipedia requests to
find 6 bios, because the ones with pages were filled long ago and the rest are venue residencies
and tribute acts that Wikipedia correctly has no article for.

Raising the per-stage limit was pointless without this: a bigger budget spent on the same
hopeless names finds the same nothing, slower.

NOT a permanent write-off. The stage re-tries anything checked more than 30 days ago, so an act
who gets an article next month is picked up — just not re-asked about every three hours. That is
the same reasoning the images stage documents for having no stamp at all, with the arithmetic
redone: an image is one Deezer call at 8/s, a bio is two Wikipedia calls at 3/s, and at that
price "ask again forever" stops being free.
"""
from alembic import op
import sqlalchemy as sa

revision = "c21ea6df92cc"
down_revision = "76909348b254"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("artists", sa.Column("bio_checked_on", sa.Date(), nullable=True))
    # Backfilled for artists that already HAVE a bio: they were checked, evidently, and
    # leaving them NULL would make them look unchecked and put them back in the queue.
    op.execute("UPDATE artists SET bio_checked_on = CURRENT_DATE WHERE bio IS NOT NULL")


def downgrade() -> None:
    op.drop_column("artists", "bio_checked_on")
