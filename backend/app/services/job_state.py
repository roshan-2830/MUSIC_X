"""Has anything a job reads actually changed since it last ran?

WHY THIS EXISTS. score_all_events re-rates the whole catalogue every time it is called,
because MXS is a ranking and a ranking cannot be computed for one row. Over one month it ran
roughly 700 times — every dev-server restart, every formula change, every manual trigger —
and re-read 15,665 events each time. That was 11 GB of Supabase egress, and the great
majority of those runs produced byte-identical scores, because nothing underneath had moved.

A run that cannot change any output is not caution, it is postage.

HOW IT DECIDES. Not "did I run recently" — that is a memory, and memories are wrong. A
FINGERPRINT, read from the tables themselves: row counts and newest timestamps across
everything the pass consumes. If the fingerprint is identical to the one recorded after the
last successful run, every input is identical, so every output would be too.

THREE PROPERTIES IT MUST HAVE, and does:

  FAILS OPEN. Any error computing the fingerprint returns None, and None never matches, so
  the job runs. Skipping is never what happens by accident.

  HAS A CEILING. Past MAX_SKIP_HOURS the fingerprint is ignored and the job runs anyway. If
  the fingerprint is ever wrong — a column somebody adds to the scorer and forgets to add
  here — the damage is bounded to a day rather than to forever.

  COSTS NOTHING TO ASK. Every part is an aggregate. Postgres does the counting and sends
  back one row of numbers, so the check itself cannot become the thing it was written to
  prevent.

WHY THE FINGERPRINT IS TAKEN AGAIN AFTER THE RUN. `events.updated_at` carries an onupdate,
and the scoring pass writes to `events` — so the act of scoring moves the fingerprint. The
value stored is therefore the one measured AFTER the write, which is what the next run will
see if nothing else touches the catalogue in between.
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

# The longest a job may go on skipping. The daily re-verify stamps `last_verified` on every
# event, which moves `updated_at`, which moves the fingerprint — so in practice a day is
# already the natural ceiling. This makes it a guarantee rather than a side effect.
MAX_SKIP_HOURS = 24

# Everything score_all_events reads, as aggregates. Adding an input to the scorer means
# adding it here; the ceiling above is what limits the cost of forgetting.
_SCORING_INPUTS = """
SELECT
  -- the cohort itself: how many, and when any of them last changed
  (SELECT count(*) FROM events
    WHERE starts_at >= date_trunc('day', now()) OR starts_at IS NULL)              AS ev_n,
  (SELECT max(updated_at) FROM events)                                             AS ev_upd,
  (SELECT max(created_at) FROM events)                                             AS ev_new,
  (SELECT count(*) FROM events WHERE retired_at IS NOT NULL)                       AS ev_ret,
  (SELECT count(*) FROM events WHERE merged_into IS NOT NULL)                      AS ev_mrg,
  -- artist stature: enrichment filling these in changes scores across the whole cohort
  (SELECT count(*) FROM artists)                                                   AS ar_n,
  (SELECT count(*) FROM artists WHERE deezer_fans IS NOT NULL)                     AS ar_dz,
  (SELECT count(*) FROM artists WHERE lastfm_listeners IS NOT NULL)                AS ar_lf,
  (SELECT max(popularity_checked_on) FROM artists)                                 AS ar_chk,
  -- venue capacity
  (SELECT count(*) FROM venues WHERE capacity IS NOT NULL)                         AS vn_cap,
  (SELECT max(capacity_checked_on) FROM venues)                                    AS vn_chk,
  -- production signals. captured_at, NOT last_verified: the re-verify stamps last_verified
  -- on 661,000 fact rows without changing a single value, and a fingerprint that moved on
  -- that would never allow a skip at all.
  (SELECT count(*) FROM event_facts)                                               AS fx_n,
  (SELECT max(captured_at) FROM event_facts)                                       AS fx_new,
  -- the bills, which decide who a show is ranked as
  (SELECT count(*) FROM event_artists)                                             AS ea_n
"""


def scoring_fingerprint(db: Session) -> str | None:
    """A hash of every input to score_all_events, or None if it could not be taken.

    None is not an error state the caller has to handle — it simply never matches a stored
    fingerprint, so the job runs. That is the whole failure design.
    """
    try:
        row = db.execute(text(_SCORING_INPUTS)).mappings().one()
    except Exception as e:                     # noqa: BLE001 — any failure means "just run"
        print(f"[job_state] fingerprint unavailable ({type(e).__name__}) — running the job")
        return None
    payload = json.dumps({k: str(v) for k, v in row.items()}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def read(db: Session, key: str) -> tuple[str | None, datetime | None]:
    """(fingerprint, when it was recorded) for a job, or (None, None) if it has never run."""
    row = db.execute(
        text("SELECT fingerprint, ran_at FROM job_state WHERE key = :k"), {"k": key}
    ).one_or_none()
    return (row[0], row[1]) if row else (None, None)


def write(db: Session, key: str, fingerprint: str | None, note: str | None = None) -> None:
    db.execute(text("""
        INSERT INTO job_state (key, fingerprint, ran_at, note)
        VALUES (:k, :f, now(), :n)
        ON CONFLICT (key) DO UPDATE
           SET fingerprint = EXCLUDED.fingerprint,
               ran_at      = EXCLUDED.ran_at,
               note        = EXCLUDED.note
    """), {"k": key, "f": fingerprint, "n": note})
    db.commit()


def should_run(db: Session, key: str, fingerprint: str | None) -> tuple[bool, str]:
    """(run?, why) — and the reason is returned so the log says what was decided, not just
    that something was."""
    if fingerprint is None:
        return True, "no fingerprint available"
    last_fp, ran_at = read(db, key)
    if last_fp is None:
        return True, "never run before"
    if ran_at is None or ran_at < datetime.now(timezone.utc) - timedelta(hours=MAX_SKIP_HOURS):
        return True, f"last run over {MAX_SKIP_HOURS}h ago"
    if last_fp != fingerprint:
        return True, "catalogue changed"
    return False, f"nothing changed since {ran_at:%Y-%m-%d %H:%M} UTC"
