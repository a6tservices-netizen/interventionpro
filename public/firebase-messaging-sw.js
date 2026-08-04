// Service worker Firebase Cloud Messaging — gère les notifications reçues
// quand l'app InterventionPro n'est pas au premier plan.
// Ce fichier doit rester à la racine de /public (donc servi sur /firebase-messaging-sw.js).

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Configuration publique — sans risque d'être visible ici (ce ne sont pas des secrets).
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
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { ficheId, url: "/" },
  });
});

// Au clic sur la notification : ouvre (ou ramène au premier plan) l'app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
