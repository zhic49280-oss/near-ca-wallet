const CACHE_NAME = 'nexus-wallet-v6.90';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css?v=6.90',
  './assets/favicon.png?v=6.90',
  './assets/nexus-logo-192.png?v=6.90',
  './assets/nexus-logo-512.png?v=6.90',
  './bip39-wordlist.js?v=6.90',
  './src/crypto-engine.js?v=6.90',
  './src/token-registry.js?v=6.90',
  './src/near-intents.js?v=6.90',
  './src/chain-contracts.js?v=6.90',
  './src/limit-orders.js?v=6.90',
  './src/hyperliquid-perps.js?v=6.90',
  './src/state.js?v=6.90',
  './src/dapp-browser.js?v=6.90',
  './src/framework-ui.js?v=6.90',
  './src/jsqr-lazy.js?v=6.90',
  './src/ui-controller.js?v=6.90',
  './src/mining-pro.js?v=6.90',
  './ethers.umd.min.js?v=6.90',
  './qrcode.min.js?v=6.90',
  './walletconnect.umd.min.js?v=6.90'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((u) => cache.add(u).catch(() => null)))
    )
  );
});

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
  if (reqUrl.pathname.startsWith('/pearl-proxy') || reqUrl.pathname.startsWith('/kryptex-proxy') || reqUrl.pathname.startsWith('/nearcom-proxy') || reqUrl.pathname.startsWith('/solana-rpc')) {
    return;
  }
  const isImmutableStatic = /[?&]v=|\/assets\/icons\/.*\.(?:svg|png|webp|jpe?g|avif)$/i.test(reqUrl.pathname + reqUrl.search);
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
        }).catch(() => caches.match(event.request, { ignoreSearch: true }).then((fallback) => fallback || Response.error()));
      })
    );
    return;
  }
  const htmlCtrl = typeof AbortController === 'function' ? new AbortController() : null;
  let htmlTimer = null;
  event.respondWith(
    Promise.race([
      fetch(event.request, htmlCtrl ? { signal: htmlCtrl.signal } : undefined),
      new Promise((_, reject) => {
        htmlTimer = setTimeout(() => {
          try { if (htmlCtrl) htmlCtrl.abort(); } catch (_) {}
          reject(new Error('SW network timeout'));
        }, 3000);
      })
    ])
      .then((netRes) => {
        clearTimeout(htmlTimer);
        if (netRes && netRes.ok) {
          const copy = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return netRes;
      })
      .catch(() => {
        clearTimeout(htmlTimer);
        return caches.match(event.request, { ignoreSearch: true }).then((c) => c || Response.error());
      })
  );
});
