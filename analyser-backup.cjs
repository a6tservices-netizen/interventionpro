/*
 * analyser-backup.js — InterventionPro
 *
 * LECTURE SEULE. Ce script ne se connecte pas à Firebase, ne modifie rien,
 * n'ecrit aucun fichier. Il lit la sauvegarde locale et affiche ce qui pese.
 *
 * Usage :
 *   node analyser-backup.js
 *   node analyser-backup.js "C:\chemin\vers\backup-avant-migration.json"
 */

const fs = require("fs");
const path = require("path");

const CHEMIN_DEFAUT = "C:\\Users\\a6tid\\Desktop\\backup-avant-migration.json";
const fichier = process.argv[2] || CHEMIN_DEFAUT;

const octets = (v) => (v === undefined || v === null ? 0 : Buffer.byteLength(JSON.stringify(v), "utf8"));
const mo = (n) => (n / 1048576).toFixed(2) + " Mo";
const ko = (n) => (n / 1024).toFixed(1) + " Ko";
const pct = (n, total) => (total ? ((n / total) * 100).toFixed(1) : "0.0") + " %";

// label / valeur / pourcentage optionnel
function ligne(label, valeur, part) {
  let s = "  " + String(label).padEnd(26) + String(valeur).padStart(12);
  if (part !== undefined) s += "   " + String(part).padStart(7);
  return s;
}

const estBase64 = (s) => typeof s === "string" && s.startsWith("data:");
const estLien = (s) => typeof s === "string" && /^https?:\/\//.test(s);

function main() {
  if (!fs.existsSync(fichier)) {
    console.error("\n  Fichier introuvable : " + fichier);
    console.error('  Passe le chemin en argument :  node analyser-backup.js "C:\\...\\backup-avant-migration.json"\n');
    process.exit(1);
  }

  const tailleDisque = fs.statSync(fichier).size;
  console.log("\n============================================================");
  console.log("  ANALYSE DE LA SAUVEGARDE - lecture seule");
  console.log("============================================================");
  console.log("  Fichier : " + path.basename(fichier));
  console.log("  Taille  : " + tailleDisque.toLocaleString("fr-FR") + " octets (" + mo(tailleDisque) + ")");

  let racine;
  try {
    racine = JSON.parse(fs.readFileSync(fichier, "utf8"));
  } catch (e) {
    console.error("\n  Impossible de lire le JSON : " + e.message);
    console.error("  La sauvegarde est probablement tronquee. A refaire.\n");
    process.exit(1);
  }

  /* -- 1. Poids de chaque noeud racine ---------------------- */
  const noeuds = Object.keys(racine).map((k) => ({ nom: k, taille: octets(racine[k]) }));
  noeuds.sort((a, b) => b.taille - a.taille);
  const totalNoeuds = noeuds.reduce((s, n) => s + n.taille, 0);

  console.log("\n-- 1. POIDS PAR NOEUD --------------------------------------");
  noeuds.forEach((n) => console.log(ligne(n.nom, mo(n.taille), pct(n.taille, totalNoeuds))));

  /* -- 2. Decomposition du noeud fiches --------------------- */
  const fiches = racine.fiches ? Object.values(racine.fiches) : [];
  if (!fiches.length) {
    console.log("\n  Aucune fiche trouvee. Analyse interrompue.\n");
    return;
  }

  const acc = { photosBase64: 0, photosLien: 0, signatures: 0, audio: 0, logo: 0, reste: 0 };
  const compte = {
    fiches: fiches.length, fichesAvecAudio: 0, fichesAvecPhotoBase64: 0,
    photosBase64: 0, photosLien: 0, signatures: 0,
  };
  const detail = [];

  for (const f of fiches) {
    let base64 = 0, lien = 0, sig = 0, audio = 0, logo = 0;

    for (const p of f.photos || []) {
      const t = octets(p);
      if (estBase64(p && p.data)) { base64 += t; compte.photosBase64++; }
      else { lien += t; if (estLien(p && p.data)) compte.photosLien++; }
    }

    for (const champ of ["signature", "signatureTech"]) {
      if (f[champ]) { sig += octets(f[champ]); compte.signatures++; }
    }
    for (const s of f.signaturesSupp || []) { sig += octets(s); compte.signatures++; }

    if (f.audioMemo) { audio = octets(f.audioMemo); compte.fichesAvecAudio++; }
    if (f.logoSociete) { logo = octets(f.logoSociete); }
    if (base64 > 0) compte.fichesAvecPhotoBase64++;

    const total = octets(f);
    acc.photosBase64 += base64;
    acc.photosLien += lien;
    acc.signatures += sig;
    acc.audio += audio;
    acc.logo += logo;
    acc.reste += total - base64 - lien - sig - audio - logo;

    detail.push({ id: f.id || "(sans id)", date: f.dateRdv || "", total, base64, audio });
  }

  const totalFiches = acc.photosBase64 + acc.photosLien + acc.signatures + acc.audio + acc.logo + acc.reste;

  console.log("\n-- 2. CE QUI PESE DANS LES FICHES --------------------------");
  console.log(ligne("Photos en base64", mo(acc.photosBase64), pct(acc.photosBase64, totalFiches)));
  console.log(ligne("Photos deja en lien", mo(acc.photosLien), pct(acc.photosLien, totalFiches)));
  console.log(ligne("Signatures", mo(acc.signatures), pct(acc.signatures, totalFiches)));
  console.log(ligne("Memos audio", mo(acc.audio), pct(acc.audio, totalFiches)));
  console.log(ligne("Logos societe", mo(acc.logo), pct(acc.logo, totalFiches)));
  console.log(ligne("Tout le reste (texte)", mo(acc.reste), pct(acc.reste, totalFiches)));
  console.log("  " + "-".repeat(48));
  console.log(ligne("TOTAL fiches", mo(totalFiches)));

  console.log("\n-- 3. COMPTAGES --------------------------------------------");
  console.log(ligne("Fiches", compte.fiches));
  console.log(ligne("Photos en base64", compte.photosBase64));
  console.log(ligne("Photos deja en lien", compte.photosLien));
  console.log(ligne("Fiches a migrer", compte.fichesAvecPhotoBase64));
  console.log(ligne("Fiches avec memo audio", compte.fichesAvecAudio));
  console.log(ligne("Signatures", compte.signatures));

  /* -- 4. Les 10 fiches les plus lourdes -------------------- */
  detail.sort((a, b) => b.total - a.total);
  console.log("\n-- 4. LES 10 FICHES LES PLUS LOURDES -----------------------");
  console.log("  " + "id".padEnd(20) + "date".padEnd(12) + "total".padStart(10) + "photos".padStart(10) + "audio".padStart(10));
  detail.slice(0, 10).forEach((f) => {
    console.log("  " + String(f.id).slice(0, 19).padEnd(20) + String(f.date).padEnd(12) +
      ko(f.total).padStart(10) + ko(f.base64).padStart(10) + ko(f.audio).padStart(10));
  });

  /* -- 5. Projection ---------------------------------------- */
  const apres = totalNoeuds - acc.photosBase64 - acc.audio - acc.signatures;

  console.log("\n-- 5. PROJECTION APRES MIGRATION ---------------------------");
  console.log(ligne("Base aujourd'hui", mo(totalNoeuds)));
  console.log(ligne("Base apres migration", mo(apres)));
  console.log(ligne("Gain", mo(totalNoeuds - apres), pct(totalNoeuds - apres, totalNoeuds)));
  console.log("");
  console.log("  Trafic mensuel actuel : 19,13 Go");
  console.log("  Trafic projete        : ~" + ((apres / totalNoeuds) * 19.13).toFixed(2) + " Go");
  console.log("  Seuil gratuit RTDB    : 10 Go/mois");
  console.log("\n  (projection a volume d'usage constant - 5 telephones, memes habitudes)");
  console.log("\n============================================================\n");
}

main();
