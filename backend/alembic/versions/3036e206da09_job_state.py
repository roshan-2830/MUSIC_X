"""job_state — one row per recurring job, holding what it saw last time.

Exists so a job can answer "has anything I read actually changed since my last run?" without
that answer living in process memory, which a restart erases and a second worker never sees.

Deliberately generic (key/value) rather than a column per job: the next job that needs this
adds a row, not a migration.

Revision ID: 3036e206da09
Revises: 3c51f564a9da
Create Date: 2026-09-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3036e206da09'
down_revision: Union[str, Sequence[str], None] = '3c51f564a9da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_state",
        sa.Column("key", sa.String(64), primary_key=True),
        # A hash of everything the job reads. Text, not a timestamp: "did this change" is the
        # question, and a hash answers it without anyone having to remember to bump a clock.
        sa.Column("fingerprint", sa.String(64), nullable=True),
        sa.Column("ran_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        # What the skipped/executed run decided and why, for reading back in a log.
        sa.Column("note", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("job_state")
