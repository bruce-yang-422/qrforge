/* Bump VERSION whenever a precached file changes. Updates activate once all
   existing app windows close, keeping each session on a consistent version. */
const VERSION = 'v13';
const CACHE_PREFIX = `qrforge-${self.registration.scope}-`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const APP_URL = new URL('./', self.registration.scope).href;
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/pwa.js',
  'js/i18n.js',
  'js/print.js',
  'js/share.js',
  'js/tabs.js',
  'js/qr-analyze.js',
  'js/scanner.js',
  'js/barcode-rules.js',
  'js/barcode.js',
  'manifest.webmanifest',
  'libs/qrcode.min.js',
  'libs/xlsx.full.min.js',
  'libs/jszip.min.js',
  'libs/jsQR.js',
  'libs/bwip-js.min.js',
  'libs/zxing.min.js',
  'assets/sample.csv',
  'assets/sample.xlsx',
  'assets/sample.txt',
  'assets/icons/favicon.ico',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
].map((path) => new URL(path, APP_URL).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Cache only application files, never uploaded data or unrelated origin paths.
  url.search = '';
  if (!ASSETS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.href);
    return cached || fetch(event.request);
  })());
});
