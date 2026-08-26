"""In-app scheduler. Three recurring jobs while the server is up:

  • sweep_catalogue   — every few hours: broad DISCOVERY of new shows (any artist) + festivals
  • refresh_catalogue — daily: re-check + re-score followed / known artists
  • enrich_catalogue  — daily: fill artist pages (photo, bio, tags, similar, popularity)

NOTE: these only fire while the backend process is running. On your Mac that means
"while the dev server is on". For true always-on scheduling the backend must be
deployed to a host that never sleeps — then these same jobs keep working unchanged."""
import os

from apscheduler.schedulers.background import BackgroundScheduler

from app.services.enrichment import enrich_all
from app.services.refresh import refresh_catalogue, sweep_catalogue

# Broad discovery sweep cadence (default every 3h) and the deeper daily refresh (default 24h).
SWEEP_INTERVAL_HOURS = float(os.getenv("SWEEP_INTERVAL_HOURS", "3"))
REFRESH_INTERVAL_HOURS = float(os.getenv("REFRESH_INTERVAL_HOURS", "24"))
# Artist-page enrichment: daily, and bounded per stage. These are free community APIs
# (Deezer, Wikipedia, Last.fm), so the limit is about being a good citizen rather than
# about cost — a run that completes beats one that gets throttled halfway.
ENRICH_INTERVAL_HOURS = float(os.getenv("ENRICH_INTERVAL_HOURS", "24"))
ENRICH_LIMIT = int(os.getenv("ENRICH_LIMIT", "300"))

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
    )
    scheduler.start()
    print(f"[scheduler] started — sweep every {SWEEP_INTERVAL_HOURS}h, "
          f"refresh every {REFRESH_INTERVAL_HOURS}h, "
          f"enrich every {ENRICH_INTERVAL_HOURS}h (limit {ENRICH_LIMIT}/stage)")


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
