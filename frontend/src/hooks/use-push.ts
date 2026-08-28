/**
 * Registering this phone so notifications can reach it.
 *
 * Everything the backend produces already lands in the bell. This is the part that makes a
 * cancellation reach somebody who is not currently looking at the app — which, for a
 * cancellation, is the only version of it that matters.
 *
 * Three facts shape this file, all confirmed in Expo's SDK 57 documentation rather than assumed:
 *   • Web has no push here at all. The browser build must not ask.
 *   • Remote push does not work in Expo Go on Android from SDK 53 onward — it needs a
 *     development build. Asking anyway would show a permission dialog and then never deliver,
 *     which is worse than not asking.
 *   • A token can be rotated by the OS at any time, so this runs on every launch, not once.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from '@/lib/api';

// From app.json's extra.eas.projectId. getExpoPushTokenAsync needs it explicitly in SDK 57.
const PROJECT_ID = '8e964550-c069-4932-92cd-a44a3925a368';

// How a notification behaves when it arrives while the app is OPEN. Without this the banner is
// suppressed in the foreground and a person watching the screen sees nothing happen.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export type PushState =
  | 'unsupported'      // web, or a simulator — no device to send to
  | 'needs-dev-build'  // Expo Go on Android: permission would be granted and nothing delivered
  | 'denied'
  | 'registered'
  | 'error';

async function setupAndroidChannel() {
  // Android will not show a heads-up notification without a channel that has high importance.
  // The channel id must match what the sender puts in `channelId` — ours sends 'default'.
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#E8FF47',
  });
}

/** Ask for permission, get the Expo token, tell the backend. Returns what happened. */
export async function enablePush(): Promise<{ state: PushState; token?: string }> {
  if (Platform.OS === 'web') return { state: 'unsupported' };
  // A simulator has no push service to register with, so the call fails rather than returning
  // nothing — better to say so than to surface an error the person cannot act on.
  if (!Device.isDevice) return { state: 'unsupported' };

  const inExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
  if (inExpoGo && Platform.OS === 'android') return { state: 'needs-dev-build' };

  try {
    await setupAndroidChannel();
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = asked.granted;
    }
    if (!granted) return { state: 'denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    await registerPushToken(token, Platform.OS);
    return { state: 'registered', token };
  } catch (e) {
    console.log('[push] enable failed', e);
    return { state: 'error' };
  }
}

/** Sign-out, or "stop notifying this phone". Forgets the token on the server. */
export async function disablePush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
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
    // Tapped while the app was running, and tapped from cold — both routes matter, and the
    // cold one is the common case for a day-of reminder.
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const id = (res.notification.request.content.data as any)?.event_id;
      if (id) open.current?.(String(id));
    });
    Notifications.getLastNotificationResponseAsync().then((res) => {
      const id = (res?.notification.request.content.data as any)?.event_id;
      if (id) open.current?.(String(id));
    });
    return () => sub.remove();
  }, []);
}
