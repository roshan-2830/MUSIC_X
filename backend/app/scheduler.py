"""In-app scheduler. Recurring jobs while the server is up:

  • sweep_catalogue   — every few hours: broad DISCOVERY of new shows (any artist) + festivals
  • refresh_catalogue — every few hours: re-verify every event by id (status, dates, price)
  • enrich_catalogue  — daily: fill artist pages (photo, bio, tags, similar, popularity)
  • reminders         — hourly: time-driven alerts (on-sale, a week out, day-of)
  • push_delivery     — every couple of minutes: send whatever has not reached a phone yet
  • passport_stamps   — hourly: record finished ticketed shows in the Concert Passport

NOTE: these only fire while the backend process is running. On your Mac that means
"while the dev server is on". For true always-on scheduling the backend must be
deployed to a host that never sleeps — then these same jobs keep working unchanged."""
import os
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from app.services.enrichment import enrich_all
from app.services.refresh import refresh_catalogue, sweep_catalogue
from app.services.passport import stamp_finished_shows
from app.services.push import deliver_pending
from app.services.reminders import run_reminders

# Broad discovery sweep cadence (default every 3h) and the deeper daily refresh (default 24h).
SWEEP_INTERVAL_HOURS = float(os.getenv("SWEEP_INTERVAL_HOURS", "3"))
# 3h, not 24h. It was daily because a re-verify cost one Ticketmaster request per event —
# 6,583 of them, more than the whole 5,000-a-day quota, so it could only be afforded once and
# even then only for the soonest 2,000. Batched at 150 ids per request the same pass is 44
# requests and under four minutes, so there is no longer a reason to make a cancellation wait
# up to a day to reach anyone. Eight runs a day come to roughly 750 requests including the
# festival sweep — a sixth of the quota.
REFRESH_INTERVAL_HOURS = float(os.getenv("REFRESH_INTERVAL_HOURS", "3"))
# Artist-page enrichment: daily, and bounded per stage. These are free community APIs
# (Deezer, Wikipedia, Last.fm), so the limit is about being a good citizen rather than
# about cost — a run that completes beats one that gets throttled halfway.
ENRICH_INTERVAL_HOURS = float(os.getenv("ENRICH_INTERVAL_HOURS", "24"))
# 1500, up from 300. The old figure was set when every artist cost a serialised round trip
# with a sleep after it, so 300 was about as much as a run could finish. With fetches
# overlapping behind a per-source rate limiter the same wall-clock buys roughly five times as
# many, and the gap is worth closing: of 6,388 artists on upcoming bills only 10% have a bio
# and 78% a photo, and 1,512 unscored concerts are waiting on an artist nobody has looked up.
# Set ENRICH_LIMIT higher for a one-off catch-up; it only makes the run longer.
ENRICH_LIMIT = int(os.getenv("ENRICH_LIMIT", "1500"))
# Reminders are time-driven, not change-driven, which is why they need their own cadence: the
# alerts engine only ever fires because Ticketmaster altered something, so nothing existed to
# notice that a show is a week away. Hourly, because a day-of reminder that arrives eleven hours
# late is no longer a day-of reminder, and the pass is a single query over saved shows inside the
# next eight days — no external calls at all.
REMINDER_INTERVAL_HOURS = float(os.getenv("REMINDER_INTERVAL_HOURS", "1"))
# Push delivery, in MINUTES. Every other job here is measured in hours because it talks to
# somebody else's API; this one only reads our own table and posts what it finds. The whole
# value of a notification is that it arrives while it still matters, so the gap between
# "created" and "on the lock screen" should be the smallest thing in this file.
PUSH_INTERVAL_MINUTES = float(os.getenv("PUSH_INTERVAL_MINUTES", "2"))
# Stamping finished shows into the Passport. Hourly is plenty: a concert that ended last night
# does not need recording within the minute, and the point of the job is only that it happens
# WITHOUT anybody opening a screen.
PASSPORT_INTERVAL_HOURS = float(os.getenv("PASSPORT_INTERVAL_HOURS", "1"))

# The startup guard still exists, and still works to the calendar day, but it now guards
# against something narrower than it used to. It was there because a refresh cost ~3,800
# requests and five restarts would have burned the day's quota; batching made a refresh 44
# requests, so the risk it protects against is now mostly wasted minutes rather than a spent
# quota. Kept because restarting a dev server ten times should still not run ten full passes.
#
# Day granularity is not a simplification: `last_verified` is a DATE column, so a day is the
# finest the stored evidence can distinguish, and an "hours since" guard would be false
# precision. With the interval now at 3h the scheduled job covers the rest of the day anyway.


def _refresh_due(today=None) -> tuple:
    """(should_run, last_verified) — the DECISION only, with no side effect.

    Split from the job that acts on it so the rule can be tested without spending 3,800 API
    calls to find out what it would decide. Calling the acting version to check its
    reasoning is exactly how a test turns into a live refresh.
    """
    from sqlalchemy import text

    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        last = db.execute(text("SELECT max(last_verified) FROM events")).scalar()
    finally:
        db.close()
    today = today or datetime.now(timezone.utc).date()
    return (last is None or last < today), last


def _refresh_if_stale() -> None:
    """Run the deep refresh at startup, unless one already ran today.

    The daily interval only fires if the process survives a full day, which on a laptop it
    never does — so the catalogue went eight days without a re-check while the schedule
    looked perfectly healthy. This is what makes "daily" mean daily.

    The guard needs no new table: reverify_all_events stamps `last_verified` on every event
    it checks, so the freshest stamp in the catalogue IS the date of the last refresh.
    """
    from app.services.refresh import refresh_catalogue

    due, last = _refresh_due()
    if not due:
        print(f"[scheduler] startup refresh skipped — catalogue already verified {last}")
        return
    print(f"[scheduler] catalogue last verified {last} — running a deep refresh now")
    refresh_catalogue()

scheduler = BackgroundScheduler(timezone="UTC")


def start_scheduler() -> None:
    """Register all recurring jobs and start the scheduler (idempotent)."""
    if scheduler.running:
        return
    scheduler.add_job(
        sweep_catalogue,
        trigger="interval",
        hours=SWEEP_INTERVAL_HOURS,
        id="sweep_catalogue",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        # Run once at startup, then every interval. An interval trigger alone schedules its
        # FIRST run a full interval away, so nothing happened until the process had already
        # survived that long.
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=20),
    )
    scheduler.add_job(
        refresh_catalogue,
        trigger="interval",
        hours=REFRESH_INTERVAL_HOURS,
        id="refresh_catalogue",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        enrich_all,
        trigger="interval",
        hours=ENRICH_INTERVAL_HOURS,
        id="enrich_catalogue",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        kwargs={"limit": ENRICH_LIMIT},
        # Free to run — Deezer, Wikipedia, Wikidata and Last.fm cost nothing and spend no
        # Ticketmaster budget — so there is no reason to make it wait a day for its turn.
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=45),
    )
    scheduler.add_job(
        run_reminders,
        trigger="interval",
        hours=REMINDER_INTERVAL_HOURS,
        id="reminders",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        # Runs shortly after startup like the others: on a laptop the process rarely survives an
        # hour, and a reminder that only fires if the machine stays awake is not a reminder.
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=60),
    )

    scheduler.add_job(
        deliver_pending,
        trigger="interval",
        minutes=PUSH_INTERVAL_MINUTES,
        id="push_delivery",
        replace_existing=True,
        max_instances=1,
        # coalesce matters more here than anywhere else: at a two-minute cadence a laptop that
        # slept for an hour wakes owing thirty runs, and running them all would send the same
        # backlog thirty times over. One catch-up run delivers exactly the same notifications.
        coalesce=True,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=30),
    )

    scheduler.add_job(
        stamp_finished_shows,
        trigger="interval",
        hours=PASSPORT_INTERVAL_HOURS,
        id="passport_stamps",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=75),
    )

    # The deep refresh is the expensive one, so it gets a guard rather than a free pass.
    scheduler.add_job(
        _refresh_if_stale,
        id="refresh_on_startup",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=90),
    )

    scheduler.start()
    print(f"[scheduler] started — sweep every {SWEEP_INTERVAL_HOURS}h, "
          f"refresh every {REFRESH_INTERVAL_HOURS}h, "
          f"enrich every {ENRICH_INTERVAL_HOURS}h (limit {ENRICH_LIMIT}/stage) — "
          f"reminders every {REMINDER_INTERVAL_HOURS}h, "
          f"push delivery every {PUSH_INTERVAL_MINUTES}m, "
          f"passport stamps every {PASSPORT_INTERVAL_HOURS}h — "
          f"sweep, enrich, reminders and push also run at startup; refresh runs at startup only if "
          f"the catalogue was not already verified today")


def trigger_refresh_now(limit: int | None = None) -> None:
    """Kick off a one-off deep refresh immediately (manual trigger endpoint)."""
    scheduler.add_job(
        refresh_catalogue, id="refresh_now", replace_existing=True, kwargs={"limit": limit}
    )


def trigger_sweep_now() -> None:
    """Kick off a one-off broad discovery sweep immediately (manual trigger endpoint)."""
    scheduler.add_job(sweep_catalogue, id="sweep_now", replace_existing=True)


def trigger_score_now() -> None:
    """Re-score every upcoming concert AND festival immediately.

    Separate from refresh because scoring needs no API budget at all — it reads what is
    already stored — so it is the one job that is free to re-run whenever the catalogue has
    shifted underneath it. Calibration is a ranking across the cohort, so adding or merging
    events changes every other score.
    """
    def _both():
        from app.services.festival_scoring import score_all_festivals
        from app.services.scoring import score_all_events
        print(f"[score] events   -> {score_all_events()}")
        print(f"[score] festivals -> {score_all_festivals()}")

    scheduler.add_job(_both, id="score_now", replace_existing=True)


def trigger_enrich_now(limit: int | None = None) -> None:
    """Kick off a one-off artist enrichment immediately (manual trigger endpoint)."""
    scheduler.add_job(
        enrich_all, id="enrich_now", replace_existing=True,
        kwargs={"limit": limit or ENRICH_LIMIT},
    )


def trigger_push_now() -> int:
    """Run the delivery pass immediately and IN-LINE, returning what it did.

    In-line rather than queued, unlike the other triggers here: this one exists so a person can
    tap a button and find out whether push actually works on their phone. A trigger that returns
    "accepted" tells them nothing about whether the notification arrived.
    """
    return deliver_pending()
