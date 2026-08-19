"""In-app scheduler. Two recurring jobs while the server is up:

  • sweep_catalogue   — every few hours: broad DISCOVERY of new shows (any artist) + festivals
  • refresh_catalogue — daily: re-check + re-score followed / known artists

NOTE: both only fire while the backend process is running. On your Mac that means
"while the dev server is on". For true always-on scheduling the backend must be
deployed to a host that never sleeps — then these same jobs keep working unchanged."""
import os

from apscheduler.schedulers.background import BackgroundScheduler

from app.services.refresh import refresh_catalogue, sweep_catalogue

# Broad discovery sweep cadence (default every 3h) and the deeper daily refresh (default 24h).
SWEEP_INTERVAL_HOURS = float(os.getenv("SWEEP_INTERVAL_HOURS", "3"))
REFRESH_INTERVAL_HOURS = float(os.getenv("REFRESH_INTERVAL_HOURS", "24"))

scheduler = BackgroundScheduler(timezone="UTC")


def start_scheduler() -> None:
    """Register both recurring jobs and start the scheduler (idempotent)."""
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
    scheduler.start()
    print(f"[scheduler] started — sweep every {SWEEP_INTERVAL_HOURS}h, refresh every {REFRESH_INTERVAL_HOURS}h")


def trigger_refresh_now(limit: int | None = None) -> None:
    """Kick off a one-off deep refresh immediately (manual trigger endpoint)."""
    scheduler.add_job(
        refresh_catalogue, id="refresh_now", replace_existing=True, kwargs={"limit": limit}
    )


def trigger_sweep_now() -> None:
    """Kick off a one-off broad discovery sweep immediately (manual trigger endpoint)."""
    scheduler.add_job(sweep_catalogue, id="sweep_now", replace_existing=True)
