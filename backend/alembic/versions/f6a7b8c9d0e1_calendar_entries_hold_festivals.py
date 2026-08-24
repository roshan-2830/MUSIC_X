"""calendar entries can hold a festival as well as an event

A saved festival is the same promise as a saved show — "I'm going to this, tell me if it
changes" — so it belongs in the same table rather than a parallel one. That keeps ONE
saved list for the Calendar tab, and it means services/alerts.py picks festivals up by
the same path it already uses for shows, with no second code path to keep in sync.

`event_id` therefore becomes nullable and a check constraint enforces that a row points
at exactly one of the two. The old (user_id, event_id) unique constraint still holds for
shows: Postgres treats NULLs as distinct, so festival rows don't collide under it.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('calendar_entries', 'event_id', existing_type=sa.Uuid(), nullable=True)
    op.add_column('calendar_entries', sa.Column('festival_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_calendar_festival', 'calendar_entries', 'festivals',
        ['festival_id'], ['id'], ondelete='CASCADE',
    )
    op.create_unique_constraint(
        'uq_calendar_user_festival', 'calendar_entries', ['user_id', 'festival_id'],
    )
    # Exactly one target. Without this a row could point at both, or at nothing, and the
    # saved list would silently carry entries that render as blanks.
    op.create_check_constraint(
        'ck_calendar_one_target', 'calendar_entries',
        '(event_id IS NOT NULL AND festival_id IS NULL) OR '
        '(event_id IS NULL AND festival_id IS NOT NULL)',
    )


def downgrade() -> None:
    op.drop_constraint('ck_calendar_one_target', 'calendar_entries', type_='check')
    op.drop_constraint('uq_calendar_user_festival', 'calendar_entries', type_='unique')
    op.drop_constraint('fk_calendar_festival', 'calendar_entries', type_='foreignkey')
    op.execute('DELETE FROM calendar_entries WHERE event_id IS NULL')
    op.drop_column('calendar_entries', 'festival_id')
    op.alter_column('calendar_entries', 'event_id', existing_type=sa.Uuid(), nullable=False)
