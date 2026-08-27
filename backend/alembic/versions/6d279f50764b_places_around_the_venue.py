"""places around the venue — cached OpenStreetMap POIs

Revision ID: 6d279f50764b
Revises: 02b69835097c

Cached rather than fetched per view, for two reasons. Overpass is a donated public service
whose usage policy asks for restraint, and a café does not move: one fetch per venue serves
every person who ever opens that show. Measured 13.1s for Alexandra Palace and 4.5s for
Madrid's Wizink Center, which is far too slow to sit in front of a screen more than once.

`fetched_at` on venues records the ATTEMPT, not the success. Overpass 504s often — three of
five mirrors were failing while this was written — and without a record of trying, every view
of a venue in a thin part of the map would re-ask and re-wait.
"""
from alembic import op
import sqlalchemy as sa

revision = "6d279f50764b"
down_revision = "02b69835097c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "venue_places",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("venue_id", sa.Uuid(),
                  sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        # OSM's own identity, so a re-fetch updates a row rather than duplicating it. Type is
        # needed alongside id because node/way/relation ids are separate sequences.
        sa.Column("osm_type", sa.String(), nullable=False),
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        # 'eat' or 'do'. Decided at fetch time from the OSM tag, so the screen never has to
        # know what an `amenity=fast_food` is.
        sa.Column("bucket", sa.String(), nullable=False),
        # The raw OSM category — "cafe", "museum", "park" — shown to the reader as-is.
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("cuisine", sa.String(), nullable=True),
        sa.Column("website", sa.String(), nullable=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        # Straight-line metres from the venue, stored because it is what the list is ordered
        # by and recomputing it for 200 rows on every request buys nothing.
        sa.Column("distance_m", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("venue_id", "osm_type", "osm_id", name="uq_venue_place"),
    )
    # The only query this table serves: one venue's places, nearest first.
    op.create_index("ix_venue_places_venue_dist", "venue_places",
                    ["venue_id", "bucket", "distance_m"])
    op.add_column("venues",
                  sa.Column("places_fetched_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("venues", "places_fetched_at")
    op.drop_index("ix_venue_places_venue_dist", table_name="venue_places")
    op.drop_table("venue_places")
