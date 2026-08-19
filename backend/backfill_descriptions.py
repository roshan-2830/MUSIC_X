"""One-time backfill: fetch each existing Ticketmaster event by id and fill in
description (falling back to `info`). Robust version: gathers the work first, then
writes each event in its own short-lived session with a retry, so a single DB
connection hiccup (Supabase pooler) can't poison the whole run. Safe to re-run —
it only touches events whose description is still NULL."""
import time

import httpx

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.event import Event
from app.models.event_source import EventSource

BASE = "https://app.ticketmaster.com/discovery/v2/events/{}.json"


def _fetch_desc(tm_id):
    r = httpx.get(BASE.format(tm_id), params={"apikey": settings.ticketmaster_api_key}, timeout=30)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    d = r.json()
    return d.get("description") or d.get("info")


def _save(event_id, desc):
    for attempt in range(3):
        s = SessionLocal()
        try:
            ev = s.get(Event, event_id)
            if ev is not None:
                ev.description = desc
                s.commit()
            s.close()
            return True
        except Exception:
            s.rollback()
            s.close()
            if attempt == 2:
                return False
            time.sleep(0.6)


def backfill():
    db = SessionLocal()
    work = (
        db.query(Event.id, EventSource.source_event_id)
        .join(EventSource, EventSource.event_id == Event.id)
        .filter(EventSource.source == "ticketmaster", Event.description.is_(None))
        .all()
    )
    db.close()

    total = len(work)
    print(f"events to check: {total}", flush=True)
    got = none = failed = 0
    for i, (event_id, tm_id) in enumerate(work, 1):
        try:
            desc = _fetch_desc(tm_id)
        except Exception:
            failed += 1
            time.sleep(0.2)
            continue
        if desc:
            got += 1 if _save(event_id, desc) else 0
        else:
            none += 1
        time.sleep(0.15)
        if i % 25 == 0:
            print(f"  {i}/{total} — {got} descriptions, {none} none, {failed} failed", flush=True)
    print(f"DONE — {got} got a description, {none} had none, {failed} failed", flush=True)


if __name__ == "__main__":
    backfill()
