"""Reminders — the per-show notification volume that the plan card offers.

The card let somebody choose Minimal, Normal or High and described what each would send. Nothing
read the setting, and two of the three things it promised did not exist: there was no scheduled
"your show is in a week", no day-of alert, and no on-sale date in the database. The engine was
purely reactive — it fired when Ticketmaster changed something and never because time had
passed.

WHAT EACH LEVEL MEANS, in one place, so the card's words and the engine's behaviour cannot drift
apart. Cancellations, postponements and date moves are not in this table on purpose: they are
safety alerts, they already have no opt-out, and a quiet setting must not hide a show being
called off.

SET TIMES ARE NOT PROMISED any more. The mockup's High said "on-sale, price drops, set times &
day-of"; Ticketmaster returns doorsTime: null on every event we hold — 0 of 7,700 — so that half
of the sentence described data nobody has. Better to offer three real things than four with one
invented.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.calendar_entry import CalendarEntry
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_pref import NotificationPref

# kind -> which levels want it, and which global preference (if any) can switch it off.
KINDS = {
    "on_sale":        ({"normal", "high"},            "on_sale"),
    "reminder_week":  ({"minimal", "normal", "high"}, "reminder"),
    "reminder_day":   ({"normal", "high"},            "reminder"),
    # Handled by the change-driven engine, listed here so the level rule lives in one file.
    "price_drop":     ({"high"},                      "price_drop"),
}

DEFAULT_LEVEL = "normal"

# The week-before reminder fires anywhere in this window. A window rather than an instant because
# the job runs periodically, not continuously — and the sent-check makes a wide window safe.
WEEK_FROM, WEEK_TO = timedelta(days=6), timedelta(days=8)
# How stale an on-sale moment may be before we stop mentioning it. A show that went on sale three
# weeks ago is not news, and telling somebody it just did would be false.
ONSALE_GRACE = timedelta(days=3)


def wants(level: str | None, kind: str) -> bool:
    """Does this per-show level want this kind of alert?

    TRUE FOR ANYTHING NOT IN THE TABLE, and that default is the important half. The kinds absent
    from KINDS are the safety alerts — cancellation, postponement, a date move — and they have no
    opt-out by design. An earlier version fell through to an empty set, which made this return
    False for every one of them: a quiet reminder setting would have silenced the alert telling
    somebody their concert was cancelled. The table governs volume, never safety.
    """
    entry = KINDS.get(kind)
    if entry is None:
        return True
    return (level or DEFAULT_LEVEL) in entry[0]


def pref_attr(kind: str) -> str | None:
    return KINDS.get(kind, (set(), None))[1]


def _allowed_globally(prefs: dict, uid, kind: str) -> bool:
    """The global switches still apply. A per-show level says how much about THIS show; the
    account-wide preference says whether that kind of alert is wanted at all."""
    attr = pref_attr(kind)
    if attr is None:
        return True
    pref = prefs.get(uid)
    return True if pref is None else bool(getattr(pref, attr, True))


def _tz(ev: Event):
    try:
        return ZoneInfo(ev.timezone) if ev.timezone else timezone.utc
    except Exception:
        return timezone.utc


def _local_date(dt, ev: Event):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_tz(ev)).date()


def _due(entry: CalendarEntry, ev: Event, now: datetime) -> list:
    """Which reminders this saved show has earned, before levels or preferences are consulted."""
    out = []
    if ev.starts_at is None:
        return out
    starts = ev.starts_at if ev.starts_at.tzinfo else ev.starts_at.replace(tzinfo=timezone.utc)

    # ON SALE: it has opened, and it opened AFTER they saved the show. That second half is what
    # makes this a piece of news rather than a fact about the past — and it is also what stops
    # the first run of this job telling everybody about every show they already bought into.
    if ev.onsale_at is not None:
        onsale = ev.onsale_at if ev.onsale_at.tzinfo else ev.onsale_at.replace(tzinfo=timezone.utc)
        saved = entry.created_at
        if saved is not None and saved.tzinfo is None:
            saved = saved.replace(tzinfo=timezone.utc)
        if (onsale <= now < starts
                and now - onsale <= ONSALE_GRACE
                and saved is not None and saved < onsale):
            out.append("on_sale")

    left = starts - now
    if WEEK_FROM <= left <= WEEK_TO:
        out.append("reminder_week")
    # DAY OF, on the venue's clock rather than ours. A show at 21:00 in Madrid is "today" for
    # somebody in Delhi only by Madrid's calendar, and a day-of reminder that arrives on the
    # wrong day is worse than none.
    if timedelta(0) < left and _local_date(starts, ev) == _local_date(now, ev):
        out.append("reminder_day")
    return out


def _wording(kind: str, ev: Event, venue_name: str | None) -> tuple:
    where = f" · {venue_name}" if venue_name else ""
    title = ev.title or "your show"
    if kind == "on_sale":
        return ("Tickets are on sale", f"{title}{where}")
    if kind == "reminder_week":
        return ("One week to go", f"{title}{where}")
    local = None
    try:
        local = ev.starts_at.astimezone(_tz(ev)).strftime("%H:%M")
    except Exception:
        pass
    return ("Tonight", f"{title}{where}" + (f" · starts {local}" if local else ""))


def run_reminders(limit: int | None = None) -> dict:
    """Send the reminders that are due, once each.

    IDEMPOTENT WITHOUT A NEW TABLE. Each kind is its own notification type, so a notification
    already existing for this person, this show and this kind IS the record that it was sent.
    That means the job can run as often as it likes and a wide firing window costs nothing.
    """
    from app.db.session import SessionLocal

    db: Session = SessionLocal()
    now = datetime.now(timezone.utc)
    made = {"on_sale": 0, "reminder_week": 0, "reminder_day": 0}
    skipped_level = skipped_pref = already = 0
    try:
        rows = (db.query(CalendarEntry, Event)
                  .join(Event, Event.id == CalendarEntry.event_id)
                  .filter(CalendarEntry.is_suggestion.is_(False),
                          Event.merged_into.is_(None),
                          Event.retired_at.is_(None),
                          Event.starts_at > now,
                          # TWO reasons a saved show is worth loading, and the second was missing:
                          # it is nearly here, OR it has just gone on sale. An on-sale moment has
                          # nothing to do with how far away the show is — tickets for a festival
                          # next summer go on sale today — and filtering on the date alone meant
                          # on-sale reminders could never fire for anything more than eight days
                          # out, which is almost all of them.
                          or_(Event.starts_at <= now + WEEK_TO,
                              Event.onsale_at >= now - ONSALE_GRACE))
                  .limit(limit or 5000).all())
        if not rows:
            return {"considered": 0, **made}

        uids = {e.user_id for e, _ in rows}
        prefs = {p.user_id: p for p in
                 db.query(NotificationPref).filter(NotificationPref.user_id.in_(uids)).all()}
        # One query for everything already sent, rather than one per candidate.
        pairs = {(n.user_id, n.event_id, n.type) for n in
                 db.query(Notification).filter(
                     Notification.user_id.in_(uids),
                     Notification.type.in_(tuple(made.keys()))).all()}

        venues = {}
        vids = {ev.venue_id for _, ev in rows if ev.venue_id}
        if vids:
            from app.models.venue import Venue
            venues = {v.id: v.name for v in db.query(Venue).filter(Venue.id.in_(vids)).all()}

        for entry, ev in rows:
            for kind in _due(entry, ev, now):
                if not wants(entry.reminder_level, kind):
                    skipped_level += 1
                    continue
                if not _allowed_globally(prefs, entry.user_id, kind):
                    skipped_pref += 1
                    continue
                if (entry.user_id, ev.id, kind) in pairs:
                    already += 1
                    continue
                title, body = _wording(kind, ev, venues.get(ev.venue_id))
                db.add(Notification(
                    user_id=entry.user_id, type=kind, title=title, body=body,
                    event_id=ev.id, artist_id=ev.headliner_artist_id,
                    # A reminder is not an emergency. Cancellations are high; these are the app
                    # being useful on a normal day.
                    priority="normal"))
                pairs.add((entry.user_id, ev.id, kind))
                made[kind] += 1
        db.commit()
    finally:
        db.close()
    out = {"considered": len(rows) if 'rows' in dir() else 0, **made,
           "skipped_by_level": skipped_level, "skipped_by_pref": skipped_pref,
           "already_sent": already}
    print(f"[reminders] {out}")
    return out
