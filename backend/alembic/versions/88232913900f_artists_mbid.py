"""artists.mbid — the MusicBrainz id, so setlist.fm is asked by id rather than by name

setlist.fm is built on MusicBrainz ids: its artist pages ARE mbids. We have been asking it
for artists by name, which is the weakest possible key and has already misfired twice today
on other services — Deezer files "A.R. Rahman" six ways, and a search for "kendrick"
returned a 73-fan artist called Kendrick rather than Kendrick Lamar. A name miss shows an
empty screen; a name mismatch shows a covers band's setlist under a stadium act, which is
worse because it looks true.

Ticketmaster already sends the mbid in externalLinks.musicbrainz.id on every attraction. We
download that payload and throw the field away.

Not every artist has one — tribute acts and small local names often do not, and those are
exactly the artists with no setlists anyway. mbid_checked_on records that we looked, so an
artist without one is not re-examined on every ingest.


Revision ID: 88232913900f
Revises: 831ce161d070
Create Date: 2026-09-01 17:29:05.371690

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '88232913900f'
down_revision: Union[str, Sequence[str], None] = '831ce161d070'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("artists", sa.Column("mbid", sa.String(length=36), nullable=True))
    op.add_column("artists", sa.Column("mbid_checked_on", sa.Date(), nullable=True))
    # Looking an artist up BY mbid is the whole point, so it needs an index.
    op.create_index("ix_artists_mbid", "artists", ["mbid"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_artists_mbid", table_name="artists")
    op.drop_column("artists", "mbid_checked_on")
    op.drop_column("artists", "mbid")
