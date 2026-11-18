const CACHE_NAME = 'near-ca-wallet-v2.9';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css?v=2.9',
  './bip39-wordlist.js',
  './qrcode.min.js',
  './ethers.umd.min.js',
  './walletconnect.umd.min.js',
  './src/crypto-engine.js?v=2.9',
  './src/token-registry.js?v=2.9',
  './src/near-intents.js?v=2.9',
  './src/chain-contracts.js?v=2.9',
  './src/mining-pro.js?v=2.9',
  './src/state.js?v=2.9',
  './src/ui-controller.js?v=2.9'
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
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
