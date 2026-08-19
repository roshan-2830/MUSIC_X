"""add artist_similar — cached similar-artist claims from outside sources

Revision ID: a1b2c3d4e5f6
Revises: e9f0a1b2c3d4
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e9f0a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'artist_similar',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('artist_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('match', sa.Numeric(4, 3), nullable=True),
        sa.Column('source', sa.String(), server_default='lastfm', nullable=False),
        sa.Column('fetched_on', sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(['artist_id'], ['artists.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('artist_id', 'name', 'source', name='uq_artist_similar'),
    )
    op.create_index('ix_artist_similar_artist_id', 'artist_similar', ['artist_id'])
    op.add_column('artists', sa.Column('similar_checked_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('artists', 'similar_checked_on')
    op.drop_index('ix_artist_similar_artist_id', table_name='artist_similar')
    op.drop_table('artist_similar')
