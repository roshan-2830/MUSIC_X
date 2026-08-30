"""Sending a notification to a browser.

The phone path (services/push.py) talks to Expo. This one speaks the Web Push protocol directly
to whichever push service the browser nominated — Google's for Chrome, Mozilla's for Firefox,
Apple's for Safari. There is no middleman and no account: the VAPID keypair IS the identity.

WHY THIS EXISTS AT ALL: expo-notifications does not support web, so the browser — the only place
this app is actually used today — had no way to be told anything. Every alert the engine produced
sat in a table waiting for someone to open the app and look, which is not a notification.
"""
import json
from datetime import datetime, timezone

from pywebpush import WebPushException, webpush

from app.core.config import settings

# The browser's push service holds a message for at most this long if the browser is offline.
# A day: a cancellation is still worth reading tomorrow morning, a week-old one is noise.
TTL = 60 * 60 * 24

# Status codes that mean THIS SUBSCRIPTION IS DEAD — the browser was uninstalled, site data was
# cleared, or permission was revoked. The push services' documented way of saying "stop asking".
# Anything else (a 5xx, a timeout) is the service having a bad day and must NOT delete anything.
GONE = (404, 410)


def configured() -> bool:
    return bool(settings.vapid_private_key and settings.vapid_public_key)


def send(sub_token: str, p256dh: str, auth: str, payload: dict) -> tuple[bool, bool]:
    """Send one notification. Returns (delivered, subscription_is_dead).

    The two flags are deliberately separate. "Not delivered" and "never try again" are different
    answers, and conflating them either loses notifications on a transient error or keeps
    hammering an endpoint that will never work again.
    """
    if not configured():
        return False, False
    try:
        webpush(
            subscription_info={"endpoint": sub_token,
                               "keys": {"p256dh": p256dh, "auth": auth}},
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=TTL,
            timeout=10,
        )
        return True, False
    except WebPushException as e:
        code = getattr(getattr(e, "response", None), "status_code", None)
        if code in GONE:
            return False, True
        print(f"[webpush] {code or ''} {str(e)[:120]}")
        return False, False
    except Exception as e:
        print(f"[webpush] {type(e).__name__}: {str(e)[:120]}")
        return False, False
