"""how many times this festival has been held before

The MXS reviews component has no data: the reviews table is empty, its rows are keyed to
event_id so a festival cannot be reviewed at all, and only 6 of 513 festivals have even
finished. Measured 2026-08-26, no free source carries festival ratings either —
MusicBrainz has the field but not the data (Glastonbury 2014 holds a rating of 5 from TWO
votes; Primavera Sound holds none).

What MusicBrainz does carry, reliably and free, is the EDITIONS: Creamfields back to 1998,
Louder Than Life across 2014-2024, Corona Capital across 2015-2024. A festival in its
eleventh year is a proven event in a way a first-year one is not, and that is the honest
signal available where a rating is not.

Cached on the row because the lookup is one HTTP request per festival at MusicBrainz's
1-per-second limit — 513 festivals is nine minutes, which a nightly scorer must not repeat.

Revision ID: e1abad0f7a7f
Revises: 3396219474a7
Create Date: 2026-08-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1abad0f7a7f'
down_revision: Union[str, Sequence[str], None] = '3396219474a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL means "never looked", 0 means "looked and found none" — a distinction the scorer
    # needs, because absent evidence and evidence of absence are not the same claim.
    op.add_column('festivals', sa.Column('past_editions', sa.Integer(), nullable=True))
    op.add_column('festivals', sa.Column('editions_checked_on', sa.Date(), nullable=True))
    op.add_column('festivals', sa.Column('first_edition_year', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('festivals', 'first_edition_year')
    op.drop_column('festivals', 'editions_checked_on')
    op.drop_column('festivals', 'past_editions')
