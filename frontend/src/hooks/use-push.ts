/**
 * Registering this phone so notifications can reach it.
 *
 * Everything the backend produces already lands in the bell. This is the part that makes a
 * cancellation reach somebody who is not currently looking at the app — which, for a
 * cancellation, is the only version of it that matters.
 *
 * NOTHING NATIVE IS IMPORTED AT THE TOP OF THIS FILE, and that is the whole shape of it.
 * expo-notifications is a native module: it exists only if it was compiled into the binary
 * running on the phone. A development build made before the package was installed does not have
 * it, and a plain `import` of it then throws while the module is still LOADING — before any
 * guard inside a function can run. Because this file is reached from lib/auth, which is reached
 * from the root layout, that throw took the entire app down with "Cannot read property
 * 'ErrorBoundary' of undefined". A feature that is unavailable must degrade to nothing, never to
 * a blank screen.
 *
 * Two more facts, from Expo's SDK 57 documentation rather than assumed:
 *   • Web has no push here at all — hence use-push.web.ts, which Metro prefers.
 *   • Remote push does not work in Expo Go from SDK 53 on. It needs a development build, which
 *     is the same rebuild that makes the require below start succeeding.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from '@/lib/api';

// From app.json's extra.eas.projectId. getExpoPushTokenAsync needs it explicitly in SDK 57.
const PROJECT_ID = '8e964550-c069-4932-92cd-a44a3925a368';

export type PushState =
  | 'unsupported'      // web, or a simulator — no device to send to
  | 'needs-dev-build'  // the native module is not in this binary, or this is Expo Go
  | 'not-asked'      // never been asked — one tap away, NOT the same as refused
  | 'denied'
  | 'registered'
  | 'error';

type NotificationsModule = typeof import('expo-notifications');

// EVERY native module expo-notifications demands the moment it is required. The package root
// re-exports two dozen submodules and each calls requireNativeModule at ITS OWN module scope, so
// requiring the root evaluates all of them and throws on the first one missing. Probing only the
// one we care about would let the probe pass and the require throw anyway.
const NEEDED = [
  'ExpoPushTokenManager',
  'ExpoNotificationsEmitter',
  'ExpoNotificationsHandlerModule',
  'ExpoNotificationPresenter',
  'ExpoNotificationScheduler',
  'ExpoNotificationChannelManager',
  'ExpoTopicSubscriptionModule',
  'ExpoBadgeModule',
];

let mod: NotificationsModule | null | undefined;   // undefined = not tried yet, null = absent
let handlerSet = false;

/** The native module, or null if this binary does not have it. Never throws, and never asks
 *  twice.
 *
 *  ASKED BEFORE REQUIRING, not by catching the failure. A try/catch around the require does keep
 *  the app alive, but Metro hands a failed module evaluation to the error reporter BEFORE our
 *  catch ever sees it — so the red "Cannot find native module 'ExpoPushTokenManager'" kept
 *  appearing in the terminal even though the code had already handled it and moved on. Worse,
 *  Metro swallows the throw and returns undefined, so the failure was never cached and every
 *  call tried again and logged again.
 *
 *  requireOptionalNativeModule returns null instead of throwing, so the doomed require is never
 *  attempted and there is nothing to report. */
function notifications(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  const missing = NEEDED.filter((name) => !requireOptionalNativeModule(name));
  if (missing.length) {
    mod = null;
    console.log(`[push] not in this build — missing ${missing.join(', ')}`);
    return mod;
  }
  try {
    mod = (require('expo-notifications') as NotificationsModule) ?? null;
  } catch (e) {
    // Should be unreachable now, but a cached null still beats retrying on every launch.
    mod = null;
    console.log('[push] expo-notifications failed to load', e);
  }
  return mod;
}

/** How a notification behaves when it arrives while the app is OPEN. Without this the banner is
 *  suppressed in the foreground and somebody watching the screen sees nothing happen. */
function ensureHandler(N: NotificationsModule) {
  if (handlerSet) return;
  handlerSet = true;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function setupAndroidChannel(N: NotificationsModule) {
  // Android will not show a heads-up notification without a channel of high importance. The id
  // must match what the sender puts in `channelId` — ours sends 'default'.
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync('default', {
    name: 'Alerts',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#E8FF47',
  });
}

/** Ask for permission, get the Expo token, tell the backend. Returns what happened. */
export async function enablePush(): Promise<{ state: PushState; token?: string }> {
  if (Platform.OS === 'web') return { state: 'unsupported' };
  // A simulator has no push service to register with, so the call fails rather than returning
  // nothing — better to say so than to surface an error nobody can act on.
  if (!Device.isDevice) return { state: 'unsupported' };

  const N = notifications();
  if (!N) return { state: 'needs-dev-build' };
  const inExpoGo =
    Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
  if (inExpoGo) return { state: 'needs-dev-build' };

  try {
    ensureHandler(N);
    await setupAndroidChannel(N);
    const existing = await N.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await N.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = asked.granted;
    }
    if (!granted) return { state: 'denied' };

    const { data: token } = await N.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    await registerPushToken(token, Platform.OS);
    return { state: 'registered', token };
  } catch (e) {
    console.log('[push] enable failed', e);
    return { state: 'error' };
  }
}

/** What this device's notification setup currently is — asks nothing, changes nothing. */
export async function pushStatus(): Promise<PushState> {
  if (Platform.OS === 'web') return 'unsupported';
  if (!Device.isDevice) return 'unsupported';
  const N = notifications();
  if (!N) return 'needs-dev-build';
  try {
    const p = await N.getPermissionsAsync();
    return p.granted ? 'registered' : (p.canAskAgain ? 'not-asked' : 'denied');
  } catch {
    return 'error';
  }
}


/** Launch-time refresh. On native the permission flow is a system dialog that is fine to
 *  trigger on mount, so this is simply enablePush — the split exists for web, where asking on
 *  page load is punished by the browser. Same name so callers need not care which they got. */
export async function syncPush(): Promise<PushState> {
  return (await enablePush()).state;
}


/** Sign-out, or "stop notifying this phone". Forgets the token on the server. */
export async function disablePush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const N = notifications();
  if (!N) return;
  try {
    const { data: token } = await N.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    await unregisterPushToken(token);
  } catch (e) {
    console.log('[push] disable failed', e);
  }
}

/**
 * Register on launch, and route a tap to the show it is about.
 *
 * `onOpenEvent` receives the event id carried in the notification's `data`. A reminder that
 * opens the home screen has made the person do the finding themselves.
 */
export function usePush(onOpenEvent?: (eventId: string) => void) {
  const once = useRef(false);
  const open = useRef(onOpenEvent);
  open.current = onOpenEvent;

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    enablePush().then((r) => console.log('[push]', r.state));
  }, []);

  useEffect(() => {
    const N = notifications();
    if (!N) return;
    ensureHandler(N);
    // Tapped while the app was running, and tapped from cold — both matter, and the cold one is
    // the common case for a day-of reminder.
    const sub = N.addNotificationResponseReceivedListener((res) => {
      const id = (res.notification.request.content.data as any)?.event_id;
      if (id) open.current?.(String(id));
    });
    N.getLastNotificationResponseAsync().then((res) => {
      const id = (res?.notification.request.content.data as any)?.event_id;
      if (id) open.current?.(String(id));
    });
    return () => sub.remove();
  }, []);
}
