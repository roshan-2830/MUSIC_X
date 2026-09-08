"""Letting go of shows nobody kept.

Nothing has ever removed a past event. The catalogue only grew — 1,300 to 2,200 new shows a
day, each dragging roughly nine `event_facts` rows and a line-up behind it — so the database
climbed steadily towards the 500 MB ceiling with no ceiling of its own. A concert in August
that no user ever touched is dead weight: it cannot be searched for, cannot be scored (the
MXS cohort is upcoming events only), and nobody will ever open it.

WHAT MAKES THIS SAFE, and it is not the grace period.

Almost every foreign key into `events` is ON DELETE CASCADE:

    calendar_entries  hotel_bookings  reviews  travel_legs  trip_stops
    event_invites     notifications   dismissed_suggestions

So a plain `DELETE FROM events WHERE starts_at < now()` would take a person's saved shows,
their hotel booking, their reviews and their trip plans with it — silently, with no error.
Only `passport_entries` is NO ACTION and would object, which is luck rather than design.

The protection therefore has to be explicit, and it is: an event survives if ANY row in ANY
user-owned table points at it. Not "if it was attended" — if anybody ever did anything with
it at all.

WHY THE TABLE LISTS ARE CHECKED AGAINST THE SCHEMA AT RUNTIME. The festival cleanup once
carried a guard that named two of the seven tables it needed to check, and it was one saved
show away from deleting a user's data. A hand-written list drifts the moment somebody adds a
table. So `_verify_coverage` reads the actual foreign keys and REFUSES TO RUN if it finds one
this module has not been told about. A new table is then a loud failure on the next run
rather than a quiet deletion, which is the only acceptable direction for that mistake.
"""
import os
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal

# How long after a show before it may be dropped. Long enough that the hourly Passport
# stamper and the "were you there?" question have had their chance — though neither actually
# depends on it, because a person with a ticket has a calendar_entries row and is protected
# forever regardless of age.
GRACE_DAYS = int(os.getenv("ARCHIVE_GRACE_DAYS", "14"))

# Tables where a row means A PERSON DID SOMETHING with this event. Any hit here and the event
# stays, permanently. When in doubt a table belongs in this list: keeping a few thousand rows
# costs kilobytes, and deleting somebody's memory costs their trust.
PROTECT = (
    "calendar_entries",        # saved it, or claimed a ticket for it
    "passport_entries",        # was actually there
    "reviews",                 # wrote about it
    "hotel_bookings",          # booked a bed for it
    "travel_legs",             # booked a way there
    "trip_stops",              # built a trip around it
    "event_invites",           # invited somebody, or was invited
    "notifications",           # was told something about it
    "dismissed_suggestions",   # said "not this one" — an answer worth keeping
    "referrals",               # shared it
    "event_highlights",        # curated, cheap to keep, and nobody can recreate it
)

# Tables that are OUR OWN record of the show and mean nothing without it. These cascade away
# with the event, which is correct — they are the catalogue, not the person.
DISPOSABLE = (
    "event_artists", "event_facts", "event_genres",
    "event_sources", "event_changes", "event_offers",
)

# Deleting in chunks, for the reason the scoring job learned the hard way: one transaction
# over thousands of rows holds a write lock on `events` for its whole length, and the
# catalogue refresh queues behind it until Supabase's statement timeout kills one of them.
CHUNK = 200


def _verify_coverage(db: Session) -> list:
    """Every table with a foreign key to events must be classified. Returns the unknown ones.

    This is the check the festival cleanup did not have. It reads the live schema rather than
    trusting the lists above, so a table added next month cannot be silently cascaded away —
    the job stops instead.
    """
    rows = db.execute(text("""
        SELECT DISTINCT tc.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND ccu.table_name = 'events'
           AND tc.table_name <> 'events'
    """)).all()
    known = set(PROTECT) | set(DISPOSABLE)
    return sorted(r[0] for r in rows if r[0] not in known)


def _guard_sql() -> str:
    """The SQL for "somebody has touched this event"."""
    parts = [f"EXISTS (SELECT 1 FROM {t} x WHERE x.event_id = e.id)" for t in PROTECT]
    # And one that is not a foreign key from another table but a self-reference: a duplicate
    # event points at its survivor. Delete the survivor and the pointer dangles.
    parts.append("EXISTS (SELECT 1 FROM events m WHERE m.merged_into = e.id)")
    return " OR ".join(parts)


def purge_past_events(grace_days: int | None = None, dry_run: bool = True,
                      limit: int | None = None) -> dict:
    """Drop past events nobody kept. DRY RUN BY DEFAULT — pass dry_run=False to delete.

    The default is the safe one on purpose. A function that deletes when called with no
    arguments is one somebody will call with no arguments.
    """
    grace = GRACE_DAYS if grace_days is None else grace_days
    db: Session = SessionLocal()
    try:
        unknown = _verify_coverage(db)
        if unknown:
            # Refusing is the whole point. Somebody added a table that references events and
            # this module does not know whether its rows are the catalogue's or a person's.
            msg = (f"REFUSING TO RUN: {', '.join(unknown)} reference(s) events but are in "
                   f"neither PROTECT nor DISPOSABLE. Classify them in services/archive.py.")
            print(f"[archive] {msg}")
            return {"ran": False, "reason": msg, "unknown_tables": unknown}

        guard = _guard_sql()
        where = f"""
            e.starts_at IS NOT NULL
            AND e.starts_at < now() - interval '{int(grace)} days'
            AND NOT ({guard})
        """
        counted = db.execute(text(
            f"SELECT count(*) FROM events e WHERE {where}")).scalar() or 0
        protected = db.execute(text(f"""
            SELECT count(*) FROM events e
             WHERE e.starts_at IS NOT NULL
               AND e.starts_at < now() - interval '{int(grace)} days'
               AND ({guard})""")).scalar() or 0

        result = {"ran": True, "grace_days": grace, "eligible": counted,
                  "protected": protected, "deleted": 0, "dry_run": dry_run}

        if dry_run:
            print(f"[archive] DRY RUN — {counted:,} past event(s) eligible, "
                  f"{protected:,} protected, nothing deleted")
            return result

        deleted = 0
        while True:
            n = db.execute(text(f"""
                DELETE FROM events
                 WHERE id IN (SELECT e.id FROM events e WHERE {where} LIMIT {CHUNK})
            """)).rowcount
            db.commit()
            deleted += n
            if n == 0 or (limit and deleted >= limit):
                break
        result["deleted"] = deleted
        print(f"[archive] removed {deleted:,} past event(s) nobody kept "
              f"({protected:,} protected, grace {grace}d)")
        return result
    finally:
        db.close()
