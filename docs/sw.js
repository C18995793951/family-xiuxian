/* 手机网页版的离线缓存：打开页面时先连网取新版（3 秒取不到就用缓存），断网时整页照常能玩。
 * 存档不在这里，在浏览器的 IndexedDB / localStorage 里，换版本不受影响。
 * 9dcb7fc38f9a 由 build.js 换成页面内容的摘要，页面一变就换一份新缓存。 */
const CACHE = 'fx-@@HASH@@';
const ASSETS = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('fx-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./');
      const net = fetch(req).then((r) => { if (r.ok) cache.put('./', r.clone()); return r; });
      if (!cached) return net;
      const slow = new Promise((res) => setTimeout(() => res(cached), 3000));
      return Promise.race([net.catch(() => cached), slow]);
    })());
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
