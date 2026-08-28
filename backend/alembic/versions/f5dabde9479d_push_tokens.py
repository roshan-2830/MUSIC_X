"""somewhere to send a notification

Revision ID: f5dabde9479d
Revises: 2e504c3734d8

Every notification the app has ever produced — cancellations, date moves, invitations, the new
reminders — was written to a table and waited for somebody to open the app and tap the bell. A
day-of reminder that only appears once you are already in the app is not a reminder.

ONE ROW PER DEVICE, not per user. A person has a phone and a tablet, and a reminder that reaches
only the device they happened to register last is a lottery. The token is the primary identity
here — it is what Expo addresses — and it moves between users when a phone is handed over or an
account is switched, which is why user_id is updatable rather than part of the key.

`pushed_at` on notifications is what makes delivery a separate pass from creation. The four
places that create notifications should not each have to remember to send one; one job asks
"what has not been delivered" and that question cannot be forgotten.
"""
from alembic import op
import sqlalchemy as sa

revision = "f5dabde9479d"
down_revision = "2e504c3734d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        # Expo's own token, e.g. ExponentPushToken[xxxxxxxx]. Unique across the table: the same
        # device registering twice must update its row, never create a second one, or every
        # notification arrives twice.
        sa.Column("token", sa.String(), nullable=False, unique=True),
        sa.Column("user_id", sa.Uuid(),
                  sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(), nullable=True),      # ios | android
        # Bumped on every registration, so a device that has not checked in for months can be
        # told apart from one in daily use.
        sa.Column("last_seen_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_push_tokens_user", "push_tokens", ["user_id"])

    op.add_column("notifications",
                  sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True))
    # The delivery pass reads exactly this: undelivered, newest first. Partial, because
    # everything already sent is dead weight in the index and that is the majority.
    op.create_index("ix_notifications_unpushed", "notifications", ["created_at"],
                    postgresql_where=sa.text("pushed_at IS NULL"))
    # EVERYTHING THAT ALREADY EXISTS IS MARKED DELIVERED. Without this, switching push on would
    # fire every historical notification at once — 60-odd alerts, several of them months old,
    # arriving as a burst. Nobody wants to be told about a price drop from July.
    op.execute("UPDATE notifications SET pushed_at = now() WHERE pushed_at IS NULL")


def downgrade() -> None:
    op.drop_index("ix_notifications_unpushed", table_name="notifications")
    op.drop_column("notifications", "pushed_at")
    op.drop_index("ix_push_tokens_user", table_name="push_tokens")
    op.drop_table("push_tokens")
