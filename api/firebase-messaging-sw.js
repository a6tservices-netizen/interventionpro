// InterventionPro — Service Worker Firebase Cloud Messaging
// Gère les notifications reçues quand l'app n'est pas au premier plan, et fait en sorte
// qu'un clic dessus ouvre directement la fiche concernée — pas juste l'accueil de l'app.

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyC1ukd4XUWUt7TZRAL4qj1BHqqAwbgVDUw",
  authDomain: "fiche-d-intervention-ae948.firebaseapp.com",
  databaseURL: "https://fiche-d-intervention-ae948-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fiche-d-intervention-ae948",
  storageBucket: "fiche-d-intervention-ae948.firebasestorage.app",
  messagingSenderId: "47123080220",
  appId: "1:47123080220:web:60ece3478dec6f25206bd9",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "InterventionPro";
  const body = payload.notification?.body || payload.data?.body || "";
  const ficheId = payload.data?.ficheId || "";
  // La cible de la notification est désormais construite avec l'ID de la fiche, au lieu
  // d'être toujours "/" — c'est ça qui permet d'ouvrir directement la bonne fiche au clic.
  const url = ficheId ? `/?fiche=${encodeURIComponent(ficheId)}` : "/";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { ficheId, url },
  });
});

// Au clic sur la notification : ouvre (ou ramène au premier plan) l'app, directement sur
// la fiche concernée. Si un onglet est déjà ouvert, on lui envoie l'info via postMessage
// (le focus seul ne change pas l'URL d'un onglet déjà ouvert).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.postMessage({ type: "OUVRIR_FICHE", url });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
