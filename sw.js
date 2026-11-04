/* Bump VERSION whenever a precached file changes, and match it in the ?v= of
   the js/ and css/ addresses in index.html, so CDNs can't serve older copies. Updates activate once all
   existing app windows close, keeping each session on a consistent version. */
const VERSION = 'v36';
const CACHE_PREFIX = `qrforge-${self.registration.scope}-`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
// Large and rarely needed, so kept from first use and across app versions.
const FONT_CACHE = `qrforge-fonts-${self.registration.scope}`;
const APP_URL = new URL('./', self.registration.scope).href;
const FONTS_URL = new URL('fonts/', APP_URL).href;
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/qr-extras.js',
  'js/share-target.js',
  'js/pwa.js',
  'js/i18n.js',
  'js/print.js',
  'js/share.js',
  'js/tabs.js',
  'js/qr-analyze.js',
  'js/qr-multi.js',
  'js/scanner.js',
  'js/barcode-rules.js',
  'js/barcode.js',
  'js/dock.js',
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
  'assets/icons/favicon-dark.ico',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
].map((path) => new URL(path, APP_URL).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // The version in the address gets past CDNs that would serve an older copy.
    await Promise.all(ASSETS.map(async (url) => {
      const response = await fetch(new Request(`${url}?v=${VERSION}`, { cache: 'reload' }));
      if (!response.ok) throw new Error(`Failed to cache ${url}`);
      await cache.put(url, response);
    }));
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
  if (event.request.method === 'POST' && event.request.url === new URL('share-target', APP_URL).href) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll('files').filter(file => file instanceof File && file.type.startsWith('image/'));
        if (files.length > 10 || files.some(file => file.size > 20 * 1024 * 1024)) {
          return Response.redirect(`${APP_URL}?share_error=size#scan`, 303);
        }
        const entry = { title: String(form.get('title') || ''), text: String(form.get('text') || ''), url: String(form.get('url') || ''), files };
        const key = crypto.randomUUID();
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('qrforge-incoming', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('shares');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('shares', 'readwrite');
            const store = tx.objectStore('shares');
            store.clear(); store.put(entry, key);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
          });
        } finally { db.close(); }
        return Response.redirect(`${APP_URL}?share_id=${key}${files.length ? '#scan' : '#generate'}`, 303);
      } catch { return Response.redirect(`${APP_URL}?share_error=read#generate`, 303); }
    })());
    return;
  }
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Cache only application files, never uploaded data or unrelated origin paths.
  url.search = '';
  if (url.href.startsWith(FONTS_URL)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const cached = await cache.match(url.href);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.href, response.clone());
      return response;
    })());
    return;
  }
  if (!ASSETS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.href);
    return cached || fetch(event.request);
  })());
});
