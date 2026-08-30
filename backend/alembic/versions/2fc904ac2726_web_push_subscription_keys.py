"""web push subscription keys

A browser subscription is not a token, it is three things: an endpoint URL to POST to, and two
keys the browser's push service uses to decrypt the payload. They live on push_tokens rather than
in a table of their own, because everything that already works — one row per device, the row's
owner changing when someone else signs in on it, deletion when the far end says the subscription
is gone — is identical for a phone and a browser. Only the wire protocol differs.

`token` holds the endpoint for a web row, which is what makes it unique, the same way an Expo
token is unique for a phone. The two key columns are NULL for phones and set for browsers, and
that is how the sender tells them apart alongside `platform`.

Revision ID: 2fc904ac2726
Revises: f5dabde9479d
"""
from alembic import op
import sqlalchemy as sa

revision = "2fc904ac2726"
down_revision = "f5dabde9479d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("push_tokens", sa.Column("p256dh", sa.String(), nullable=True))
    op.add_column("push_tokens", sa.Column("auth", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("push_tokens", "auth")
    op.drop_column("push_tokens", "p256dh")
