/* InterventionPro — Service Worker : l'application s'ouvre même sans réseau */
const CACHE = "interventionpro-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Jamais intercepter Firebase ni les API
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (e.request.mode === "navigate") {
    // Pages : réseau d'abord, cache en secours (hors ligne)
    e.respondWith(
      fetch(e.request)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put("/", cp)); return r; })
        .catch(() => caches.match("/"))
    );
    return;
  }
  // Fichiers (JS/CSS/images) : cache d'abord, réseau sinon
  e.respondWith(
    caches.match(e.request).then(
      (hit) => hit || fetch(e.request).then((r) => {
        const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r;
      })
    )
  );
});
