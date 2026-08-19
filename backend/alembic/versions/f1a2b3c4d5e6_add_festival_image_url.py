"""add festival image_url

Revision ID: f1a2b3c4d5e6
Revises: 35da84470ec7
Create Date: 2026-08-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = '35da84470ec7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('festivals', sa.Column('image_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('festivals', 'image_url')
