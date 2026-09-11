"""planning is a hotel or an invite, not a note

Revision ID: 366185669c5b
Revises: 28ed7a70ece9
Create Date: 2026-09-10

Two changes, both about the same rule.

1. REPAIR. Plan state is derived from a calendar entry (services/plan.derive returns "" when
   there is none), but picking a hotel wrote only to hotel_bookings and sending an invite
   wrote only to event_invites. So those shows had NO state at all: somebody chose a bed or
   asked a friend along and the stepper stayed blank. Measured before this ran: 3 hotel
   bookings and ~80 invites pointing at shows that were never saved. This creates the missing
   entries so those plans become visible again.

   Not a guess about intent — the hotel row and the invite row ARE the evidence. Inserted as
   is_suggestion = false, because the person acted rather than being offered something.

2. DROP calendar_entries.note. It was the weakest planning signal — jotting "check parking" is
   not planning a trip — and the only one that ever worked, by accident: the note is a column
   ON the entry, so writing one created the row derive() needs while a hotel and an invite did
   not. Two notes existed at the time of writing, and they go with the column.

   event_invites.note is UNTOUCHED. That is the message you send a friend with an invitation,
   a different feature entirely.

The downgrade puts the column back, empty. The two notes are not recoverable, and the
repaired calendar entries are deliberately left in place: they are true.
"""
from alembic import op
import sqlalchemy as sa

revision = "366185669c5b"
down_revision = "28ed7a70ece9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. a hotel booking with no calendar entry
    op.execute("""
        INSERT INTO calendar_entries (id, user_id, event_id, state, is_suggestion,
                                      reminder_level, booked, booked_via_link,
                                      created_at, updated_at)
        SELECT gen_random_uuid(), hb.user_id, hb.event_id, 'interested', false,
               'normal', false, false, now(), now()
          FROM hotel_bookings hb
         WHERE hb.event_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM calendar_entries ce
                            WHERE ce.user_id = hb.user_id AND ce.event_id = hb.event_id)
        ON CONFLICT DO NOTHING
    """)

    # 2. an invite SENT with no calendar entry. The sender only — being invited is not a plan
    #    of your own until you accept, and that has its own flow.
    op.execute("""
        INSERT INTO calendar_entries (id, user_id, event_id, state, is_suggestion,
                                      reminder_level, booked, booked_via_link,
                                      created_at, updated_at)
        SELECT DISTINCT ON (ei.from_user_id, ei.event_id)
               gen_random_uuid(), ei.from_user_id, ei.event_id, 'interested', false,
               'normal', false, false, now(), now()
          FROM event_invites ei
         WHERE ei.event_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM calendar_entries ce
                            WHERE ce.user_id = ei.from_user_id AND ce.event_id = ei.event_id)
        ON CONFLICT DO NOTHING
    """)

    op.drop_column("calendar_entries", "note")


def downgrade() -> None:
    op.add_column("calendar_entries", sa.Column("note", sa.Text(), nullable=True))
