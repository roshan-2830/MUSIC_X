"""add artist wiki_url / website_url — the links a reader can check us against

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, Sequence[str], None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('artists', sa.Column('wiki_url', sa.String(), nullable=True))
    op.add_column('artists', sa.Column('website_url', sa.String(), nullable=True))
    op.add_column('artists', sa.Column('links_checked_on', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('artists', 'links_checked_on')
    op.drop_column('artists', 'website_url')
    op.drop_column('artists', 'wiki_url')
