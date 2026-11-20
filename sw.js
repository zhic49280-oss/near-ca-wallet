const CACHE_NAME = 'nexus-wallet-v6.8';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css?v=6.8',
  './assets/favicon.png?v=6.8',
  './assets/nexus-logo-192.png?v=6.8',
  './bip39-wordlist.js?v=6.8',
  './src/crypto-engine.js?v=6.8',
  './src/token-registry.js?v=6.8',
  './src/near-intents.js?v=6.8',
  './src/chain-contracts.js?v=6.8',
  './src/limit-orders.js?v=6.8',
  './src/state.js?v=6.8',
  './src/ui-controller.js?v=6.8'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  let reqUrl;
  try {
    reqUrl = new URL(event.request.url);
  } catch (_) {
    return;
  }
  if (reqUrl.origin !== self.location.origin) {
    return;
  }
  if (reqUrl.pathname.startsWith('/pearl-proxy') || reqUrl.pathname.startsWith('/kryptex-proxy')) {
    return;
  }
  const isImmutableStatic = /[?&]v=|\.(?:js|css|svg|png|woff2?)$/i.test(reqUrl.pathname + reqUrl.search);
  if (isImmutableStatic) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((netRes) => {
          if (netRes && netRes.ok) {
            const copy = netRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return netRes;
        });
      })
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((netRes) => {
        if (netRes && netRes.ok) {
          const copy = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return netRes;
      })
      .catch(() => caches.match(event.request))
  );
});
