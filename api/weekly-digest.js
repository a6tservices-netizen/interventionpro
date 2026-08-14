// Fonction serveur Vercel — bilan hebdomadaire InterventionPro.
// Regroupe en UNE seule notification : interventions non clôturées, devis en attente
// de réponse client, et rapports terminés mais jamais envoyés au client.
//
// Déclenchement prévu : Vercel Cron (voir vercel.json — "0 17 * * 0" = dimanche 17h UTC,
// soit ~18h/19h heure de Paris selon la saison). Peut aussi être appelé manuellement en
// POST (ex. bouton "Envoyer le bilan maintenant" côté app) pour tester sans attendre.
//
// Nécessite la même variable d'environnement Vercel FIREBASE_SERVICE_ACCOUNT que
// send-notification.js.

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

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }
  try {
    const app = getAdminApp();
    const db = getDatabase(app);
    const messaging = getMessaging(app);

    const [snapFiches, snapDevis, snapTokens, snapRoles] = await Promise.all([
      withTimeout(db.ref("fiches").get(), 8000, "lecture fiches"),
      withTimeout(db.ref("devis").get(), 8000, "lecture devis"),
      withTimeout(db.ref("fcmTokens").get(), 8000, "lecture fcmTokens"),
      withTimeout(db.ref("userRoles").get(), 8000, "lecture userRoles"),
    ]);

    const fiches = Object.values(snapFiches.val() || {});
    const devisList = Object.values(snapDevis.val() || {});
    const tokensObj = snapTokens.val() || {};
    const rolesObj = snapRoles.val() || {};

    // Interventions non clôturées : ni terminées, ni annulées.
    const nonCloturees = fiches.filter(f => f.status && f.status !== "termine" && f.status !== "annule" && f.type !== "rdv");
    // Devis envoyés au client, sans réponse encore enregistrée.
    const devisEnAttente = devisList.filter(d => d.statut === "envoye");
    // Rapports terminés mais jamais envoyés au client (ni WhatsApp, ni SMS cliqué).
    const rapportsNonEnvoyes = fiches.filter(f => f.status === "termine" && !f.rapportEnvoye);

    const total = nonCloturees.length + devisEnAttente.length + rapportsNonEnvoyes.length;

    if (total === 0) {
      res.status(200).json({ ok: true, sent: false, reason: "rien-a-signaler", counts: { nonCloturees: 0, devisEnAttente: 0, rapportsNonEnvoyes: 0 } });
      return;
    }

    const morceaux = [];
    if (nonCloturees.length) morceaux.push(`${nonCloturees.length} intervention${nonCloturees.length>1?"s":""} non clôturée${nonCloturees.length>1?"s":""}`);
    if (devisEnAttente.length) morceaux.push(`${devisEnAttente.length} devis en attente`);
    if (rapportsNonEnvoyes.length) morceaux.push(`${rapportsNonEnvoyes.length} rapport${rapportsNonEnvoyes.length>1?"s":""} non envoyé${rapportsNonEnvoyes.length>1?"s":""}`);
    const corps = morceaux.join(" · ");

    // Comme pour les fiches libres, les sous-traitants ne reçoivent pas ce bilan
    // (c'est une vue d'ensemble de gestion, pas une info utile pour eux).
    const sousTraitantsKeys = new Set(
      Object.values(rolesObj).filter(r => r && r.sousTraitant && r.technicien).map(r => logoKey(r.technicien))
    );
    const tokens = Object.entries(tokensObj)
      .filter(([key, tok]) => tok && !sousTraitantsKeys.has(key))
      .map(([, tok]) => tok);

    if (!tokens.length) {
      res.status(200).json({ ok: true, sent: false, reason: "no-token", counts: { nonCloturees: nonCloturees.length, devisEnAttente: devisEnAttente.length, rapportsNonEnvoyes: rapportsNonEnvoyes.length } });
      return;
    }

    const message = {
      notification: { title: "📋 Bilan hebdomadaire", body: corps },
      data: { type: "bilan-hebdo" },
      webpush: { fcmOptions: { link: "/" }, notification: { icon: "/icon-192.png" } },
    };
    const resp = await withTimeout(messaging.sendEachForMulticast({ tokens, ...message }), 8000, "envoi bilan");

    res.status(200).json({
      ok: true, sent: true, envoyes: resp.successCount, echecs: resp.failureCount,
      counts: { nonCloturees: nonCloturees.length, devisEnAttente: devisEnAttente.length, rapportsNonEnvoyes: rapportsNonEnvoyes.length },
    });
  } catch (e) {
    console.error("weekly-digest error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
