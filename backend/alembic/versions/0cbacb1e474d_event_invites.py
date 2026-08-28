"""invite a friend to a show

Revision ID: 0cbacb1e474d
Revises: c21ea6df92cc

No table for friendships: `follows` is already polymorphic (user_id + followable_type +
followable_id, unique together) and carries artists today. A person is just another thing to
follow, so following someone writes followable_type='user'. There is no CHECK constraint to
widen, and every existing query filters on the type it wants.

WHO CAN SEE WHOSE PLANS IS A MUTUAL DECISION, and that is why there is no visibility column
here. "Sarah is going to this on Saturday" is a person's future physical location, which is a
different kind of fact from Instagram's "you both follow this band". Attendance is therefore
shown only between people who follow EACH OTHER — computed at read time from two rows in
`follows`, so it can never drift out of step with who is actually connected to whom, and
un-following someone takes their view of your plans away in the same instant.

An invite is not an attendance record. It says one person pointed a show at another; whether
they go is still `calendar_entries`.
"""
from alembic import op
import sqlalchemy as sa

revision = "0cbacb1e474d"
down_revision = "c21ea6df92cc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_invites",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_id", sa.Uuid(),
                  sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_user_id", sa.Uuid(),
                  sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_user_id", sa.Uuid(),
                  sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        # Free text from the sender, shown in the notification. Nullable: most invites are
        # just the show.
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        # One invite per person per show. Re-inviting is not a second notification, it is a
        # no-op — otherwise "invite everyone" tapped twice doubles someone's alerts.
        sa.UniqueConstraint("event_id", "from_user_id", "to_user_id", name="uq_event_invite"),
        # Nobody invites themselves, and a database that permits it will eventually contain it.
        sa.CheckConstraint("from_user_id <> to_user_id", name="ck_invite_not_self"),
    )
    # "What have I been invited to" — the only query the inbox runs.
    op.create_index("ix_event_invites_to", "event_invites", ["to_user_id", "created_at"])
    # "Who has already been invited to this show by me" — read every time the sheet opens, so
    # the button can say Invited instead of Invite.
    op.create_index("ix_event_invites_from_event", "event_invites",
                    ["from_user_id", "event_id"])
    # Following a PERSON is a new shape for an old table; this index serves "who follows me",
    # which has no other way to be asked.
    op.create_index("ix_follows_target", "follows", ["followable_type", "followable_id"])


def downgrade() -> None:
    op.drop_index("ix_follows_target", table_name="follows")
    op.drop_index("ix_event_invites_from_event", table_name="event_invites")
    op.drop_index("ix_event_invites_to", table_name="event_invites")
    op.drop_table("event_invites")
