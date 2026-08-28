"""what the ticket evidence was — provider, reference, how it arrived

Revision ID: eb8cd6216a85
Revises: 0cbacb1e474d

`booked` already existed and nothing ever wrote it; the tracker needs to know not just THAT
somebody has a ticket but where the claim came from, because the four states are only as
trustworthy as the evidence underneath them. "Confirmed" with no provenance is the same kind of
guess the MXS refuses to publish.

`ticket_source` records the route: 'pasted' (a confirmation we parsed), 'photo' (they uploaded
one), 'declared' (they simply said so). Kept distinct because they are not equally strong, and a
later feature — email forwarding, or a seller that reports back — should be able to tell its own
evidence from a self-report.

DELIBERATELY NOT STORING THE PASTED TEXT. A confirmation email carries a name, an address, the
last digits of a card and sometimes a barcode. We need the seller and the reference; keeping the
rest would be holding somebody's payment record to answer a question we have already answered.
"""
from alembic import op
import sqlalchemy as sa

revision = "eb8cd6216a85"
down_revision = "0cbacb1e474d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calendar_entries",
                  sa.Column("ticket_provider", sa.String(), nullable=True))
    op.add_column("calendar_entries",
                  sa.Column("ticket_ref", sa.String(), nullable=True))
    op.add_column("calendar_entries",
                  sa.Column("ticket_source", sa.String(), nullable=True))
    op.add_column("calendar_entries",
                  sa.Column("booked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for col in ("booked_at", "ticket_source", "ticket_ref", "ticket_provider"):
        op.drop_column("calendar_entries", col)
