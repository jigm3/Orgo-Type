// Offline cache for Orgo Type (the app and the dev/ preview). The cache name changes whenever a built file changes.
const CACHE = "orgo-type-__CACHE_ID__";
const CORE = __CORE__;
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  if (req.mode === "navigate") {   // pages: network first so updates show up; the cached copy when offline
    const url = new URL(req.url), key = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(key, c)); } return r; })
      .catch(() => caches.match(key).then(hit => hit || caches.match("index.html"))));
    return;
  }
  // RDKit, ts-fsrs, icons, fonts: cache first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  })));
});
