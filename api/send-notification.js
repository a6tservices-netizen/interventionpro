// Fonction serveur Vercel — envoie une notification push à un technicien.
// Appelée par l'app (fetch côté client) quand une fiche/RDV lui est assigné.
//
// Nécessite la variable d'environnement Vercel FIREBASE_SERVICE_ACCOUNT
// (le contenu complet du fichier .json de la clé de compte de service, en une seule ligne).
//
// IMPORTANT : on utilise ici la syntaxe "modulaire" de firebase-admin (imports nommés
// depuis firebase-admin/app, /database, /messaging) plutôt que `import admin from
// "firebase-admin"`. Le default-import classique peut mal s'interfacer en ESM sur
// Vercel (admin.apps se retrouve `undefined`), ce qui faisait planter la fonction
// avant même de lire la clé. La forme modulaire évite ce piège.

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
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${label}) après ${ms}ms — vérifier FIREBASE_SERVICE_ACCOUNT (clé invalide/révoquée ?)`)), ms)),
  ]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }
  try {
    const { technicien, titre, corps, ficheId } = req.body || {};
    if (!titre) {
      res.status(400).json({ error: "Paramètre manquant (titre requis)" });
      return;
    }
    const app = getAdminApp();
    const db = getDatabase(app);
    const messaging = getMessaging(app);
    const logoKey = (nom) => (nom || "").replace(/[.#$/\[\]]/g, "_");

    // Aucun technicien précisé → on notifie TOUTE l'équipe (tous les tokens enregistrés),
    // à l'exception des comptes marqués "sous-traitant" (userRoles/*/sousTraitant=true) —
    // eux ne doivent recevoir que les notifications des fiches qui leur sont directement
    // assignées, jamais les fiches "libres" proposées à toute l'équipe.
    if (!technicien) {
      const [snapAll, snapRoles] = await Promise.all([
        withTimeout(db.ref("fcmTokens").get(), 8000, "lecture fcmTokens"),
        withTimeout(db.ref("userRoles").get(), 8000, "lecture userRoles"),
      ]);
      const tokensObj = snapAll.val() || {};
      const rolesObj = snapRoles.val() || {};
      const sousTraitantsKeys = new Set(
        Object.values(rolesObj)
          .filter(r => r && r.sousTraitant && r.technicien)
          .map(r => logoKey(r.technicien))
      );
      const tokens = Object.entries(tokensObj)
        .filter(([key, tok]) => tok && !sousTraitantsKeys.has(key))
        .map(([, tok]) => tok);
      if (!tokens.length) {
        res.status(200).json({ ok: false, reason: "no-token", message: "Aucune notification activée dans l'équipe" });
        return;
      }
      const message = {
        notification: { title: titre, body: corps || "" },
        data: { ficheId: ficheId || "" },
        webpush: { fcmOptions: { link: "/" }, notification: { icon: "/icon-192.png" } },
      };
      const resp = await withTimeout(messaging.sendEachForMulticast({ tokens, ...message }), 8000, "envoi multicast");
      res.status(200).json({ ok: true, envoyes: resp.successCount, echecs: resp.failureCount });
      return;
    }

    const snap = await withTimeout(db.ref(`fcmTokens/${logoKey(technicien)}`).get(), 8000, "lecture token technicien");
    const token = snap.val();
    if (!token) {
      res.status(200).json({ ok: false, reason: "no-token", message: `Aucune notification activée pour "${technicien}"` });
      return;
    }

    await withTimeout(messaging.send({
      token,
      notification: { title: titre, body: corps || "" },
      data: { ficheId: ficheId || "" },
      webpush: {
        fcmOptions: { link: "/" },
        notification: { icon: "/icon-192.png" },
      },
    }), 8000, "envoi notification");

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("send-notification error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
