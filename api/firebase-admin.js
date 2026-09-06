// Initialisation partagée de firebase-admin pour toutes les fonctions serveur.
//
// À placer dans /api/_firebase-admin.js
// Le préfixe "_" est important : Vercel n'expose PAS les fichiers commençant par
// un underscore comme des routes HTTP. C'est un module interne, pas un endpoint.
//
// Toutes les fonctions (send-notification, alerte-soir, rappel-imminent,
// recap-matin, weekly-digest...) doivent importer d'ici plutôt que de dupliquer
// leur propre initialisation : une seule source de vérité à maintenir.
//
// Variables d'environnement acceptées, par ordre de priorité :
//   1. FIREBASE_SERVICE_ACCOUNT_B64  — le fichier .json encodé en base64 (recommandé)
//   2. FIREBASE_SERVICE_ACCOUNT      — le contenu .json brut, sur une seule ligne
//
// Le base64 est recommandé parce que le JSON brut contient des retours à la ligne
// échappés dans "private_key" : selon la façon dont la valeur est collée dans
// l'interface Vercel, ils peuvent être mal restitués et casser le JSON.parse.
//
// On utilise la syntaxe "modulaire" de firebase-admin (imports nommés depuis
// firebase-admin/app, /database, /messaging) plutôt que `import admin from
// "firebase-admin"` : le default-import classique s'interface mal en ESM sur
// Vercel (admin.apps se retrouve `undefined`).

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

export const DATABASE_URL =
  "https://fiche-d-intervention-ae948-default-rtdb.europe-west1.firebasedatabase.app";

// ---------------------------------------------------------------------------
// Lecture de la clé
// ---------------------------------------------------------------------------

// Renvoie { source, json } si une variable est présente, sinon null.
function lireCleBrute() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64 && b64.trim()) {
    let decode;
    try {
      decode = Buffer.from(b64.trim(), "base64").toString("utf8");
    } catch (e) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_B64 est définie mais n'est pas du base64 valide. " +
          "Régénérer la valeur avec : [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content .\\serviceAccount.json -Raw)))"
      );
    }
    // Un base64 tronqué décode souvent en charabia : on vérifie que ça ressemble à du JSON.
    if (!decode.trim().startsWith("{")) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_B64 décode vers autre chose que du JSON — " +
          "la valeur a probablement été tronquée au collage dans Vercel."
      );
    }
    return { source: "FIREBASE_SERVICE_ACCOUNT_B64", json: decode };
  }

  const brut = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (brut && brut.trim()) {
    return { source: "FIREBASE_SERVICE_ACCOUNT", json: brut.trim() };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

export function getAdminApp() {
  const apps = getApps();
  if (apps.length) return apps[0];

  const cle = lireCleBrute();

  if (!cle) {
    throw new Error(
      "Clé de service absente : ni FIREBASE_SERVICE_ACCOUNT_B64 ni FIREBASE_SERVICE_ACCOUNT " +
        "n'est définie dans cet environnement. Vérifier Vercel > Settings > Environment Variables " +
        "(la case Production doit être cochée), PUIS redéployer : ajouter une variable ne suffit pas, " +
        "elle n'est injectée qu'au déploiement suivant."
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(cle.json);
  } catch (e) {
    throw new Error(
      `${cle.source} est définie mais son contenu n'est pas du JSON valide (${e.message}). ` +
        "Cause la plus fréquente : les retours à la ligne de \"private_key\" ont été altérés au collage. " +
        "Passer par FIREBASE_SERVICE_ACCOUNT_B64 règle ce problème."
    );
  }

  const manquants = ["project_id", "client_email", "private_key"].filter(
    (champ) => !serviceAccount[champ]
  );
  if (manquants.length) {
    throw new Error(
      `${cle.source} contient du JSON valide mais incomplet — champs manquants : ${manquants.join(", ")}. ` +
        "S'assurer d'avoir collé le fichier de clé de compte de service, pas la config web du projet."
    );
  }

  // Selon le mode de saisie, les \n de la clé privée arrivent parfois échappés en
  // littéral "\\n" au lieu de vrais retours à la ligne : firebase-admin refuse alors
  // la clé avec une erreur cryptographique peu lisible. On normalise.
  serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
}

export function getDb() {
  return getDatabase(getAdminApp());
}

export function getMsg() {
  return getMessaging(getAdminApp());
}

// ---------------------------------------------------------------------------
// Utilitaires communs
// ---------------------------------------------------------------------------

// Enveloppe une promesse avec un délai maximum. Sans ça, une clé révoquée fait
// pendre la fonction jusqu'au timeout Vercel sans message exploitable.
export function withTimeout(promise, ms, label) {
  let timer;
  const limite = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timeout (${label}) après ${ms}ms — clé de service invalide ou révoquée, ou base injoignable.`
          )
        ),
      ms
    );
  });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}

// Normalise un nom de technicien en clé Firebase (les caractères . # $ / [ ] sont interdits).
export function cleFirebase(nom) {
  return (nom || "").replace(/[.#$/\[\]]/g, "_");
}

// Diagnostic sans jamais exposer le secret : uniquement des booléens et le project_id.
export function diagnosticCle() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const brut = process.env.FIREBASE_SERVICE_ACCOUNT;
  const info = {
    FIREBASE_SERVICE_ACCOUNT_B64: {
      definie: Boolean(b64 && b64.trim()),
      longueur: b64 ? b64.length : 0,
    },
    FIREBASE_SERVICE_ACCOUNT: {
      definie: Boolean(brut && brut.trim()),
      longueur: brut ? brut.length : 0,
    },
  };
  try {
    const app = getAdminApp();
    info.initialisation = "ok";
    info.projectId = app.options?.credential?.projectId || null;
  } catch (e) {
    info.initialisation = "echec";
    info.erreur = String(e?.message || e);
  }
  return info;
}
