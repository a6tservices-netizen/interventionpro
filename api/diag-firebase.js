// Endpoint de diagnostic TEMPORAIRE — à placer dans /api/diag-firebase.js
//
// Permet de vérifier depuis un navigateur si la clé de service est bien vue par
// les fonctions serveur, sans avoir à déclencher un vrai RDV pour tester.
//
//   https://rapport-intervention.fr/api/diag-firebase?cle=XXXX
//
// Protégé par la variable d'environnement DIAG_SECRET (à créer sur Vercel avec
// une valeur quelconque de ton choix). Sans secret correct → 404, l'endpoint est
// donc invisible pour qui ne connaît pas l'URL exacte ET la clé.
//
// Ne renvoie JAMAIS le contenu de la clé de service : uniquement des booléens,
// des longueurs et le project_id.
//
// À SUPPRIMER une fois les notifications rétablies.

import { diagnosticCle } from "./_firebase-admin.js";

export default async function handler(req, res) {
  const secret = process.env.DIAG_SECRET;
  if (!secret || req.query?.cle !== secret) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.status(200).json({
    environnement: process.env.VERCEL_ENV || "inconnu",
    ...diagnosticCle(),
  });
}
