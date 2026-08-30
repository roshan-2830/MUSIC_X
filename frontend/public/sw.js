/* Music X service worker — the part of the app that runs when the app is not open.
 *
 * This is the whole point of browser notifications: a cancellation reaches you while you are
 * reading email, not next time you happen to open the tab. The browser keeps this file alive
 * independently of any page, wakes it when a push arrives, and lets it draw a notification.
 *
 * Kept deliberately tiny. It ships separately from the app bundle and updates on its own
 * schedule, so anything clever in here is a second version of the app to keep in step.
 */

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { /* not our payload */ }

  const title = d.title || 'Music X';
  const options = {
    body: d.body || '',
    // The tab icon doubles as the notification icon; there is no separate asset to keep in sync.
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    // Carried through to the click handler so a tap can open the right show.
    data: { event_id: d.event_id || null, notification_id: d.notification_id || null },
    // One notification per show REPLACES the previous one rather than stacking. Three
    // reminders about the same concert is how an app teaches people to switch it off.
    tag: d.event_id ? 'event-' + d.event_id : undefined,
    // Cancellations and date moves are the ones worth interrupting for; the rest can wait
    // quietly until the screen is next looked at.
    requireInteraction: ['cancellation', 'postponed', 'date_change'].includes(d.type),
  };
  // waitUntil, or the worker may be killed before the notification is drawn.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.event_id;
  // Deep link if we know the show, otherwise just the app.
  const url = id ? `/?event=${id}` : '/';
  event.waitUntil(
    // FOCUS AN OPEN TAB rather than opening a second one. Someone with the app already open in
    // another window should be taken to it, not given a duplicate.
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(self.location.origin) && 'focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// Take over straight away rather than waiting for every tab to close, so a fixed worker
// actually reaches people instead of sitting behind a tab someone left open for a week.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
