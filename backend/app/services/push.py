"""Delivering notifications to devices, through Expo's push service.

Everything the app has ever produced — cancellations, date moves, invitations, reminders — was
written to a table and waited for somebody to open the app and tap the bell. A day-of reminder
you have to already be in the app to discover is not a reminder.

DELIVERY IS A SEPARATE PASS FROM CREATION, and that is the point of `pushed_at`. Four different
places create notifications (the change engine, the reminder pass, invitations, "X is coming"),
and asking each of them to also send one means the fifth will forget. One job asks "what has not
been delivered" — a question nothing can forget to answer.

Contract confirmed against Expo's own documentation: POST https://exp.host/--/api/v2/push/send,
up to 100 messages per request, response {"data": [{"status": "ok"|"error", ...}]} in the same
order as the messages sent.
"""
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notification import Notification
from app.models.notification_pref import NotificationPref
from app.models.push_token import PushToken

SEND_URL = "https://exp.host/--/api/v2/push/send"
# Expo's documented ceiling. Not a guess and not a tuning knob.
BATCH = 100
TIMEOUT = 20.0
# Anything older than this is not delivered at all. A cancellation notice from last week helps
# nobody and reads as a bug; the bell still has it either way.
MAX_AGE_HOURS = 48

# Which of our types deserve to wake a phone rather than wait in the bell. A price drop is
# useful; it is not worth a buzz at 3am, and the person who chose "High" asked for it in the app,
# not on their lock screen.
HIGH_PRIORITY = {"cancellation", "postponed", "date_change", "reminder_day"}


def _headers() -> dict:
    h = {
        "accept": "application/json",
        "accept-encoding": "gzip, deflate",
        "content-type": "application/json",
    }
    # Optional, and only meaningful once push security is switched on in the EAS dashboard.
    # Without it Expo accepts unauthenticated sends, which means anybody holding one of our
    # tokens could send to it — so this should be set before launch.
    token = getattr(settings, "expo_access_token", None)
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _message(n: Notification, token: str) -> dict:
    return {
        "to": token,
        "title": n.title or "Music X",
        "body": (n.body or "")[:600],
        # What the app needs to open the right screen when somebody taps it. Kept small: Expo
        # caps the whole payload at about 4KB.
        "data": {
            "notification_id": str(n.id),
            "type": n.type,
            "event_id": str(n.event_id) if n.event_id else None,
        },
        "sound": "default",
        "priority": "high" if n.type in HIGH_PRIORITY else "normal",
        "channelId": "default",
    }


def _send_batch(messages: list) -> list:
    """Expo's per-message results, in the order sent. [] if the request itself failed."""
    try:
        r = httpx.post(SEND_URL, headers=_headers(), json=messages, timeout=TIMEOUT)
    except Exception as e:
        print(f"[push] unreachable: {type(e).__name__}")
        return []
    if r.status_code != 200:
        print(f"[push] HTTP {r.status_code} {r.text[:160]}")
        return []
    try:
        return (r.json() or {}).get("data") or []
    except Exception:
        print("[push] non-JSON response")
        return []


def deliver_pending(limit: int = 500) -> dict:
    """Send every notification that has not been delivered yet.

    A notification with no device to send to is still STAMPED. Otherwise it would be
    reconsidered on every run forever — and the moment that person registers a phone, months of
    backlog would arrive at once. The bell already holds it; delivery is a moment, not a debt.
    """
    from app.db.session import SessionLocal

    db: Session = SessionLocal()
    now = datetime.now(timezone.utc)
    out = {"considered": 0, "sent": 0, "no_device": 0, "muted": 0, "too_old": 0,
           "failed": 0, "dropped_tokens": 0}
    try:
        pending = (db.query(Notification)
                     .filter(Notification.pushed_at.is_(None))
                     .order_by(Notification.created_at.asc())
                     .limit(limit).all())
        out["considered"] = len(pending)
        if not pending:
            return out

        uids = {n.user_id for n in pending}
        tokens: dict = {}
        for t in db.query(PushToken).filter(PushToken.user_id.in_(uids)).all():
            tokens.setdefault(t.user_id, []).append(t)
        prefs = {p.user_id: p for p in
                 db.query(NotificationPref).filter(NotificationPref.user_id.in_(uids)).all()}

        jobs = []          # (notification, token_row)
        for n in pending:
            age_h = (now - (n.created_at.replace(tzinfo=timezone.utc)
                            if n.created_at.tzinfo is None else n.created_at)).total_seconds() / 3600
            if age_h > MAX_AGE_HOURS:
                n.pushed_at = now
                out["too_old"] += 1
                continue
            pref = prefs.get(n.user_id)
            if pref is not None and not pref.push_enabled:
                # Push turned off account-wide. Stamped, because it will never be sent — the
                # bell is where they asked to read these.
                n.pushed_at = now
                out["muted"] += 1
                continue
            devices = tokens.get(n.user_id) or []
            if not devices:
                n.pushed_at = now
                out["no_device"] += 1
                continue
            for t in devices:
                jobs.append((n, t))
        db.commit()

        # Token rows Expo has told us are gone. Collected across the whole pass and deleted at
        # the END of it, not inside the chunk that discovered them. Deleting mid-pass was a real
        # bug: one device row is shared by every notification waiting for that person, so a
        # token dropped in chunk 1 was still referenced by chunk 2, and touching the deleted row
        # raised ObjectDeletedError and aborted the pass. Found by a chunking test, not by luck.
        dead: set = set()

        for i in range(0, len(jobs), BATCH):
            chunk = jobs[i:i + BATCH]
            # The one place this job talks to two networks at once: Expo over HTTP, and Postgres
            # to stamp what got through. If the database connection dies while we are waiting on
            # Expo — a laptop closing its lid mid-send — the pass must end, not raise out of the
            # scheduler. Nothing sent is stamped, so the next run picks up exactly where this
            # one stopped.
            try:
                _deliver_chunk(db, chunk, now, out, dead)
            except Exception as e:
                print(f"[push] pass aborted: {type(e).__name__}: {e}")
                db.rollback()
                out["failed"] += len(jobs) - i
                break
            if i + BATCH < len(jobs):
                time.sleep(0.2)          # Expo asks for restraint; this is well inside it

        if dead:
            db.query(PushToken).filter(PushToken.id.in_(dead)).delete(
                synchronize_session=False)
            out["dropped_tokens"] = len(dead)
            db.commit()
    finally:
        db.close()
    if out["considered"]:
        print(f"[push] {out}")
    return out


def _deliver_chunk(db: Session, chunk: list, now: datetime, out: dict, dead: set) -> None:
    """One request to Expo, and the bookkeeping for its answers."""
    # A token an earlier chunk already found to be gone. Its notification is stamped rather than
    # retried forever: the only route to that phone no longer exists, and the bell still has it.
    for n, t in chunk:
        if t.id in dead:
            n.pushed_at = now
    live = [(n, t) for n, t in chunk if t.id not in dead]
    if not live:
        db.commit()
        return

    results = _send_batch([_message(n, t.token) for n, t in live])
    if not results:
        # Expo unreachable, or it refused the whole request. NOTHING is stamped, so the next run
        # sends this chunk again. A notification silently lost is worse than one delayed by two
        # minutes.
        out["failed"] += len(live)
        return

    for (n, t), res in zip(live, results):
        if (res or {}).get("status") == "ok":
            n.pushed_at = now
            out["sent"] += 1
            continue
        detail = ((res or {}).get("details") or {}).get("error")
        if detail == "DeviceNotRegistered":
            # Expo's own instruction is to stop sending to it. The app was deleted or the token
            # rotated; keeping it means failing on every future send, forever.
            dead.add(t.id)
            n.pushed_at = now
        else:
            out["failed"] += 1
            print(f"[push] {detail or (res or {}).get('message')}")
    db.commit()
