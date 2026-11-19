const CACHE_NAME = 'near-ca-wallet-v5.3';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css?v=5.3',
  './bip39-wordlist.js',
  './qrcode.min.js',
  './ethers.umd.min.js',
  './walletconnect.umd.min.js',
  './ml-dsa-65.umd.min.js',
  './src/crypto-engine.js?v=5.3',
  './src/token-registry.js?v=5.3',
  './src/near-intents.js?v=5.3',
  './src/chain-contracts.js?v=5.3',
  './src/mining-pro.js?v=5.3',
  './src/state.js?v=5.3',
  './src/ui-controller.js?v=5.3'
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
