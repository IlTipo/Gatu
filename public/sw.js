// Service worker minimo: serve solo a mostrare le notifiche dei timer
// (su Android il browser le mostra solo tramite un service worker). Non salva nulla in cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Tocco sulla notifica: torna alla scheda di Morso già aperta (o la apre).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if ('focus' in tab) return tab.focus();
      }
      return url ? self.clients.openWindow(url) : undefined;
    }),
  );
});
