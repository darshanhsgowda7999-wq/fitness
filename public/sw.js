/* GymFit service worker: offline app shell + fresh content when online */
const CACHE = "gymfit-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/images/hero1.jpg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Account data and admin calls are never cached
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/content") return;
  if (url.pathname.startsWith("/admin")) return;
  // Content + pages: network first, fall back to cache when offline
  if (url.pathname === "/api/content" || req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req.mode === "navigate" ? "/index.html" : req, copy)); return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "/index.html" : req)));
    return;
  }
  // Images, icons, fonts: cache first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
