// Fonction serveur Vercel — envoie une notification push à un technicien.
// Appelée par l'app (fetch côté client) quand une fiche/RDV lui est assigné.
//
// L'initialisation de firebase-admin et la lecture de la clé de service sont
// centralisées dans ./_firebase-admin.js — ne pas la redupliquer ici.

import { getDb, getMsg, withTimeout, cleFirebase } from "./_firebase-admin.js";

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

    let db;
    let messaging;
    try {
      db = getDb();
      messaging = getMsg();
    } catch (e) {
      // Erreur de configuration serveur, pas une erreur d'envoi : on la distingue
      // explicitement pour que le journal d'activité affiche un message actionnable.
      console.error("send-notification — configuration:", e);
      res.status(500).json({
        ok: false,
        type: "configuration",
        error: String(e?.message || e),
      });
      return;
    }

    const message = {
      notification: { title: titre, body: corps || "" },
      data: { ficheId: ficheId || "" },
      webpush: {
        fcmOptions: { link: "/" },
        notification: { icon: "/icon-192.png" },
      },
    };

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
          .filter((r) => r && r.sousTraitant && r.technicien)
          .map((r) => cleFirebase(r.technicien))
      );

      const tokens = Object.entries(tokensObj)
        .filter(([key, tok]) => tok && !sousTraitantsKeys.has(key))
        .map(([, tok]) => tok);

      if (!tokens.length) {
        res.status(200).json({
          ok: false,
          reason: "no-token",
          message: "Aucune notification activée dans l'équipe",
        });
        return;
      }

      const resp = await withTimeout(
        messaging.sendEachForMulticast({ tokens, ...message }),
        8000,
        "envoi multicast"
      );

      res.status(200).json({
        ok: true,
        envoyes: resp.successCount,
        echecs: resp.failureCount,
      });
      return;
    }

    const snap = await withTimeout(
      db.ref(`fcmTokens/${cleFirebase(technicien)}`).get(),
      8000,
      "lecture token technicien"
    );
    const token = snap.val();

    if (!token) {
      res.status(200).json({
        ok: false,
        reason: "no-token",
        message: `Aucune notification activée pour "${technicien}"`,
      });
      return;
    }

    await withTimeout(messaging.send({ token, ...message }), 8000, "envoi notification");

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("send-notification error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
