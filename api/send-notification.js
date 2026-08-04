// Fonction serveur Vercel — envoie une notification push à un technicien.
// Appelée par l'app (fetch côté client) quand une fiche/RDV lui est assigné.
//
// Nécessite la variable d'environnement Vercel FIREBASE_SERVICE_ACCOUNT
// (le contenu complet du fichier .json de la clé de compte de service, en une seule ligne).

import admin from "firebase-admin";

function getAdminApp() {
  if (admin.apps.length) return admin.apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquante");
  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://fiche-d-intervention-ae948-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }
  try {
    const { technicien, titre, corps, ficheId } = req.body || {};
    if (!technicien || !titre) {
      res.status(400).json({ error: "Paramètres manquants (technicien, titre requis)" });
      return;
    }
    const app = getAdminApp();
    const db = admin.database(app);

    const logoKey = (nom) => (nom || "").replace(/[.#$/\[\]]/g, "_");
    const snap = await db.ref(`fcmTokens/${logoKey(technicien)}`).get();
    const token = snap.val();
    if (!token) {
      res.status(200).json({ ok: false, reason: "no-token", message: `Aucune notification activée pour "${technicien}"` });
      return;
    }

    await admin.messaging(app).send({
      token,
      notification: { title: titre, body: corps || "" },
      data: { ficheId: ficheId || "" },
      webpush: {
        fcmOptions: { link: "/" },
        notification: { icon: "/icon-192.png" },
      },
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("send-notification error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
