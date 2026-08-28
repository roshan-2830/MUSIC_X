"""The notification inbox.

Step 4 writes rows; this is how the phone reads them. Nothing here creates a
notification — the alert policy lives in one place (services/alerts.py) so it cannot
drift between endpoints.

Everything is scoped to the signed-in user by `user_id` on every query, so one
account can never read another's inbox.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.db.session import get_db
from app.models.artist import Artist
from app.models.city import City
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_pref import NotificationPref
from app.models.push_token import PushToken
from app.models.venue import Venue
from app.schemas.notification import (
    NotificationOut, NotificationPrefsOut, NotificationPrefsUpdate, UnreadCount,
)

router = APIRouter(prefix="/me", tags=["notifications"])

# The alerts a red dot is for: something you planned around has moved.
URGENT_TYPES = ("cancellation", "postponed", "date_change")

PREF_FIELDS = ("on_sale", "new_show", "reminder", "price_drop",
               "bucket_list_live", "trip_cancellation", "push_enabled", "email_enabled")


def _prefs_row(db: Session, uid: uuid.UUID) -> NotificationPref:
    """One row per user, created on first read. Absent = the table's defaults."""
    row = db.get(NotificationPref, uid)
    if row is None:
        row = NotificationPref(user_id=uid)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    limit: int = Query(50, le=200),
    unread_only: bool = Query(False),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Newest first. Carries enough event/artist detail to draw each row in one pass."""
    uid = uuid.UUID(user_id)
    q = db.query(Notification).filter(Notification.user_id == uid)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    rows = q.order_by(Notification.created_at.desc()).limit(limit).all()
    if not rows:
        return []

    # one query per related table, not per row
    event_ids = {r.event_id for r in rows if r.event_id}
    events = {e.id: e for e in db.query(Event).filter(Event.id.in_(event_ids)).all()} if event_ids else {}
    venue_ids = {e.venue_id for e in events.values() if e.venue_id}
    venues = {v.id: v for v in db.query(Venue).filter(Venue.id.in_(venue_ids)).all()} if venue_ids else {}
    city_ids = {v.city_id for v in venues.values() if v.city_id}
    cities = {c.id: c for c in db.query(City).filter(City.id.in_(city_ids)).all()} if city_ids else {}
    artist_ids = {r.artist_id for r in rows if r.artist_id}
    artists = {a.id: a for a in db.query(Artist).filter(Artist.id.in_(artist_ids)).all()} if artist_ids else {}

    out = []
    for r in rows:
        ev = events.get(r.event_id) if r.event_id else None
        venue = venues.get(ev.venue_id) if ev and ev.venue_id else None
        city = cities.get(venue.city_id) if venue and venue.city_id else None
        artist = artists.get(r.artist_id) if r.artist_id else None
        out.append(NotificationOut(
            id=r.id, type=r.type, title=r.title, body=r.body,
            priority=r.priority, is_read=r.is_read, created_at=r.created_at,
            event_id=r.event_id, artist_id=r.artist_id,
            event_title=ev.title if ev else None,
            event_starts_at=ev.starts_at if ev else None,
            event_city=city.name if city else None,
            artist_name=artist.name if artist else None,
        ))
    return out


@router.get("/notifications/unread-count", response_model=UnreadCount)
def unread_count(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Drives the badge on the bell. `urgent` is the subset worth a red dot."""
    uid = uuid.UUID(user_id)
    base = db.query(Notification).filter(Notification.user_id == uid,
                                        Notification.is_read.is_(False))
    return UnreadCount(
        unread=base.count(),
        urgent=base.filter(Notification.type.in_(URGENT_TYPES)).count(),
    )


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_read(notification_id: uuid.UUID,
              user_id: str = Depends(get_current_user_id),
              db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    row = db.get(Notification, notification_id)
    if row is None or row.user_id != uid:
        # same answer either way — never reveal that someone else's id exists
        raise HTTPException(status_code=404, detail="Notification not found")
    if not row.is_read:
        row.is_read = True
        db.commit()


@router.post("/notifications/read-all", status_code=204)
def mark_all_read(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    uid = uuid.UUID(user_id)
    (db.query(Notification)
       .filter(Notification.user_id == uid, Notification.is_read.is_(False))
       .update({Notification.is_read: True}, synchronize_session=False))
    db.commit()


@router.get("/notification-prefs", response_model=NotificationPrefsOut)
def get_prefs(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    row = _prefs_row(db, uuid.UUID(user_id))
    return NotificationPrefsOut(**{f: getattr(row, f) for f in PREF_FIELDS})


@router.put("/notification-prefs", response_model=NotificationPrefsOut)
def update_prefs(body: NotificationPrefsUpdate,
                 user_id: str = Depends(get_current_user_id),
                 db: Session = Depends(get_db)):
    """Only the toggles the client actually sent are changed. There is no switch for
    cancellations, postponements or date changes — those always send."""
    row = _prefs_row(db, uuid.UUID(user_id))
    for field, value in body.model_dump(exclude_unset=True).items():
        if field in PREF_FIELDS and value is not None:
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return NotificationPrefsOut(**{f: getattr(row, f) for f in PREF_FIELDS})


# ---------------------------------------------------------------- device registration


class PushTokenIn(BaseModel):
    token: str
    platform: str | None = None


@router.post("/push-token", status_code=204)
def register_push_token(body: PushTokenIn,
                        user_id: str = Depends(get_current_user_id),
                        db: Session = Depends(get_db)):
    """Remember that this phone can be reached.

    Called on every launch, not just the first, because Expo may rotate a token at any time
    and a stale one fails silently — the person simply stops getting notifications and has no
    way to know. Re-registering is cheap; missing a rotation is not.

    Idempotent, and the row's OWNER is updated rather than a second row added: if two accounts
    sign in on one phone, only the one currently signed in should be notified on it.
    """
    uid = uuid.UUID(user_id)
    token = (body.token or "").strip()
    # Expo's own format. Rejecting anything else here means a malformed value can never sit in
    # the table failing on every delivery pass.
    if not (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")):
        raise HTTPException(status_code=422, detail="Not an Expo push token")

    row = db.query(PushToken).filter(PushToken.token == token).first()
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(PushToken(token=token, user_id=uid,
                         platform=(body.platform or None), last_seen_at=now))
    else:
        row.user_id = uid
        row.platform = body.platform or row.platform
        row.last_seen_at = now
    db.commit()


@router.delete("/push-token", status_code=204)
def unregister_push_token(token: str = Query(...),
                          user_id: str = Depends(get_current_user_id),
                          db: Session = Depends(get_db)):
    """Stop sending to this phone — sign-out, or permission withdrawn in system settings.

    Scoped to the caller so one account cannot silence another's device.
    """
    uid = uuid.UUID(user_id)
    (db.query(PushToken)
       .filter(PushToken.token == token.strip(), PushToken.user_id == uid)
       .delete(synchronize_session=False))
    db.commit()
