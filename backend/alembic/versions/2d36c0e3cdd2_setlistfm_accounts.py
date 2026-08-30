"""setlistfm accounts

Which setlist.fm profile a person has linked, so their history can be re-imported later without
them typing it again, and so the app can say "linked as X" rather than silently remembering.

The username is NOT authentication and this table does not pretend otherwise — anyone can type
anyone's, setlist.fm history is public, and there is no way to prove ownership through their API
(the profile fields a code could be read back from are documented as deprecated and the live API
returns only userId and url). Entries imported from here are therefore written with
source='setlist_fm' and the setlist URL as evidence, and the passport shows that provenance
rather than presenting them as confirmed.

Revision ID: 2d36c0e3cdd2
"""
from alembic import op
import sqlalchemy as sa

revision = "2d36c0e3cdd2"
down_revision = "2fc904ac2726"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "setlistfm_accounts",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("profiles.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("profile_url", sa.String(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_import_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("setlistfm_accounts")
