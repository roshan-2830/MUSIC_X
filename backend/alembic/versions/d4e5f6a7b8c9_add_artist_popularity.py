"""add artist popularity columns — cached Deezer fans and Last.fm listeners for MXS

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('artists', sa.Column('deezer_fans', sa.Integer(), nullable=True))
    op.add_column('artists', sa.Column('lastfm_listeners', sa.Integer(), nullable=True))
    op.add_column('artists', sa.Column('popularity_checked_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('artists', 'popularity_checked_on')
    op.drop_column('artists', 'lastfm_listeners')
    op.drop_column('artists', 'deezer_fans')
