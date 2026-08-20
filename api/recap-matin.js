// Fonction serveur Vercel — récapitulatif du matin InterventionPro.
// Reprend les fiches d'HIER qui étaient non traitées (voir alerte-soir.js) et vérifie
// si elles ont depuis été mises à jour. Celles qui restent non résolues sont regroupées
// dans une seule notification récapitulative envoyée à l'équipe (hors sous-traitants),
// pour visibilité sur qui n'a pas donné suite à l'alerte de la veille.
//
// Déclenchement prévu : Vercel Cron, tous les jours à 8h (heure de Paris) — voir vercel.json.

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
const hierISOParis = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Toujours non résolue ce matin : ni terminée ni annulée, et aucune tentative loguée
// depuis hier (la veille OU aujourd'hui — un technicien qui rattrape le coup tôt le matin
// avant l'envoi du récap ne doit pas être signalé).
function encoreNonResolue(f, hier, aujourdhui) {
  if (!f || f.type === "rdv" || !f.technicien) return false;
  if (f.dateRdv !== hier) return false;
  if (f.status === "termine" || f.status === "annule") return false;
  const rattrapee = (f.journalAppels || []).some(e => {
    const j = new Date(e.ts).toISOString().slice(0, 10);
    return j === hier || j === aujourdhui;
  });
  return !rattrapee;
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
    const hier = hierISOParis();
    const aujourdhui = new Date().toISOString().slice(0, 10);

    const [snapFiches, snapTokens, snapRoles] = await Promise.all([
      withTimeout(db.ref("fiches").get(), 8000, "lecture fiches"),
      withTimeout(db.ref("fcmTokens").get(), 8000, "lecture fcmTokens"),
      withTimeout(db.ref("userRoles").get(), 8000, "lecture userRoles"),
    ]);
    const fiches = Object.values(snapFiches.val() || {});
    const tokensObj = snapTokens.val() || {};
    const rolesObj = snapRoles.val() || {};

    const nonResolues = fiches.filter(f => encoreNonResolue(f, hier, aujourdhui));

    if (!nonResolues.length) {
      res.status(200).json({ ok: true, sent: false, reason: "rien-a-signaler", hier });
      return;
    }

    const parTechnicien = {};
    nonResolues.forEach(f => { (parTechnicien[f.technicien.trim()] = parTechnicien[f.technicien.trim()] || []).push(f); });
    const detail = Object.entries(parTechnicien).map(([nom, list]) => `${nom} (${list.length})`).join(", ");
    const corps = `${nonResolues.length} fiche${nonResolues.length > 1 ? "s" : ""} d'hier jamais mise${nonResolues.length > 1 ? "s" : ""} à jour — ${detail}`;

    const sousTraitantsKeys = new Set(
      Object.values(rolesObj).filter(r => r && r.sousTraitant && r.technicien).map(r => logoKey(r.technicien))
    );
    const tokens = Object.entries(tokensObj)
      .filter(([key, tok]) => tok && !sousTraitantsKeys.has(key))
      .map(([, tok]) => tok);

    if (!tokens.length) {
      res.status(200).json({ ok: true, sent: false, reason: "no-token", nonResolues: nonResolues.length });
      return;
    }

    const resp = await withTimeout(messaging.sendEachForMulticast({
      tokens,
      notification: { title: "⚠️ Récap — fiches non mises à jour hier", body: corps },
      data: { type: "recap-matin" },
      webpush: { fcmOptions: { link: "/" }, notification: { icon: "/icon-192.png" } },
    }), 8000, "envoi recap");

    res.status(200).json({ ok: true, sent: true, hier, nonResolues: nonResolues.length, parTechnicien: Object.fromEntries(Object.entries(parTechnicien).map(([k, v]) => [k, v.length])), envoyes: resp.successCount, echecs: resp.failureCount });
  } catch (e) {
    console.error("recap-matin error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
