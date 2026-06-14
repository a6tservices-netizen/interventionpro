// InterventionPro — Service Worker (mode hors-ligne)
// Cache "app shell" : permet d'ouvrir l'application même sans réseau.
// Les données (Firebase) se synchronisent automatiquement au retour du réseau.

const CACHE = "interventionpro-v1";

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Ne jamais intercepter : autres origines, Firebase, API, requêtes non-GET
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firebaseio") ||
    url.hostname.includes("firebasedatabase") ||
    url.hostname.includes("googleapis")
  ) {
    return;
  }

  // Navigation : réseau d'abord, cache en secours
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const c = res.clone(); caches.open(CACHE).then((k) => k.put(req, c)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Ressources : cache d'abord, réseau sinon
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const c = res.clone(); caches.open(CACHE).then((k) => k.put(req, c));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
