// Fonction serveur Vercel — rappel avant intervention imminente InterventionPro.
//
// Le plan gratuit de Vercel ne permet qu'UN déclenchement par jour pour les tâches
// programmées internes (crons) — impossible de vérifier "est-ce qu'une intervention
// approche" toutes les 10-15 minutes avec ça. Cette fonction est donc pensée pour être
// appelée par un service EXTERNE gratuit (cron-job.org, déjà utilisé sur Pelra/Capte),
// réglé pour taper cette adresse toutes les 10 à 15 minutes :
//
//   https://interventionpro-gamma.vercel.app/api/rappel-imminent
//
// Pour chaque intervention avec une date/heure précise, un technicien assigné, entre 45
// minutes et 1h avant l'heure prévue, et pas encore rappelée, on envoie UNE notification
// ciblée au technicien concerné, puis on marque la fiche pour ne jamais la rappeler deux fois.
// Exception : une fiche marquée "urgent" est notifiée dès sa détection (au prochain passage
// du planificateur externe), sans attendre cette fenêtre de 45 min-1h.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  const apps = getApps();
  if (apps.length) return apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquante");
  const serviceAccount = JSON.parse(raw);
  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://fiche-d-intervention-ae948-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${label}) après ${ms}ms`)), ms)),
  ]);
}

const logoKey = (nom) => (nom || "").replace(/[.#$/\[\]]/g, "_");
const FENETRE_MIN_MIN = 45; // rappel envoyé quand l'intervention est dans... au moins 45 min
const FENETRE_MIN_MAX = 60; // ...et au plus 1h

export default async function handler(req, res) {
  try {
    const app = getAdminApp();
    const db = getDatabase(app);
    const messaging = getMessaging(app);
    const maintenant = new Date();

    const snapFiches = await withTimeout(db.ref("fiches").get(), 8000, "lecture fiches");
    const fichesObj = snapFiches.val() || {};

    const aRappeler = Object.entries(fichesObj).filter(([id, f]) => {
      if (!f || !f.technicien) return false;
      if (f.status === "termine" || f.status === "annule") return false;
      if (f.rappelEnvoye) return false;
      // Urgence : notifiée dès la détection (au prochain passage du planificateur externe,
      // donc quelques minutes max), peu importe la date/heure prévue — pas besoin d'attendre
      // la fenêtre de 45 min-1h qui s'applique aux interventions normales.
      if (f.urgent) return true;
      if (!f.dateRdv || !f.heureRdv) return false;
      const dt = new Date(`${f.dateRdv}T${f.heureRdv}:00`);
      const diffMin = (dt.getTime() - maintenant.getTime()) / 60000;
      return diffMin >= FENETRE_MIN_MIN && diffMin <= FENETRE_MIN_MAX;
    });

    if (!aRappeler.length) {
      res.status(200).json({ ok: true, rappels: 0 });
      return;
    }

    const [snapTokens] = await Promise.all([
      withTimeout(db.ref("fcmTokens").get(), 8000, "lecture fcmTokens"),
    ]);
    const tokensObj = snapTokens.val() || {};

    const resultats = [];
    for (const [id, f] of aRappeler) {
      const token = tokensObj[logoKey(f.technicien.trim())];
      // On marque la fiche comme rappelée dans tous les cas, pour ne jamais la retenter
      // à l'appel suivant du planificateur externe (même si l'envoi échoue faute de token).
      await db.ref(`fiches/${id}/rappelEnvoye`).set(true);
      if (!token) { resultats.push({ id, ok: false, reason: "no-token" }); continue; }
      const titre = f.urgent ? "🚨 Intervention URGENTE" : "⏰ Intervention imminente";
      const corps = `${f.client||"Client"}${f.heureRdv?" — "+f.heureRdv:""}${f.adresse?" — 📍 "+f.adresse:""}`;
      try {
        await withTimeout(messaging.send({
          token,
          notification: { title: titre, body: corps },
          data: { ficheId: id },
          webpush: { fcmOptions: { link: `/?fiche=${encodeURIComponent(id)}` }, notification: { icon: "/icon-192.png" } },
        }), 8000, `rappel ${id}`);
        resultats.push({ id, ok: true, technicien: f.technicien });
      } catch (e) {
        resultats.push({ id, ok: false, reason: String(e?.message || e) });
      }
    }

    res.status(200).json({ ok: true, rappels: resultats.length, resultats });
  } catch (e) {
    console.error("rappel-imminent error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
