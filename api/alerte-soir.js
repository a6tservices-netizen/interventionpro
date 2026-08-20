// Fonction serveur Vercel — alerte du soir (18h) InterventionPro.
// Pour chaque technicien ayant des interventions prévues aujourd'hui, ni terminées ni
// annulées, ET sans aucune tentative de contact loguée dans la journée (journal d'appels) :
// envoie une notification INDIVIDUELLE (pas de diffusion à toute l'équipe) lui demandant
// de mettre à jour la fiche avant la fin de journée.
//
// Déclenchement prévu : Vercel Cron, tous les jours à 18h (heure de Paris) — voir vercel.json.
// Nécessite la même variable d'environnement Vercel FIREBASE_SERVICE_ACCOUNT que les
// autres fonctions de notification.

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
const todayISOParis = () => {
  // Vercel Cron s'exécute en UTC. À 17h/18h UTC, on est toujours le même jour calendaire
  // à Paris (UTC+1/+2), donc une simple date UTC suffit ici.
  return new Date().toISOString().slice(0, 10);
};

// Fiches d'aujourd'hui, assignées, ni terminées ni annulées, sans tentative loguée aujourd'hui.
function ficheNonTraiteeAujourdhui(f, jour) {
  if (!f || f.type === "rdv" || !f.technicien) return false;
  if (f.dateRdv !== jour) return false;
  if (f.status === "termine" || f.status === "annule") return false;
  const dejaLoguee = (f.journalAppels || []).some(e => new Date(e.ts).toISOString().slice(0, 10) === jour);
  return !dejaLoguee;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }
  try {
    const app = getAdminApp();
    const db = getDatabase(app);
    const messaging = getMessaging(app);
    const jour = todayISOParis();

    const [snapFiches, snapTokens] = await Promise.all([
      withTimeout(db.ref("fiches").get(), 8000, "lecture fiches"),
      withTimeout(db.ref("fcmTokens").get(), 8000, "lecture fcmTokens"),
    ]);
    const fiches = Object.values(snapFiches.val() || {});
    const tokensObj = snapTokens.val() || {};

    const nonTraitees = fiches.filter(f => ficheNonTraiteeAujourdhui(f, jour));

    if (!nonTraitees.length) {
      res.status(200).json({ ok: true, sent: 0, reason: "rien-a-signaler", jour });
      return;
    }

    // Regroupe par technicien pour envoyer UNE seule notification par personne.
    const parTechnicien = {};
    nonTraitees.forEach(f => {
      const nom = f.technicien.trim();
      (parTechnicien[nom] = parTechnicien[nom] || []).push(f);
    });

    const resultats = [];
    for (const [technicien, list] of Object.entries(parTechnicien)) {
      const token = tokensObj[logoKey(technicien)];
      if (!token) { resultats.push({ technicien, ok: false, reason: "no-token" }); continue; }
      const noms = list.map(f => f.client || "client").slice(0, 3).join(", ");
      const corps = list.length === 1
        ? `${noms} — pensez à mettre à jour la fiche avant ce soir.`
        : `${list.length} fiches (${noms}${list.length > 3 ? "…" : ""}) — pensez à les mettre à jour avant ce soir.`;
      try {
        await withTimeout(messaging.send({
          token,
          notification: { title: "🔔 Fiches à mettre à jour", body: corps },
          data: { type: "alerte-soir" },
          webpush: { fcmOptions: { link: "/" }, notification: { icon: "/icon-192.png" } },
        }), 8000, `envoi ${technicien}`);
        resultats.push({ technicien, ok: true, nb: list.length });
      } catch (e) {
        resultats.push({ technicien, ok: false, reason: String(e?.message || e) });
      }
    }

    res.status(200).json({ ok: true, jour, ficheNonTraitees: nonTraitees.length, resultats });
  } catch (e) {
    console.error("alerte-soir error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
