// Pour Melody — service worker
// Purpose:
//   1. Make the app installable (PWA) and offline-tolerant.
//   2. Allow the page to call registration.showNotification() for cross-device
//      "想念" pushes — handled by the page-side Firestore listener, not by FCM.
//
// We do NOT cache HTML aggressively (so Melody/Eddy always get the latest deploy).
// We DO cache the static shell (icon, manifest) so the app launches fast offline.

const SHELL_CACHE = 'pourmelody-shell-v1';
const SHELL_ASSETS = [
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
            .catch((err) => console.warn('[sw] precache failed', err))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Network-first for everything; fall back to cache when offline.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    // Never touch Firebase / Bilibili / cross-origin SDK loads — let them go straight to the network.
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                // Update cache for known shell assets so they're available offline next time.
                if (SHELL_ASSETS.some((p) => req.url.endsWith(p.replace('./', '')))) {
                    const copy = res.clone();
                    caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
                }
                return res;
            })
            .catch(() => caches.match(req))
    );
});

// When the user taps a notification, focus an existing window or open a new one.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winList) => {
            for (const client of winList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow('./');
        })
    );
});
