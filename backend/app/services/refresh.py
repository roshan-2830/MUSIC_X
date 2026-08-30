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
    # Give each listing one home, here too. Costs no API requests — it is one query over
    # what we already hold — and without it a festival the concert sweep saw first sits
    # under Concerts until tomorrow's refresh. Runs AFTER both sweeps, always.
    deduped = 0
    try:
        from app.services.festival_merge import (drop_duplicate_festival_events,
                                                 merge_by_bill, merge_festivals,
                                                 promote_big_bill_events)
        promote_big_bill_events(dry_run=False)
        merge_festivals(dry_run=False)
        merge_by_bill(dry_run=False)
        deduped = drop_duplicate_festival_events(dry_run=False)["deleted"]
        # Venues, in the same spirit and for the same reason as the festivals above. The
        # ingest now matches on a normalised name, so 'Toyota Center - TX' can no longer
        # arrive as a second row — but a building Ticketmaster renames outright still can,
        # and only evidence catches that. Then fill any location still missing. Neither
        # costs an API request.
        from app.services.venue_merge import merge_venues
        from app.services.venue_repair import recover_missing_coords
        merge_venues(dry_run=False)
        recover_missing_coords(dry_run=False)
        # Ticket types last: merging venues first can bring two variants of one show onto
        # the same venue_id, and only then do they group.
        from app.services.event_merge import merge_ticket_variants
        merge_ticket_variants(dry_run=False)
    except Exception as e:
        print(f"[sweep] festival reconcile error: {e}")
    alerts = {}
    try:
        alerts = run_alerts()          # newly announced shows by artists people follow
    except Exception as e:
        print(f"[sweep] alerts error: {e}")
    summary = {"concerts": concerts, "festivals": festivals, "deduped": deduped, "alerts": alerts}
    print(f"[sweep] done — {summary}")
    return summary


def refresh_catalogue(limit: int | None = None, horizon_days: int | None = None) -> dict:
    """Deep refresh — re-verify events by their Ticketmaster id (status, dates, price,
    cancellations), plus refresh festivals.

    TWO CADENCES, because they answer different questions. With `horizon_days` the pass covers
    only shows inside that window — 353 events rather than 10,874 — and that is the one worth
    running often, because a cancellation matters most for a show somebody has a ticket for
    this week. Without it, the pass is the full catalogue and runs once a day.

    Measured on the live catalogue, this takes the daily work from 86,992 event-checks to
    13,698: an 85% cut. That matters beyond API budget — re-reading the whole catalogue eight
    times a day was moving roughly 120 MB out of the database daily with no users at all, and
    is most of why the project went over its egress allowance.

    `limit` caps events for a quick test."""
    result = reverify_all_events(limit=limit, horizon_days=horizon_days)
    festivals = 0
    try:
        festivals = len(ingest_festivals(deep=True))
    except Exception as e:
        print(f"[refresh] festival error: {e}")
    # Fold Ticketmaster's ticket-type listings back into one festival. AFTER ingestion,
    # never before: ingestion creates a fresh row for every new day pass, so merging first
    # would leave those rows standing alone until tomorrow. Same order as rebuild-then-prune.
    merged = {}
    try:
        from app.services.festival_merge import (drop_duplicate_festival_events,
                                                  drop_non_festivals, merge_by_bill,
                                                  merge_festivals, promote_big_bill_events)
        # Order matters and each step feeds the next: promote concert rows with a
        # festival-sized bill, fold the ticket-type variants by name, then by BILL for the
        # ones whose names share nothing, then drop what is not a festival, and finally give
        # each listing one home.
        promote_big_bill_events(dry_run=False)
        merged = merge_festivals(dry_run=False)
        merge_by_bill(dry_run=False)
        drop_non_festivals(dry_run=False)
        # Then give each listing one home. After the merge, so "covered by a visible
        # festival" accounts for rows that were just folded into a survivor.
        merged["deduped_concerts"] = drop_duplicate_festival_events(dry_run=False)["deleted"]
        from app.services.venue_merge import merge_venues
        from app.services.venue_repair import recover_missing_coords
        merged["venues_merged"] = merge_venues(dry_run=False)["rows_merged"]
        merged["venues_located"] = recover_missing_coords(dry_run=False)["recovered"]
        from app.services.event_merge import merge_ticket_variants
        merged["ticket_variants"] = merge_ticket_variants(dry_run=False)["rows_merged"]
    except Exception as e:
        print(f"[refresh] festival merge error: {e}")

    # Score LAST, once the catalogue has settled. Both cohorts, because the full formula was
    # reachable by nothing: score_all_events exists and has clearly run at some point — 2,253
    # events carry a percentile only it writes — but no schedule or endpoint calls it, so a
    # show that arrives through live search keeps the provisional artist-only score for good.
    # 568 were sitting on one. Calibration is a ranking, so it has to be redone whenever the
    # cohort changes, which is every refresh.
    scores = {}
    try:
        from app.services.scoring import score_all_events
        from app.services.festival_scoring import score_all_festivals
        scores["events"] = score_all_events()
        scores["festivals"] = score_all_festivals()
    except Exception as e:
        print(f"[refresh] scoring error: {type(e).__name__} {e}")
    alerts = {}
    try:
        alerts = run_alerts()          # cancellations / date moves / price drops we just spotted
    except Exception as e:
        print(f"[refresh] alerts error: {e}")
    summary = {**result, "festivals": festivals, "merged": merged,
               "scores": scores, "alerts": alerts}
    print(f"[refresh] done — {summary}")
    return summary
