/**
 * Browser notifications.
 *
 * The native hook (use-push.ts) talks to Expo, which has no web support at all — so on web this
 * file is not a stub any more, it is the real implementation, using the browser's own Push API.
 * Metro picks it over the .ts by platform.
 *
 * Three pieces have to line up: a SERVICE WORKER (public/sw.js) that the browser can wake when
 * the app is closed, PERMISSION from the person, and a SUBSCRIPTION registered with our server.
 * Miss any one and notifications silently never arrive, which is why each step reports what
 * happened rather than returning a bare boolean.
 */
import { useEffect, useRef } from 'react';

import { getPushPublicKey, registerWebPush } from '@/lib/api';

export type PushState =
  | 'unsupported'      // an old browser, or an insecure origin
  | 'needs-dev-build'  // never on web; kept so callers can share one type with native
  | 'denied'
  | 'registered'
  | 'error';

/** The VAPID key travels as url-safe base64 and subscribe() wants raw bytes. */
function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  // Built on an explicit ArrayBuffer rather than Uint8Array.from: subscribe() will not accept a
  // view whose buffer might be a SharedArrayBuffer, and that is what the looser type implies.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function supported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** What this device's notification setup currently is — asks nothing, changes nothing. Used to
 *  decide whether to offer the banner. */
export async function pushStatus(): Promise<PushState> {
  if (!supported() || !window.isSecureContext) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'error';   // askable — the banner shows
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'registered' : 'error';
  } catch {
    return 'error';
  }
}


/**
 * Called on every launch. Re-subscribes ONLY if permission was already granted, and never
 * shows a prompt.
 *
 * A subscription can lapse on its own — the browser rotates it, site data is cleared, the
 * server's key pair changes — and when it does, notifications stop with no error anywhere and
 * nothing to click. Re-registering silently on each launch is what makes that self-healing.
 */
export async function syncPush(): Promise<PushState> {
  if (!supported() || !window.isSecureContext) return 'unsupported';
  if (Notification.permission !== 'granted') return 'denied';
  return (await enablePush()).state;
}

/**
 * Ask permission, subscribe, tell the server.
 *
 * MUST BE CALLED FROM A TAP. Safari refuses a permission request that is not tied to a user
 * gesture, and Chrome quietly penalises sites that ask on page load — ask at the wrong moment
 * and the person blocks notifications permanently, which no code can undo.
 */
export async function enablePush(): Promise<{ state: PushState; token?: string }> {
  // Push requires a secure context. localhost counts as secure; a plain-http LAN address does
  // not, which is worth knowing before blaming the code.
  if (!supported() || !window.isSecureContext) return { state: 'unsupported' };

  try {
    const { key, enabled } = await getPushPublicKey();
    if (!enabled || !key) {
      console.log('[push] server has no VAPID keys configured');
      return { state: 'error' };
    }

    // Asking only when it can succeed. A permission prompt the person has already refused
    // cannot be re-shown by us, and re-asking is what makes people block a site for good.
    if (Notification.permission === 'denied') return { state: 'denied' };
    if (Notification.permission === 'default') {
      if ((await Notification.requestPermission()) !== 'granted') return { state: 'denied' };
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // An existing subscription is reused unless it was made with a DIFFERENT key — which
    // happens if the server's pair was regenerated. Sending to a subscription signed by an old
    // key fails silently forever, so the mismatch is resubscribed rather than kept.
    let sub = await reg.pushManager.getSubscription();
    const wanted = toBytes(key);
    if (sub) {
      const current = new Uint8Array(sub.options?.applicationServerKey ?? new ArrayBuffer(0));
      const same = current.length === wanted.length && current.every((b, i) => b === wanted[i]);
      if (!same) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,          // required by Chrome; we always show something
        applicationServerKey: wanted,
      });
    }

    await registerWebPush(sub.toJSON());
    return { state: 'registered', token: sub.endpoint };
  } catch (e) {
    console.log('[push] web enable failed', e);
    return { state: 'error' };
  }
}

export async function disablePush(): Promise<void> {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const { unregisterPushToken } = await import('@/lib/api');
    await unregisterPushToken(sub.endpoint);
    await sub.unsubscribe();
  } catch (e) {
    console.log('[push] web disable failed', e);
  }
}

/**
 * Subscribe on launch, and open the right show when a notification is clicked.
 *
 * The click itself is handled by the service worker, which navigates to /?event=<id>. This
 * reads that back off the URL — the page may have been opened cold by the click, so there is
 * no in-memory listener that could have caught it.
 */
export function usePush(onOpenEvent?: (eventId: string) => void) {
  const once = useRef(false);
  const open = useRef(onOpenEvent);
  open.current = onOpenEvent;

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    // sync, not enable: launching the app must never itself pop a permission prompt.
    syncPush().then((s) => console.log('[push]', s));
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('event');
    if (!id) return;
    open.current?.(id);
    // Cleared so a refresh does not reopen it, and the address bar stays honest.
    const url = new URL(window.location.href);
    url.searchParams.delete('event');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);
}
