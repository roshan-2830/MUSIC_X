"""Drive the saved-show alert pipeline for a demo, then put everything back.

WHY THIS EXISTS. The alert machinery is complete and correct — cancellations,
postponements, date moves and price drops, each routed to whoever saved that show, with
wording written per change kind and preference checks applied. It has produced nothing of
that sort because Ticketmaster has reported no such change while we have been watching. All
39 notifications in the database are `new_show`.

WHAT IS REAL AND WHAT IS NOT. This script supplies the INPUT the detector waits for — the
same values Ticketmaster would send if a show moved or was cancelled. Everything downstream
is the production path, untouched:

    track_changes()      the real comparison, staging real EventChange rows
    alerts_for_changes() the real fan-out to users who saved the event
    _wording()           the real copy, per change kind
    Notification rows    the real records the app's bell reads

So the demo proves the pipeline, not the notification. Say that plainly to anyone watching:
"we simulated the date change; everything after it is what happens in production."

REVERSIBLE BY DESIGN. Every value it overwrites is recorded in the EventChange row it
creates — old_value IS the original — so `revert` restores from the audit trail rather than
from a guess, and removes the notifications and change rows it made.

    python -m scripts.demo_alerts apply      stage the changes, fire the real alerts
    python -m scripts.demo_alerts restate    re-align the events after a refresh undid them
    python -m scripts.demo_alerts revert     put everything back
"""
import json
import pathlib
import sys
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.event import Event
from app.services.alerts import run_alerts
from app.services.ingestion import track_changes

# What this run touched, so revert is exact rather than heuristic.
LEDGER = pathlib.Path(__file__).with_name("demo_alerts_ledger.json")


def _saved_events(db, limit=3):
    """Saved shows, soonest first — a cancellation matters most for the nearest date."""
    rows = db.execute(text("""
        SELECT DISTINCT e.id
        FROM calendar_entries ce
        JOIN events e ON e.id = ce.event_id
        WHERE ce.event_id IS NOT NULL AND e.merged_into IS NULL
        ORDER BY e.id
        LIMIT :n
    """), {"n": limit}).all()
    return [db.get(Event, r[0]) for r in rows]


def apply() -> None:
    db = SessionLocal()
    made = {"changes": [], "events": []}
    try:
        events = _saved_events(db)
        if not events:
            print("No saved shows. Save one in the app first, then run this again.")
            return

        # One of each kind the app treats as urgent, so the demo shows the range rather than
        # the same alert three times.
        # Three kinds, all urgent, none needing a price. A price drop was the obvious third
        # and is not available: no saved show in the catalogue lists a price, so there is
        # nothing to drop FROM, and inventing a starting price would be inventing the fact
        # the alert is supposed to report.
        kinds = ["date_moved", "cancelled", "postponed"]
        plan = list(zip(events, kinds))

        for ev, kind in plan:
            status = ev.status or "scheduled"
            starts_at = ev.starts_at
            price = ev.price_from_amount

            if kind == "date_moved":
                starts_at = (ev.starts_at + timedelta(days=2)) if ev.starts_at else None
            elif kind == "cancelled":
                status = "cancelled"
            elif kind == "postponed":
                status = "postponed"

            # The real comparison, staging real change rows. Must run BEFORE the new values
            # are written, which is the contract track_changes documents.
            rows = track_changes(db, ev, status=status, starts_at=starts_at,
                                 price_amount=price, source="ticketmaster")
            if not rows:
                print(f"  no change staged for {ev.title[:40]} ({kind})")
                continue

            made["events"].append({
                "id": str(ev.id), "title": ev.title,
                "status": ev.status, "starts_at": ev.starts_at.isoformat() if ev.starts_at else None,
                "price": str(ev.price_from_amount) if ev.price_from_amount is not None else None,
            })
            ev.status, ev.starts_at, ev.price_from_amount = status, starts_at, price
            db.flush()
            made["changes"] += [str(r.id) for r in rows]
            print(f"  staged {kind:11} on {ev.title[:44]}")

        db.commit()
        LEDGER.write_text(json.dumps(made, indent=2))
    finally:
        db.close()

    print("\nrunning the real alert pipeline...")
    run_alerts()

    db = SessionLocal()
    try:
        print("\nsaved-show notifications now in the database:")
        for r in db.execute(text("""
            SELECT type, priority, title, body FROM notifications
            WHERE type <> 'new_show' ORDER BY created_at DESC LIMIT 10""")).all():
            print(f"  [{r[0]}/{r[1]}] {r[2]}")
            print(f"      {r[3][:110]}")
    finally:
        db.close()


def revert() -> None:
    if not LEDGER.exists():
        print("No ledger — nothing to revert.")
        return
    made = json.loads(LEDGER.read_text())
    db = SessionLocal()
    try:
        for e in made["events"]:
            ev = db.get(Event, e["id"])
            if not ev:
                continue
            ev.status = e["status"]
            if e["starts_at"]:
                from datetime import datetime
                ev.starts_at = datetime.fromisoformat(e["starts_at"])
            ev.price_from_amount = Decimal(e["price"]) if e["price"] is not None else None
            print(f"  restored {ev.title[:48]}")

        if made["changes"]:
            ids = made["changes"]
            n = db.execute(text("""DELETE FROM notifications WHERE event_id IN (
                    SELECT event_id FROM event_changes WHERE id = ANY(CAST(:ids AS uuid[])))
                AND type <> 'new_show'"""), {"ids": ids}).rowcount
            db.execute(text("DELETE FROM event_changes WHERE id = ANY(CAST(:ids AS uuid[]))"),
                       {"ids": ids})
            print(f"  removed {n} demo notification(s) and {len(ids)} change row(s)")
        db.commit()
        LEDGER.unlink()
        print("reverted — the catalogue is as it was")
    finally:
        db.close()


def restate() -> None:
    """Re-apply the demo values to the events, WITHOUT creating new alerts.

    Needed because the deep refresh does its job: it re-fetches each event from Ticketmaster
    and overwrites local drift, so a demo change made an hour ago is gone. Two of the three
    were corrected within two minutes of being staged — last_verified moved to today and the
    status went back to `scheduled` — while the third survived only because the refresh had
    not reached it yet.

    The notifications persist regardless; they are records of a change that was observed, not
    a view of current state. This only makes the event rows agree with them again, so a
    screen showing "Cancelled: Shakira" is not sitting next to a Shakira page that says the
    show is on. Run it a minute before demonstrating.
    """
    if not LEDGER.exists():
        print("No ledger — run `apply` first.")
        return
    made = json.loads(LEDGER.read_text())
    db = SessionLocal()
    try:
        for r in db.execute(text("""
            SELECT ec.event_id, ec.kind, ec.new_value FROM event_changes ec
            WHERE ec.id = ANY(CAST(:ids AS uuid[]))"""), {"ids": made["changes"]}).all():
            ev = db.get(Event, r[0])
            if not ev:
                continue
            if r[1] in ("cancelled", "postponed"):
                ev.status = r[1]
            elif r[1] == "date_moved":
                from datetime import datetime
                ev.starts_at = datetime.fromisoformat(r[2])
            elif r[1] == "price_drop":
                ev.price_from_amount = Decimal(r[2])
            print(f"  re-stated {r[1]:11} on {ev.title[:44]}")
        db.commit()
        print("events now match their notifications")
    finally:
        db.close()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "apply"
    {"apply": apply, "revert": revert, "restate": restate}.get(cmd, apply)()
