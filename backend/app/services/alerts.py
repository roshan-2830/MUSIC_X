"""Alerts — telling the people who care that something moved.

Step 1 gave us receipts (`event_changes`). This turns them into `notifications`
rows. It is deliberately the only place in the codebase that decides who hears
about what, so the policy is readable in one screen.

WHO gets told
-------------
  • **a change to a show you SAVED** goes to you. Not to everyone who follows the
    artist — an artist on a 40-date tour would otherwise fire 40 alerts at every
    follower for shows they never expressed interest in.
  • **a newly announced show by an artist you FOLLOW** goes to you. That is what
    following is for.

WHAT overrides your preferences
-------------------------------
Cancellations, postponements and date moves are delivered whatever your settings
say, because they are the cases where silence costs you money — a flight to a show
that is not happening. `notification_prefs` has no toggle for them by design; that
was decided when the table was written. Everything else respects the toggles.

WHAT we deliberately do NOT send
--------------------------------
A price RISE. We record it in `event_changes` (the audit trail stays complete) but
we do not push it at you: it is not actionable and not a safety issue, and an app
that pings you because something got more expensive is just noise.

Running twice is safe
---------------------
Each change row is stamped `notified_at` once processed, and new-show alerts are
de-duplicated against notifications that already exist. Re-running produces nothing.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.artist import Artist
from app.models.calendar_entry import CalendarEntry
from app.models.city import City
from app.models.event import Event
from app.models.event_change import EventChange
from app.models.event_fact import EventFact
from app.models.follow import Follow
from app.models.notification import Notification
from app.models.notification_pref import NotificationPref
from app.services import reminders
from app.models.venue import Venue

# How far back to look for shows WE ingested recently. Comfortably wider than the
# 3-hourly sweep, so nothing slips through a missed run; duplicates are filtered.
NEW_SHOW_WINDOW_DAYS = 7

# ...but `Event.created_at` is when WE first saw a show, NOT when it was announced.
# Calling a six-month-old listing "new" because our importer only just reached it
# would be a lie the user has no way to check. So we require a real announcement
# signal from the source: its public on-sale date, recorded as an `on_sale` fact.
# On sale within this many days (or still to come) = genuinely new. No on-sale date
# on record = we cannot show it is new, so we do not claim it is.
ANNOUNCE_DAYS = 21

# One artist announcing a tour drops a dozen dates at once. Three per artist per run
# is enough to tell you it happened; the rest surface on later runs rather than being
# dropped, and the count is logged so a cap never masquerades as complete coverage.
MAX_PER_ARTIST_PER_RUN = 3

# change kind -> (notification type, priority, pref attribute or None = always send)
CHANGE_POLICY = {
    "cancelled":  ("cancellation", "high",   None),
    "postponed":  ("postponed",    "high",   None),
    "date_moved": ("date_change",  "high",   None),
    "reinstated": ("reinstated",   "normal", None),
    "price_drop": ("price_drop",   "normal", "price_drop"),
    # "price_rise" is intentionally absent — recorded, never pushed.
}


def _tz(ev: Event):
    try:
        return ZoneInfo(ev.timezone) if ev.timezone else timezone.utc
    except Exception:
        return timezone.utc


def _when(iso: str | None, ev: Event) -> str:
    """An ISO timestamp as the user would read it, in the show's own timezone."""
    if not iso:
        return "an unlisted date"
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_tz(ev)).strftime("%a %-d %b %Y, %H:%M")


def _money(v: str | None, ev: Event) -> str:
    if v is None:
        return "an unlisted price"
    cur = ev.price_from_currency or ""
    return f"{float(v):.2f} {cur}".strip()


def _place(db: Session, ev: Event) -> str:
    venue = db.get(Venue, ev.venue_id) if ev.venue_id else None
    city = db.get(City, venue.city_id) if venue and venue.city_id else None
    return " · ".join(x for x in (venue.name if venue else None, city.name if city else None) if x)


def _wording(db: Session, change: EventChange, ev: Event) -> tuple[str, str]:
    """Plain, specific, and never claiming more than the source said."""
    title = ev.title or "A show you saved"
    if change.kind == "cancelled":
        return (f"Cancelled: {title}",
                f"{change.source.title()} now lists this show as cancelled. If you have "
                f"tickets or travel booked, contact the seller — we cannot cancel them for you.")
    if change.kind == "postponed":
        return (f"Postponed: {title}",
                f"{change.source.title()} now lists this show as postponed. No new date has "
                f"been published yet — we will tell you the moment one is.")
    if change.kind == "reinstated":
        return (f"Back on: {title}",
                f"{change.source.title()} lists this show as going ahead again.")
    if change.kind == "date_moved":
        return (f"New date: {title}",
                f"Moved from {_when(change.old_value, ev)} to {_when(change.new_value, ev)}, "
                f"according to {change.source.title()}. Check any travel you booked.")
    if change.kind == "price_drop":
        return (f"Cheaper now: {title}",
                f"Tickets from {_money(change.old_value, ev)} down to "
                f"{_money(change.new_value, ev)} on {change.source.title()}.")
    return (title, f"{change.field} changed from {change.old_value} to {change.new_value}.")


def _allows(prefs: dict, user_id, attr: str | None) -> bool:
    """No preference row means the defaults, which are all-on."""
    if attr is None:
        return True                      # safety alerts have no opt-out, by design
    pref = prefs.get(user_id)
    return True if pref is None else bool(getattr(pref, attr, True))


def alerts_for_changes(db: Session) -> dict:
    """Turn every un-notified change into notifications for whoever saved that show."""
    pending = (db.query(EventChange)
                 .filter(EventChange.notified_at.is_(None))
                 .order_by(EventChange.detected_at).all())
    if not pending:
        return {"changes": 0, "notifications": 0, "skipped_by_pref": 0}

    event_ids = {c.event_id for c in pending}
    events = {e.id: e for e in db.query(Event).filter(Event.id.in_(event_ids)).all()}

    # who saved these shows (real saves only — a "suggestion" is not a commitment)
    savers: dict = {}
    for ce in (db.query(CalendarEntry)
                 .filter(CalendarEntry.event_id.in_(event_ids),
                         CalendarEntry.is_suggestion.is_(False)).all()):
        # The per-show reminder level rides along with the saver, because one of these alerts
        # — a price drop — is governed by it. Carried here rather than fetched again inside the
        # loop, which would be one query per notification.
        savers.setdefault(ce.event_id, []).append((ce.user_id, ce.reminder_level))

    user_ids = {u for lst in savers.values() for u, _lvl in lst}
    prefs = {p.user_id: p for p in
             db.query(NotificationPref).filter(NotificationPref.user_id.in_(user_ids)).all()} \
        if user_ids else {}

    now = datetime.now(timezone.utc)
    made = skipped = 0
    for c in pending:
        policy = CHANGE_POLICY.get(c.kind)
        ev = events.get(c.event_id)
        if policy and ev:
            ntype, priority, pref_attr = policy
            title, body = _wording(db, c, ev)
            for uid, level in savers.get(c.event_id, []):
                # The PER-SHOW level, which nothing consulted before this. A price drop is
                # interesting on a show somebody is set on and noise on twenty they merely
                # bookmarked, which is the whole point of the control on the plan card. Safety
                # alerts are not in the table and are never filtered.
                if not reminders.wants(level, ntype):
                    skipped += 1
                    continue
                if not _allows(prefs, uid, pref_attr):
                    skipped += 1
                    continue
                db.add(Notification(user_id=uid, type=ntype, title=title, body=body,
                                    event_id=ev.id, artist_id=ev.headliner_artist_id,
                                    priority=priority))
                made += 1
        # processed either way — a change nobody saved is still dealt with, and a
        # price rise is deliberately silent. Leaving it unstamped would re-scan forever.
        c.notified_at = now

    return {"changes": len(pending), "notifications": made, "skipped_by_pref": skipped}


def _announced_recently(db: Session, event_ids: list, now: datetime) -> set:
    """Which of these events the SOURCE says recently went (or is going) on sale.

    Read from the `on_sale` provenance fact, so this is the ticket seller's own
    announcement date — not our import date, and not a guess. An event with no
    on-sale date on record is absent from the result: we cannot demonstrate it is
    new, so it does not get announced as new.
    """
    cutoff = now - timedelta(days=ANNOUNCE_DAYS)
    ok = set()
    for f in (db.query(EventFact)
                .filter(EventFact.event_id.in_(event_ids),
                        EventFact.fact_key == "on_sale",
                        EventFact.fact_value.isnot(None)).all()):
        try:
            when = datetime.fromisoformat(f.fact_value.replace("Z", "+00:00"))
        except ValueError:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if when >= cutoff:
            ok.add(f.event_id)
    return ok


def alerts_for_new_shows(db: Session, window_days: int = NEW_SHOW_WINDOW_DAYS) -> dict:
    """Tell followers when an artist they follow genuinely has a new date on sale."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=window_days)
    tally = {"candidates": 0, "no_announce_date": 0, "notifications": 0,
             "already_sent": 0, "skipped_by_pref": 0, "held_by_artist_cap": 0}

    fresh = (db.query(Event)
               .filter(Event.created_at >= since,
                       Event.headliner_artist_id.isnot(None),
                       Event.status == "scheduled")
               .all())
    tally["candidates"] = len(fresh)
    if not fresh:
        return tally

    artist_ids = {e.headliner_artist_id for e in fresh}
    followers: dict = {}
    for f in (db.query(Follow)
                .filter(Follow.followable_type == "artist",
                        Follow.followable_id.in_(artist_ids)).all()):
        followers.setdefault(f.followable_id, []).append(f.user_id)
    fresh = [e for e in fresh if e.headliner_artist_id in followers]
    if not fresh:
        return tally

    # the honesty gate: only shows the SOURCE says recently went on sale
    announced = _announced_recently(db, [e.id for e in fresh], now)
    tally["no_announce_date"] = len(fresh) - len(announced)
    fresh = [e for e in fresh if e.id in announced]
    if not fresh:
        return tally

    # soonest shows first, so the cap keeps the most urgent dates
    fresh.sort(key=lambda e: (e.starts_at is None, e.starts_at))

    event_ids = [e.id for e in fresh]
    already = {(n.user_id, n.event_id) for n in
               db.query(Notification)
                 .filter(Notification.type == "new_show",
                         Notification.event_id.in_(event_ids)).all()}
    user_ids = {u for lst in followers.values() for u in lst}
    prefs = {p.user_id: p for p in
             db.query(NotificationPref).filter(NotificationPref.user_id.in_(user_ids)).all()}
    artists = {a.id: a for a in db.query(Artist).filter(Artist.id.in_(artist_ids)).all()}

    sent_per_artist: dict = {}
    for ev in fresh:
        for uid in followers.get(ev.headliner_artist_id, []):
            if (uid, ev.id) in already:
                tally["already_sent"] += 1
                continue
            if not _allows(prefs, uid, "new_show"):
                tally["skipped_by_pref"] += 1
                continue
            key = (uid, ev.headliner_artist_id)
            if sent_per_artist.get(key, 0) >= MAX_PER_ARTIST_PER_RUN:
                tally["held_by_artist_cap"] += 1   # not dropped — comes through next run
                continue
            artist = artists.get(ev.headliner_artist_id)
            where = _place(db, ev)
            when = ev.starts_at.astimezone(_tz(ev)).strftime("%a %-d %b %Y") if ev.starts_at else "date TBA"
            db.add(Notification(
                user_id=uid, type="new_show",
                title=f"{artist.name if artist else 'An artist you follow'} — new date on sale",
                body=" · ".join(x for x in (ev.title, where, when) if x),
                event_id=ev.id, artist_id=ev.headliner_artist_id, priority="normal"))
            already.add((uid, ev.id))
            sent_per_artist[key] = sent_per_artist.get(key, 0) + 1
            tally["notifications"] += 1

    if tally["held_by_artist_cap"]:
        print(f"[alerts] {tally['held_by_artist_cap']} new-show alert(s) held back by the "
              f"per-artist cap of {MAX_PER_ARTIST_PER_RUN} — they will send on a later run")
    return tally


def run_alerts() -> dict:
    """Called after each sweep / refresh. Safe to run as often as you like."""
    db: Session = SessionLocal()
    try:
        changes = alerts_for_changes(db)
        new_shows = alerts_for_new_shows(db)
        db.commit()
        summary = {"from_changes": changes, "from_new_shows": new_shows}
        print(f"[alerts] {summary}")
        return summary
    finally:
        db.close()
