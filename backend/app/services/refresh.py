"""Scheduled catalogue jobs.

  • sweep_catalogue   — broad DISCOVERY of new shows (any artist) + festivals. Fast/light.
  • refresh_catalogue — deep re-verify of EVERY event we have (status/dates/price) + festivals.

Both are safe to re-run (ingestion upserts by Ticketmaster id — updates in place, never
duplicates). Ticketmaster has no South Asia data, so India-only shows never appear here."""
from app.services.alerts import run_alerts
from app.services.ingestion import ingest_broad_light, ingest_festivals, reverify_all_events


def sweep_catalogue() -> dict:
    """Broad DISCOVERY sweep — pull a wide batch of upcoming shows (ANY artist, followed
    or not) plus festivals, so newly announced shows appear on their own. Light/fast; no
    scoring (swept events get scored on the next deep refresh / when searched or followed)."""
    print("[sweep] starting broad Ticketmaster sweep")
    concerts = 0
    try:
        concerts = ingest_broad_light(size=100)
    except Exception as e:
        print(f"[sweep] concert sweep error: {e}")
    festivals = 0
    try:
        festivals = len(ingest_festivals())
    except Exception as e:
        print(f"[sweep] festival error: {e}")
    alerts = {}
    try:
        alerts = run_alerts()          # newly announced shows by artists people follow
    except Exception as e:
        print(f"[sweep] alerts error: {e}")
    summary = {"concerts": concerts, "festivals": festivals, "alerts": alerts}
    print(f"[sweep] done — {summary}")
    return summary


def refresh_catalogue(limit: int | None = None) -> dict:
    """Deep refresh — re-verify EVERY event in the catalogue by its Ticketmaster id
    (status/dates/price/cancellations), for ALL shows, not just followed artists, plus
    refresh festivals. `limit` caps events for a quick test."""
    result = reverify_all_events(limit=limit)
    festivals = 0
    try:
        festivals = len(ingest_festivals())
    except Exception as e:
        print(f"[refresh] festival error: {e}")
    alerts = {}
    try:
        alerts = run_alerts()          # cancellations / date moves / price drops we just spotted
    except Exception as e:
        print(f"[refresh] alerts error: {e}")
    summary = {**result, "festivals": festivals, "alerts": alerts}
    print(f"[refresh] done — {summary}")
    return summary
