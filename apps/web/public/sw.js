/* Vippi Leads service worker: Web Push only (ADR-023). No fetch handler, no offline cache. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

/** Only same-origin targets: a push payload must never open a foreign site. */
function sameOriginTarget(raw) {
  try {
    const url = new URL(raw, self.location.origin);
    if (url.origin === self.location.origin) return url;
  } catch {
    // Malformed URL in the payload: fall back to the app root.
  }
  return new URL('/', self.location.origin);
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(data.title || 'Vippi Leads', {
      body: data.body || '',
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: '/favicon.svg',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = sameOriginTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (!client) {
        await self.clients.openWindow(target.href);
        return;
      }
      await client.focus();
      // navigate() works only for windows this worker controls; otherwise open a new one.
      await client.navigate(target.href).catch(() => self.clients.openWindow(target.href));
    })(),
  );
});
