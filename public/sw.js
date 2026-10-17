// Service worker di Morso:
// - notifiche dei timer (su Android il browser le mostra solo tramite un service worker);
// - offline: tiene in memoria i file del sito (pagina, codice, icone, font) per aprirlo senza internet.
//   Non salva MAI le risposte del database o dell'AI (sono su altri indirizzi e non passano da qui).
const VERSION = 'morso-v2';
const SCOPE = new URL(self.registration.scope).pathname; // es. "/" oppure "/Gatu/"
const SHELL = SCOPE; // la pagina principale (index.html)
const MAX_FILES = 200;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.add(new Request(SHELL, { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) => /\/(_expo|assets|icons)\//.test(url.pathname) || /\.(js|css|ttf|woff2?|png|jpg|svg|ico)$/.test(url.pathname);

async function trim(cache) {
  const keys = await cache.keys();
  for (const req of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) await cache.delete(req);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;

  // pagine dell'app: prima internet (versione nuova), senza internet la pagina salvata
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(SHELL, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error())),
    );
    return;
  }

  // file del sito: hanno un nome che cambia a ogni versione, quindi si possono riusare dalla memoria
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches
                .open(VERSION)
                .then((cache) => cache.put(req, copy).then(() => trim(cache)))
                .catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});

// Notifica push dal server (anche ad app chiusa): mi piace, commenti, promemoria, versioni nuove.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  // solo indirizzi interni all'app (es. /planner): mai link verso altri siti
  const path = typeof data.url === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(data.url) ? data.url : '/';
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'Morso').slice(0, 80), {
      body: String(data.body || '').slice(0, 240),
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      renotify: typeof data.tag === 'string',
      icon: `${SCOPE}icons/icon-192.png`,
      badge: `${SCOPE}icons/icon-192.png`,
      data: { url: SCOPE.replace(/\/$/, '') + path },
    }),
  );
});

// Tocco sulla notifica: torna alla scheda di Morso già aperta (sulla pagina giusta) o la apre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if ('focus' in tab) {
          return tab.focus().then((client) => (url && client && 'navigate' in client ? client.navigate(url) : client));
        }
      }
      return url ? self.clients.openWindow(url) : self.clients.openWindow(SCOPE);
    }),
  );
});
