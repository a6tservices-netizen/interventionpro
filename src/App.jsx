import { useState, useRef, useEffect, useMemo, useCallback } from "react";

/* ═══════════════════════════════════════════
   DONNÉES MÉTIER
═══════════════════════════════════════════ */
const PRESTATIONS = [
  { id: "degorgement", label: "Débouchage / Dégorgement", icon: "🔧", color: "#F97316",
    localisations: ["Cuisine","Salle de bain","WC","Sous-sol","Cour","Colonne commune","Branchement principal"],
    problemes: ["Bouchon total","Bouchon partiel","Odeurs","Remontée d'eaux usées","Débordement"],
    causes: [
      "Corps étranger","Lingettes / serviettes","Accumulation de graisses",
      "Dépôts calcaires / tartre","Racines / végétation","Effondrement / casse de canalisation",
      "Joint défaillant","Mauvaise pente","Chute de débris (travaux)",
      "Remontée de nappes","Cause indéterminée"
    ],
    actions: [
      "Débouchage manuel","Furetage","Haute pression","Pompage",
      "Ouverture tampon existant","Remplacement tampon hermétique",
      "Création ouverture colonne","Fourniture et pose tampon hermétique neuf","Fermeture colonne"
    ],
    resultats: [
      "Écoulement rétabli","Écoulement amélioré","Problème persistant",
      "Colonne refermée — tampon existant reposé","Colonne refermée — tampon neuf posé"
    ]},
  { id: "inspection", label: "Inspection télévisée", icon: "📷", color: "#06B6D4",
    localisations: ["Réseau EU","Réseau EP","Branchement","Collecteur","Colonne","Canalisation enterrée"],
    problemes: ["Diagnostic avant travaux","Recherche obstruction","Contrôle après travaux","Recherche effondrement"],
    actions: ["Passage caméra","Repérage défaut","Localisation obstruction","Enregistrement vidéo"],
    resultats: ["Réseau en bon état","Défaut localisé","Effondrement détecté","Rapport vidéo fourni"] },
  { id: "hydrocurage", label: "Hydrocurage", icon: "💧", color: "#0EA5E9",
    localisations: ["Réseau EU","Réseau EP","Regard de visite","Collecteur","Branchement","Colonne"],
    problemes: ["Encrassement","Racines","Dépôts calcaires","Graisses accumulées"],
    actions: ["Hydrocurage HP","Curage mécanique","Extraction corps étranger","Traitement dégraissant"],
    resultats: ["Réseau curé","Débouchage réalisé","Racines extraites","Réseau opérationnel"] },
  { id: "fosse", label: "Vidange fosse septique", icon: "⚗️", color: "#A78BFA",
    localisations: ["Fosse toutes eaux","Bac dégraisseur","Regard","Épandage","Préfiltre","Micro-station"],
    problemes: ["Fosse pleine","Débordement","Odeurs","Entretien annuel"],
    actions: ["Vidange complète","Vidange partielle","Pompage","Nettoyage bac","Contrôle épandage"],
    resultats: ["Fosse vidangée","Bon fonctionnement","Anomalie détectée","Contrôle conforme"] },
  { id: "plomberie", label: "Plomberie", icon: "🪛", color: "#10B981",
    localisations: ["Cuisine","Salle de bain","WC","Buanderie","Cave","Gaine technique","Compteur"],
    problemes: ["Fuite","Canalisation cassée","Joint usé","Robinetterie défaillante","Pression insuffisante"],
    actions: ["Remplacement joint","Remplacement robinet","Réparation fuite","Soudure","Déblocage"],
    resultats: ["Réparation effectuée","Fuite stoppée","Pression rétablie","Remplacement à prévoir"] },
  { id: "nettoyage", label: "Nettoyage / Pompage", icon: "🧽", color: "#14B8A6",
    localisations: ["Cuisine","Salle de bain","WC","Sous-sol","Cave","Cour","Parking","Local technique","Parties communes"],
    problemes: ["Débordement","Refoulement eaux usées","Inondation","Stagnation","Dépôt de boue","Contamination"],
    actions: ["Pompage eaux refoulées","Aspiration","Nettoyage des sols","Désinfection","Évacuation déchets","Assèchement"],
    resultats: ["Zone nettoyée","Eaux évacuées","Surface désinfectée","Assèchement réalisé","Intervention à poursuivre"] },
  { id: "syndic", label: "Constat / Parties communes", icon: "🏢", color: "#F59E0B",
    localisations: ["Parties communes","Cave","Parking","Colonne montante","Toiture-terrasse","Local poubelles","Hall"],
    problemes: ["Fuite parties communes","Bouchon colonne","Désordre plomberie","Sinistre","Constat contradictoire"],
    actions: ["Constat","Débouchage","Réparation provisoire","Mise en sécurité","Rapport technique"],
    resultats: ["Résolu","Partiellement résolu","Devis nécessaire","Entreprise spécialisée requise"] },
];

const RESPONSABILITES = [
  { id:"na", label:"Sans objet", icon:"—", color:"#64748B", desc:"—" },
  { id:"privative", label:"Privative", icon:"🏠", color:"#F97316", desc:"À la charge du propriétaire / locataire" },
  { id:"commune", label:"Commune", icon:"🏢", color:"#0EA5E9", desc:"À la charge de la copropriété" },
  { id:"indetermined", label:"Indéterminée", icon:"❓", color:"#F59E0B", desc:"Expertise complémentaire requise" },
];

const PRECONISATIONS = [
  "Passage caméra recommandé",
  "Détartrage recommandé",
  "Traitement dégraissant périodique",
  "Traitement racinaire à prévoir",
  "Remplacement tampon hermétique à prévoir",
  "Remplacement canalisations à prévoir",
  "Inspection annuelle recommandée",
  "Travaux de reprise à planifier",
  "Pompage préventif recommandé",
  "Vérification étanchéité à prévoir",
  "Mise aux normes recommandée",
  "Entretien régulier recommandé",
  "Contrôle dans 6 mois",
  "Devis travaux à établir",
  "Intervention urgente requise",
  "Aucune préconisation",
];

// ─── Préconisations intelligentes selon causes/résultats ─
function suggestPreconisations(prestations) {
  const suggestions = new Set();
  prestations.forEach(p => {
    const causes   = p.causes   || [];
    const resultats = p.resultats || [];
    const actions  = p.actions  || [];

    // Selon les causes
    if (causes.some(c => c.includes("calcaire") || c.includes("tartre")))
      suggestions.add("Détartrage recommandé");
    if (causes.some(c => c.includes("graisse")))
      suggestions.add("Traitement dégraissant périodique");
    if (causes.some(c => c.includes("racine")))
      suggestions.add("Passage caméra recommandé").add && suggestions.add("Traitement racinaire à prévoir");
    if (causes.some(c => c.includes("effondrement") || c.includes("casse")))
      suggestions.add("Passage caméra recommandé").add && suggestions.add("Travaux de reprise à planifier");
    if (causes.some(c => c.includes("pente")))
      suggestions.add("Travaux de reprise à planifier");
    if (causes.some(c => c.includes("joint")))
      suggestions.add("Vérification étanchéité à prévoir");
    if (causes.some(c => c.includes("tampon")))
      suggestions.add("Remplacement tampon hermétique à prévoir");

    // Selon résultats
    if (resultats.some(r => r.includes("persistant")))
      suggestions.add("Intervention urgente requise").add && suggestions.add("Passage caméra recommandé");
    if (resultats.some(r => r.includes("amélioré")))
      suggestions.add("Contrôle dans 6 mois");
    if (resultats.some(r => r.includes("rétabli") || r.includes("opérationnel")))
      suggestions.add("Entretien régulier recommandé");
    if (resultats.some(r => r.includes("devis") || r.includes("prévoir")))
      suggestions.add("Devis travaux à établir");

    // Selon prestation
    if (p.id === "inspection")
      suggestions.add("Passage caméra recommandé");
    if (p.id === "fosse")
      suggestions.add("Pompage préventif recommandé").add && suggestions.add("Inspection annuelle recommandée");
  });
  return [...suggestions];
}

const MATERIELS = ["Furet électrique","Furet manuel","Pompe à vidanger","Camion hydrocureur","Caméra d'inspection","Haute pression","Outillage plomberie","Tampon hermétique"];

const STATUTS = {
  planifie: { label:"Planifié",  color:"#3B82F6", bg:"rgba(59,130,246,0.12)" },
  en_cours: { label:"En cours", color:"#F59E0B", bg:"rgba(245,158,11,0.12)" },
  termine:  { label:"Terminé",  color:"#10B981", bg:"rgba(16,185,129,0.12)" },
  annule:   { label:"Annulé",   color:"#EF4444", bg:"rgba(239,68,68,0.12)" },
};

// ─── Localisation structurée ─────────────────────────
const BATIMENTS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ETAGES = ["Sous-sol 2","Sous-sol 1","Rez-de-chaussée","1er étage","2ème étage","3ème étage","4ème étage","5ème étage","6ème étage","7ème étage","8ème étage","9ème étage","10ème étage","11ème étage","12ème étage","13ème étage","14ème étage","15ème étage","16ème étage","17ème étage","18ème étage","19ème étage","20ème étage"];
const CAGES = ["1","2","3","4","5","6","7","8","9","10"];
const POSITIONS = ["Côté gauche","Côté droit","Central","Façade rue","Façade cour","Angle"];
const EMPTY_LOC = { batimentLettre:"", batimentNom:"", etage:"", cage:"", appartement:"", position:"" };

function formatLoc(loc) {
  if (!loc) return null;
  const parts = [];
  if (loc.batimentLettre || loc.batimentNom) {
    let b = "Bâtiment";
    if (loc.batimentLettre) b += ` ${loc.batimentLettre}`;
    if (loc.batimentNom)    b += loc.batimentLettre ? ` — ${loc.batimentNom}` : ` ${loc.batimentNom}`;
    parts.push(b);
  }
  if (loc.etage)       parts.push(loc.etage);
  if (loc.cage)        parts.push(`Cage ${loc.cage}`);
  if (loc.appartement) parts.push(`Apt / Local ${loc.appartement}`);
  if (loc.position)    parts.push(loc.position);
  return parts.length ? parts.join(" — ") : null;
}

// ─── Génération phrases rapport ──────────────────────
function joinFr(arr) {
  if (!arr?.length) return "";
  if (arr.length === 1) return arr[0].toLowerCase();
  return arr.slice(0,-1).map(s=>s.toLowerCase()).join(", ") + " et " + arr[arr.length-1].toLowerCase();
}

function buildPhrases(p, locStr) {
  const sentences = [];
  if (locStr) sentences.push(`L'intervention a été réalisée : ${locStr}.`);
  else if (p.localisations?.length) sentences.push(`Lieu d'intervention : ${joinFr(p.localisations)}.`);
  if (p.problemes?.length)  sentences.push(`Problème constaté : ${joinFr(p.problemes)}.`);
  if (p.causes?.length)     sentences.push(`Cause identifiée : ${joinFr(p.causes)}.`);
  if (p.actions?.length)    sentences.push(`Action${p.actions.length>1?"s":""} réalisée${p.actions.length>1?"s":""} : ${joinFr(p.actions)}.`);
  if (p.resultats?.length)  sentences.push(`Résultat : ${joinFr(p.resultats)}.`);
  if (p.note?.trim())       sentences.push(`Précision : ${p.note.trim()}.`);
  return sentences;
}

// ─── Génération conclusion automatique ───────────────
function generateConclusion(prestations, locStr) {
  if (!prestations?.length) return "";
  const parts = [];

  // Intro localisation
  if (locStr) parts.push(`Suite à notre intervention réalisée ${locStr},`);
  else parts.push("Suite à notre intervention,");

  // Résumé par prestation
  const details = prestations.map(p => {
    const meta = PRESTATIONS.find(x => x.id === p.id);
    const actions  = p.actions?.length  ? joinFr(p.actions)  : null;
    const resultats = p.resultats?.length ? joinFr(p.resultats) : null;
    const problemes = p.problemes?.length ? joinFr(p.problemes) : null;

    let s = `pour la prestation "${meta?.label}"`;
    if (problemes) s += `, suite à ${problemes}`;
    if (actions)   s += `, nous avons procédé à : ${actions}`;
    if (resultats) s += `. Résultat : ${resultats}`;
    return s;
  });

  parts.push(details.join(". ") + ".");

  // Formule de clôture selon résultats
  const allResultats = prestations.flatMap(p => p.resultats || []);
  const hasProbleme  = allResultats.some(r => r.toLowerCase().includes("persistant") || r.toLowerCase().includes("prévoir"));
  const hasOk        = allResultats.some(r => r.toLowerCase().includes("rétabli") || r.toLowerCase().includes("opérationnel") || r.toLowerCase().includes("conforme") || r.toLowerCase().includes("terminé") || r.toLowerCase().includes("réalisé"));

  if (hasProbleme) {
    parts.push("Un suivi ou une intervention complémentaire est recommandé. Nous restons à votre disposition pour tout renseignement.");
  } else if (hasOk) {
    parts.push("L'installation est désormais en bon état de fonctionnement. Nous restons à votre disposition pour tout renseignement complémentaire.");
  } else {
    parts.push("Nous restons à votre disposition pour tout renseignement complémentaire.");
  }

  return parts.join(" ");
}

// ─── Helpers ─────────────────────────────────────────
const uid    = () => "INT-" + Math.random().toString(36).slice(2,8).toUpperCase();
const ts     = () => new Date().toLocaleString("fr-FR");
const today  = () => new Date().toISOString().split("T")[0];
const dateFr = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"long",year:"numeric"}) : "—";

const EMPTY = {
  client:"", adresse:"", tel:"", email:"", technicien:"", dateRdv:"", heureRdv:"",
  prestations:[], responsabilite:"na", preconisations:[], conclusion:"",
  photos:[], signature:null, nomSignataire:"",
  materiels:[], difficulte:"", tempsInterne:"", notesInternes:"",
  status:"planifie", loc:{...EMPTY_LOC},
};

/* ═══════════════════════════════════════════
   RAPPORT PDF — phrases construites
═══════════════════════════════════════════ */
function buildReportHTML(fiche) {
  const resp   = RESPONSABILITES.find(r=>r.id===fiche.responsabilite);
  const presta = fiche.prestations.map(p=>({...p, meta:PRESTATIONS.find(x=>x.id===p.id)}));
  const status = STATUTS[fiche.status]||STATUTS.planifie;
  const locStr = formatLoc(fiche.loc);

  const prestaHTML = presta
    .filter(p => {
      const total = (p.localisations?.length||0)+(p.problemes?.length||0)+
        (p.causes?.length||0)+(p.actions?.length||0)+(p.resultats?.length||0);
      return total > 0 || p.note?.trim();
    })
    .map(p => {
      const phrases = buildPhrases(p, locStr);
      return `
    <div class="presta-card" style="border-left-color:${p.meta?.color||'#0ea5e9'}">
      <div class="presta-header">
        <span class="presta-icon">${p.meta?.icon||'🔧'}</span>
        <span class="presta-title" style="color:${p.meta?.color}">${p.meta?.label}</span>
      </div>
      <div class="presta-body">
        ${phrases.map(s=>`<p class="phrase">${s}</p>`).join("")}
      </div>
    </div>`;
    }).join("");

  const photoGrid = fiche.photos?.length
    ? `<div class="section-block"><div class="section-title">📷 Photos (${fiche.photos.length})</div>
       <div class="photo-grid">${fiche.photos.map(p=>`<div class="photo-item"><img src="${p.data}" alt=""/></div>`).join("")}</div></div>` : "";

  const sigBlock = fiche.signature ? `<img src="${fiche.signature}" class="sig-img"/>` : `<div class="sig-line"></div>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Rapport ${fiche.id}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;color:#0f172a;background:#fff;font-size:12px;line-height:1.7}
.header{background:#0a1628;display:grid;grid-template-columns:1fr auto}
.header-left{padding:26px 32px}
.logo{font-family:'Fraunces',serif;font-size:26px;font-weight:900;color:#fff}
.logo em{color:#38bdf8;font-style:normal}
.tagline{font-size:9px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#334155;margin-top:3px}
.header-right{background:#38bdf8;padding:26px 32px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;min-width:200px}
.report-label{font-size:8px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:rgba(10,22,40,0.6);margin-bottom:4px}
.report-id{font-family:'Fraunces',serif;font-size:18px;font-weight:900;color:#0a1628}
.report-date{font-size:11px;font-weight:600;color:#0a1628;margin-top:4px;opacity:.75}
.status-badge{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;background:${status.bg};color:${status.color};border:1px solid ${status.color}44}
.body{padding:28px 32px}
.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
.info-card{background:#f8fafc;border-radius:8px;padding:10px 14px;border:1px solid #e2e8f0}
.info-card.full{grid-column:1/-1}
.info-label{font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}
.info-value{font-size:12px;font-weight:600;color:#0f172a}
.loc-banner{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;font-size:12px;font-weight:600;color:#0369a1}
.section-block{margin-bottom:20px}
.section-title{font-size:8.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;padding-bottom:7px;border-bottom:1.5px solid #e2e8f0;margin-bottom:12px}
.presta-card{background:#f8fafc;border-radius:8px;margin-bottom:10px;border-left:4px solid #0ea5e9;overflow:hidden}
.presta-header{padding:10px 14px;background:#f1f5f9;display:flex;align-items:center;gap:8px}
.presta-icon{font-size:16px}
.presta-title{font-family:'Fraunces',serif;font-size:13px;font-weight:700}
.presta-body{padding:12px 16px}
.phrase{font-size:12px;color:#334155;line-height:1.8;margin-bottom:3px}
.phrase:last-child{margin-bottom:0}
.resp-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:24px;font-size:11px;font-weight:700;background:${resp?.color||'#64748b'}15;color:${resp?.color||'#64748b'};border:1.5px solid ${resp?.color||'#64748b'}33}
.conclusion-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;color:#166534;font-size:12px;line-height:1.75}
.conclusion-box::before{content:"";display:block;width:28px;height:3px;background:#22c55e;border-radius:2px;margin-bottom:10px}
.preco-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:5px}
.preco-list li{font-size:11px;font-weight:600;color:#6d28d9;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:6px 10px}
.preco-list li::before{content:"▸ ";opacity:.6}
.photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.photo-item{border-radius:8px;overflow:hidden;aspect-ratio:4/3;border:1px solid #e2e8f0}
.photo-item img{width:100%;height:100%;object-fit:cover;display:block}
.sig-zone{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}
.sig-box{border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;min-height:100px;background:#fafafa}
.sig-box-label{font-size:8.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px}
.sig-img{max-height:64px;max-width:100%;display:block}
.sig-line{border-bottom:1.5px solid #cbd5e1;height:48px}
.sig-name{font-size:11px;font-weight:600;color:#334155;margin-top:8px;border-top:1px solid #e2e8f0;padding-top:7px}
.internal{margin-top:20px;background:#fff7ed;border-radius:8px;padding:14px 18px;border:1.5px dashed #fdba74}
.internal-title{font-size:8px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#c2410c;margin-bottom:10px}
.internal-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.int-card{background:#fff;border:1px solid #fed7aa;border-radius:6px;padding:8px 11px}
.footer{margin-top:20px;padding-top:10px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
.footer-logo{font-family:'Fraunces',serif;font-size:11px;font-weight:700;color:#cbd5e1}
.footer-logo em{color:#38bdf8;font-style:normal}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header">
  <div class="header-left">
    <div class="logo">Intervention<em>Pro</em></div>
    <div class="tagline">Rapport d'intervention technique</div>
  </div>
  <div class="header-right">
    <div class="report-label">Référence</div>
    <div class="report-id">${fiche.id}</div>
    <div class="report-date">${dateFr(fiche.dateRdv)}${fiche.heureRdv?" · "+fiche.heureRdv:""}</div>
    <span class="status-badge">${status.label}</span>
  </div>
</div>
<div class="body">
  <div class="client-grid">
    <div class="info-card"><div class="info-label">Client / Société</div><div class="info-value">${fiche.client||"—"}</div></div>
    <div class="info-card"><div class="info-label">Technicien</div><div class="info-value">${fiche.technicien||"—"}</div></div>
    <div class="info-card full"><div class="info-label">Adresse d'intervention</div><div class="info-value">${fiche.adresse||"—"}</div></div>
    ${fiche.tel?`<div class="info-card"><div class="info-label">Téléphone</div><div class="info-value">${fiche.tel}</div></div>`:""}
    ${fiche.email?`<div class="info-card"><div class="info-label">Email</div><div class="info-value">${fiche.email}</div></div>`:""}
  </div>
  ${locStr?`<div class="loc-banner">📍 ${locStr}</div>`:""}
  <div class="section-block">
    <div class="section-title">🔧 Compte-rendu d'intervention — ${presta.length} prestation(s)</div>
    ${prestaHTML||'<p style="color:#94a3b8;font-style:italic">Aucune prestation enregistrée.</p>'}
  </div>
  ${fiche.responsabilite&&fiche.responsabilite!=="na"?`<div class="section-block"><div class="section-title">⚖️ Responsabilité</div><div class="resp-badge">● ${resp?.label} — ${resp?.desc}</div></div>`:""}
  ${fiche.preconisations?.length?`<div class="section-block"><div class="section-title">💡 Préconisations</div><ul class="preco-list">${fiche.preconisations.map(p=>`<li>${p}</li>`).join("")}</ul></div>`:""}
  <div class="section-block"><div class="section-title">📝 Conclusion</div><div class="conclusion-box">${fiche.conclusion||"—"}</div></div>
  ${photoGrid}
  <div class="sig-zone">
    <div class="sig-box"><div class="sig-box-label">Signature technicien</div><div class="sig-line"></div><div class="sig-name">${fiche.technicien||"Technicien"}</div></div>
    <div class="sig-box"><div class="sig-box-label">Signature client — Bon pour accord</div>${sigBlock}${fiche.nomSignataire?`<div class="sig-name">${fiche.nomSignataire}</div>`:""}</div>
  </div>
  <div class="internal">
    <div class="internal-title">🔒 Usage interne — Non transmis au client</div>
    <div class="internal-grid">
      <div class="int-card"><div class="info-label">Matériel</div><div class="info-value" style="font-size:11px">${fiche.materiels?.join(", ")||"—"}</div></div>
      <div class="int-card"><div class="info-label">Difficulté</div><div class="info-value" style="font-size:11px">${fiche.difficulte||"—"}</div></div>
      ${fiche.tempsInterne?`<div class="int-card"><div class="info-label">Temps</div><div class="info-value" style="font-size:11px">${fiche.tempsInterne}</div></div>`:""}
      ${fiche.notesInternes?`<div class="int-card" style="grid-column:1/-1"><div class="info-label">Notes</div><div class="info-value" style="font-size:11px;font-weight:400">${fiche.notesInternes}</div></div>`:""}
    </div>
  </div>
  <div class="footer"><div class="footer-logo">Intervention<em>Pro</em></div><div>Généré le ${ts()}</div><div>${fiche.id} — Confidentiel</div></div>
</div></body></html>`;
}

/* ═══════════════════════════════════════════
   APERÇU RAPPORT
═══════════════════════════════════════════ */
function ReportPreview({ fiche, onClose }) {
  const html = buildReportHTML(fiche);
  const [dl, setDl] = useState(false);
  const tryPrint = () => {
    const f = document.getElementById("rif"); 
    try { f?.contentWindow?.focus(); f?.contentWindow?.print(); } catch(e) {}
  };
  const download = () => {
    const blob = new Blob([html],{type:"text/html"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=`Rapport_${fiche.id}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    setDl(true); setTimeout(()=>setDl(false),2500);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"#050C18",zIndex:800,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",background:"#0A1525",borderBottom:"1px solid #1a3050",flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={onClose} style={gBtn}>← Fermer</button>
        <span style={{fontWeight:800,fontSize:14}}>Aperçu rapport — {fiche.id}</span>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={download} style={{...gBtn,borderColor:"#10B981",color:"#10B981"}}>{dl?"✓ Téléchargé":"⬇ Fichier"}</button>
          <button onClick={tryPrint} style={{...gBtn,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none"}}>🖨 Imprimer / PDF</button>
        </div>
      </div>
      <div style={{flex:1,background:"#1e2d3d",overflow:"auto",padding:16}}>
        <iframe id="rif" title="Rapport" srcDoc={html} style={{width:"100%",minHeight:"100%",height:1600,border:"none",borderRadius:10,background:"#fff",boxShadow:"0 12px 60px rgba(0,0,0,0.5)"}}/>
      </div>
      <div style={{padding:"10px 16px",background:"#0A1525",borderTop:"1px solid #1a3050",fontSize:12,color:"#475569",flexShrink:0}}>
        📱 Sur mobile : <b style={{color:"#94A3B8"}}>🖨 Imprimer / PDF</b> → « Enregistrer en PDF »
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SIGNATURE
═══════════════════════════════════════════ */
function SignatureCanvas({ onSave, onCancel }) {
  const ref=useRef(); const draw=useRef(false);
  const [has,setHas]=useState(false);
  const pos=(e,c)=>{const r=c.getBoundingClientRect();const s=e.touches?e.touches[0]:e;return{x:(s.clientX-r.left)*(c.width/r.width),y:(s.clientY-r.top)*(c.height/r.height)};};
  const start=e=>{e.preventDefault();draw.current=true;const c=ref.current;const x=c.getContext("2d");const p=pos(e,c);x.beginPath();x.moveTo(p.x,p.y);setHas(true);};
  const move=e=>{e.preventDefault();if(!draw.current)return;const c=ref.current;const x=c.getContext("2d");x.strokeStyle="#0f172a";x.lineWidth=2.5;x.lineCap="round";const p=pos(e,c);x.lineTo(p.x,p.y);x.stroke();};
  const end=()=>{draw.current=false;};
  const clr=()=>{ref.current.getContext("2d").clearRect(0,0,ref.current.width,ref.current.height);setHas(false);};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:24,width:420,maxWidth:"100%"}}>
        <div style={{fontWeight:800,fontSize:16,color:"#0f172a",marginBottom:4}}>✍️ Signature client</div>
        <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Signez dans le cadre ci-dessous</div>
        <canvas ref={ref} width={372} height={160} style={{border:"2px solid #e2e8f0",borderRadius:8,display:"block",cursor:"crosshair",touchAction:"none",background:"#f8fafc",width:"100%",height:160}}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}/>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={clr} style={{flex:1,background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:10,fontWeight:700,cursor:"pointer",color:"#475569",fontFamily:"inherit"}}>Effacer</button>
          <button onClick={onCancel} style={{flex:1,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:10,fontWeight:700,cursor:"pointer",color:"#64748b",fontFamily:"inherit"}}>Annuler</button>
          <button onClick={()=>has&&onSave(ref.current.toDataURL())} style={{flex:2,background:has?"linear-gradient(135deg,#10B981,#059669)":"#e2e8f0",border:"none",borderRadius:8,padding:10,fontWeight:800,cursor:has?"pointer":"not-allowed",color:has?"#fff":"#94a3b8",fontFamily:"inherit"}}>Valider</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   LOCALISATION STRUCTURÉE
═══════════════════════════════════════════ */
function LocalisationForm({ value, onChange }) {
  const loc = value||{};
  const set  = (k,v) => onChange({...loc,[k]:v});
  const preview = formatLoc(loc);
  return (
    <div style={{background:"#070F1C",border:"1px solid #1E3A5F",borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".09em",marginBottom:12}}>📍 Localisation précise (optionnel)</div>
      {preview && (
        <div style={{background:"rgba(14,165,233,0.08)",border:"1px solid rgba(14,165,233,0.2)",borderRadius:8,padding:"9px 14px",marginBottom:12,fontSize:13,color:"#38BDF8",fontWeight:600}}>
          📍 {preview}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div>
          <div style={lbl}>Bâtiment — Lettre</div>
          <select value={loc.batimentLettre||""} onChange={e=>set("batimentLettre",e.target.value)} style={selStyle}>
            <option value="">—</option>
            {BATIMENTS.map(l=><option key={l} value={l}>Bât. {l}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl}>Bâtiment — Nom</div>
          <input value={loc.batimentNom||""} onChange={e=>set("batimentNom",e.target.value)} placeholder='Ex : "Les Lilas"' style={inpStyle}/>
        </div>
        <div>
          <div style={lbl}>Étage</div>
          <select value={loc.etage||""} onChange={e=>set("etage",e.target.value)} style={selStyle}>
            <option value="">—</option>
            {ETAGES.map(e=><option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl}>Cage d'escalier</div>
          <select value={loc.cage||""} onChange={e=>set("cage",e.target.value)} style={selStyle}>
            <option value="">—</option>
            {CAGES.map(c=><option key={c} value={c}>Cage {c}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl}>Appartement / Local</div>
          <input value={loc.appartement||""} onChange={e=>set("appartement",e.target.value)} placeholder="N° ou nom" style={inpStyle}/>
        </div>
        <div>
          <div style={lbl}>Position</div>
          <select value={loc.position||""} onChange={e=>set("position",e.target.value)} style={selStyle}>
            <option value="">—</option>
            {POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      {preview&&<button onClick={()=>onChange({...EMPTY_LOC})} style={{marginTop:10,fontSize:11,color:"#475569",background:"none",border:"1px solid #1E3A5F",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>✕ Effacer</button>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CHECK CHIP
═══════════════════════════════════════════ */
function CheckChip({val,on,onClick,color}) {
  return (
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:12.5,fontWeight:on?700:400,textAlign:"left",background:on?color+"16":"#070F1C",border:`1.5px solid ${on?color:"#1E3A5F"}`,color:on?color:"#64748B",transition:"all .15s",fontFamily:"inherit"}}>
      <span style={{width:14,height:14,borderRadius:4,flexShrink:0,background:on?color:"transparent",border:`2px solid ${on?color:"#334155"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff"}}>{on?"✓":""}</span>
      {val}
    </button>
  );
}

/* ═══════════════════════════════════════════
   AUTOCOMPLÉTION CLIENT
═══════════════════════════════════════════ */
function ClientAutocomplete({ value, onChange, onSelect, fiches }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  // Déduplique les clients connus depuis l'historique des fiches
  const clients = useMemo(() => {
    const map = {};
    fiches.forEach(f => {
      if (f.client) map[f.client.toLowerCase()] = {
        client: f.client,
        adresse: f.adresse || "",
        tel: f.tel || "",
        email: f.email || "",
      };
    });
    return Object.values(map);
  }, [fiches]);

  const suggestions = useMemo(() => {
    if (!value || value.length < 2) return [];
    return clients.filter(c =>
      c.client.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 6);
  }, [value, clients]);

  // Ferme si clic extérieur
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showSuggestions = open && suggestions.length > 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={lbl}>Client / Société *</div>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Nom ou raison sociale"
        style={inp()}
        autoComplete="off"
      />
      {showSuggestions && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "#0B1829", border: "1.5px solid #0EA5E9", borderRadius: 10,
          marginTop: 4, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {suggestions.map((c, i) => (
            <div key={i} onClick={() => { onSelect(c); setOpen(false); }}
              style={{ padding: "11px 16px", cursor: "pointer", borderBottom: "1px solid #1E3A5F", transition: "background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(14,165,233,0.1)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#E2E8F0" }}>
                🏢 {c.client}
              </div>
              {c.adresse && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>📍 {c.adresse}</div>}
              {c.tel     && <div style={{ fontSize: 11, color: "#475569" }}>📞 {c.tel}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORMULAIRE FICHE
═══════════════════════════════════════════ */
function FicheForm({initial, onSave, onBack, fiches = []}) {
  const [f,setF]=useState(initial||{...EMPTY,dateRdv:today()});
  const [tab,setTab]=useState("client");
  const [showSig,setShowSig]=useState(false);
  const [expanded,setExpanded]=useState(null);
  const [dragOver,setDragOver]=useState(false);
  const [errors,setErrors]=useState({});
  const fileRef=useRef();

  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggleArr=(k,v)=>setF(p=>({...p,[k]:p[k].includes(v)?p[k].filter(x=>x!==v):[...p[k],v]}));
  const hasPresta=id=>f.prestations.some(p=>p.id===id);
  const togglePresta=id=>setF(p=>{
    if(p.prestations.some(x=>x.id===id)) return{...p,prestations:p.prestations.filter(x=>x.id!==id)};
    return{...p,prestations:[...p.prestations,{id,localisations:[],problemes:[],causes:[],actions:[],resultats:[],note:""}]};
  });
  const updatePresta=(id,key,val)=>setF(p=>({...p,prestations:p.prestations.map(x=>x.id===id?{...x,[key]:val}:x)}));
  const togglePrestaItem=(id,key,val)=>setF(p=>({...p,prestations:p.prestations.map(x=>{
    if(x.id!==id)return x; const arr=x[key]; return{...x,[key]:arr.includes(val)?arr.filter(y=>y!==val):[...arr,val]};
  })}));
  const readFiles=files=>Promise.all([...files].filter(x=>x.type.startsWith("image/")).map(file=>new Promise(res=>{const r=new FileReader();r.onload=e=>res({name:file.name,data:e.target.result});r.readAsDataURL(file);})));
  const addPhotos=async files=>{const imgs=await readFiles(files);setF(p=>({...p,photos:[...p.photos,...imgs]}));};

  const validate=()=>{
    const e={};
    if(!f.client.trim())e.client="Requis";
    if(!f.adresse.trim())e.adresse="Requis";
    if(f.prestations.length===0)e.presta="Sélectionnez au moins une prestation";
    setErrors(e); return Object.keys(e).length===0;
  };
  const submit=()=>{
    if(!validate()){setTab(errors.presta&&f.client&&f.adresse?"presta":"client");return;}
    onSave({...f,id:f.id||uid(),createdAt:f.createdAt||ts()});
  };

  const TABS=[
    {id:"client",label:"👤 Client",err:["client","adresse"]},
    {id:"presta",label:"🔧 Prestations",err:["presta"]},
    {id:"final",label:"📝 Finalisation"},
    {id:"interne",label:"🔒 Interne"},
  ];

  return (
    <div>
      {showSig&&<SignatureCanvas onSave={d=>{set("signature",d);setShowSig(false);}} onCancel={()=>setShowSig(false)}/>}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={gBtn}>← Retour</button>
        <div style={{fontWeight:800,fontSize:17}}>{f.id?`Modifier — ${f.id}`:"Nouvelle intervention"}</div>
        <button onClick={submit} style={{...gBtn,marginLeft:"auto",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none"}}>💾 Enregistrer</button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:3,marginBottom:20,background:"#0B1829",borderRadius:10,padding:4,border:"1px solid #1E3A5F",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 6px",border:"none",borderRadius:7,fontWeight:700,fontSize:12.5,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap",fontFamily:"inherit",position:"relative",
            background:tab===t.id?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",color:tab===t.id?"#fff":"#475569"}}>
            {t.label}
            {t.err?.some(k=>errors[k])&&<span style={{position:"absolute",top:6,right:6,width:7,height:7,borderRadius:"50%",background:"#EF4444"}}/>}
          </button>
        ))}
      </div>

      <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"20px 22px"}}>

        {/* ── CLIENT ── */}
        {tab==="client"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={{gridColumn:"1/-1"}}>
                <ClientAutocomplete
                  value={f.client}
                  onChange={v => set("client", v)}
                  onSelect={c => setF(p => ({ ...p, client: c.client, adresse: c.adresse, tel: c.tel, email: c.email }))}
                  fiches={fiches}
                />
                {errors.client&&<div style={errS}>{errors.client}</div>}
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <div style={lbl}>Adresse *</div>
                <input value={f.adresse} onChange={e=>set("adresse",e.target.value)} placeholder="Adresse complète" style={inp(errors.adresse)}/>
                {errors.adresse&&<div style={errS}>{errors.adresse}</div>}
              </div>
              <div><div style={lbl}>Téléphone</div><input value={f.tel} onChange={e=>set("tel",e.target.value)} placeholder="06 00 00 00 00" style={inp()}/></div>
              <div><div style={lbl}>Email</div><input value={f.email} onChange={e=>set("email",e.target.value)} placeholder="email@exemple.fr" style={inp()}/></div>
              <div><div style={lbl}>Technicien</div><input value={f.technicien} onChange={e=>set("technicien",e.target.value)} placeholder="Prénom Nom" style={inp()}/></div>
              <div><div style={lbl}>Statut</div>
                <select value={f.status} onChange={e=>set("status",e.target.value)} style={{...inp(),cursor:"pointer",colorScheme:"dark"}}>
                  {Object.entries(STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><div style={lbl}>Date</div><input type="date" value={f.dateRdv} onChange={e=>set("dateRdv",e.target.value)} style={{...inp(),colorScheme:"dark"}}/></div>
              <div><div style={lbl}>Heure</div><input type="time" value={f.heureRdv} onChange={e=>set("heureRdv",e.target.value)} style={{...inp(),colorScheme:"dark"}}/></div>
            </div>
            {/* Localisation structurée */}
            <LocalisationForm value={f.loc} onChange={v=>set("loc",v)}/>
          </div>
        )}

        {/* ── PRESTATIONS ── */}
        {tab==="presta"&&(
          <div>
            <p style={{fontSize:13,color:"#475569",marginBottom:14,lineHeight:1.6}}>Cochez les prestations réalisées puis dépliez pour les détails.</p>
            {errors.presta&&<div style={{...errS,marginBottom:12,fontSize:13}}>⚠️ {errors.presta}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {PRESTATIONS.map(presta=>{
                const active=hasPresta(presta.id);
                const data=f.prestations.find(p=>p.id===presta.id);
                const isOpen=expanded===presta.id;
                const count=data?(data.localisations?.length||0)+(data.problemes?.length||0)+(data.causes?.length||0)+(data.actions?.length||0)+(data.resultats?.length||0):0;
                return (
                  <div key={presta.id} style={{border:`1.5px solid ${active?presta.color:"#1E3A5F"}`,borderRadius:10,overflow:"hidden",background:active?presta.color+"0D":"#070F1C",transition:"all .2s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px"}}>
                      <button onClick={()=>{togglePresta(presta.id);if(!active)setExpanded(presta.id);}} style={{width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",background:active?presta.color:"transparent",border:`2px solid ${active?presta.color:"#334155"}`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:800,fontFamily:"inherit"}}>
                        {active?"✓":""}
                      </button>
                      <span style={{fontSize:22}}>{presta.icon}</span>
                      <div style={{flex:1,cursor:"pointer"}} onClick={()=>active&&setExpanded(isOpen?null:presta.id)}>
                        <div style={{fontWeight:700,fontSize:14,color:active?presta.color:"#94A3B8"}}>{presta.label}</div>
                        {active&&count>0&&<div style={{fontSize:11,color:"#475569",marginTop:1}}>{count} détail(s) coché(s)</div>}
                      </div>
                      {active&&<button onClick={()=>setExpanded(isOpen?null:presta.id)} style={{background:"none",border:"none",color:presta.color,cursor:"pointer",fontSize:12,fontWeight:700,padding:"4px 8px",fontFamily:"inherit"}}>{isOpen?"▲":"▼ Détails"}</button>}
                    </div>
                    {active&&isOpen&&(
                      <div style={{padding:"4px 16px 16px",borderTop:`1px solid ${presta.color}22`}}>
                        {[
                          {key:"localisations", icon:"📍", label:"Localisation",       opts:presta.localisations},
                          {key:"problemes",     icon:"⚠️", label:"Problème constaté",  opts:presta.problemes},
                          ...(presta.causes ? [{key:"causes", icon:"🔍", label:"Cause du bouchon", opts:presta.causes, badge:true}] : []),
                          {key:"actions",       icon:"🔨", label:"Action réalisée",     opts:presta.actions},
                          {key:"resultats",     icon:"✅", label:"Résultat",            opts:presta.resultats},
                        ].map(sec=>(
                          <div key={sec.key}>
                            <div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 8px",display:"flex",gap:6,alignItems:"center"}}>
                              {sec.icon} {sec.label}
                              {sec.badge&&<span style={{fontSize:9,color:"#F97316",background:"rgba(249,115,22,0.12)",padding:"2px 7px",borderRadius:10,fontWeight:700,textTransform:"none",letterSpacing:0}}>Débouchage uniquement</span>}
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                              {sec.opts.map(v=><CheckChip key={v} val={v} color={presta.color} on={(data[sec.key]||[]).includes(v)} onClick={()=>togglePrestaItem(presta.id,sec.key,v)}/>)}
                            </div>
                          </div>
                        ))}
                        <div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 8px"}}>🖊 Précision (optionnel)</div>
                        <textarea value={data.note||""} onChange={e=>updatePresta(presta.id,"note",e.target.value)} placeholder="Détail libre…" rows={2}
                          style={{...inp(),resize:"vertical",lineHeight:1.5}}/>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FINALISATION ── */}
        {tab==="final"&&(
          <div>
            <SecHead icon="⚖️" label="Responsabilité"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginBottom:20}}>
              {RESPONSABILITES.map(r=>(
                <button key={r.id} onClick={()=>set("responsabilite",r.id)} style={{padding:"10px 8px",borderRadius:8,cursor:"pointer",background:f.responsabilite===r.id?r.color+"22":"#070F1C",border:`1.5px solid ${f.responsabilite===r.id?r.color:"#1E3A5F"}`,color:f.responsabilite===r.id?r.color:"#475569",fontWeight:700,fontSize:11,textAlign:"center",lineHeight:1.4,fontFamily:"inherit"}}>
                  <div style={{fontSize:18,marginBottom:3}}>{r.icon}</div>{r.label}
                </button>
              ))}
            </div>
            <SecHead icon="💡" label="Préconisations"/>
            {(() => {
              const suggested = suggestPreconisations(f.prestations);
              const hasSuggestions = suggested.length > 0;
              return (
                <div style={{marginBottom:20}}>
                  {/* Suggestions intelligentes */}
                  {hasSuggestions && (
                    <div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.25)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#A78BFA",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                        ✨ Suggestions basées sur vos saisies
                        <button onClick={()=>{
                          const toAdd = suggested.filter(s => !f.preconisations.includes(s));
                          setF(p=>({...p,preconisations:[...p.preconisations,...toAdd]}));
                        }} style={{fontSize:10,color:"#A78BFA",background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,marginLeft:4}}>
                          Tout ajouter
                        </button>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {suggested.map(s => {
                          const already = f.preconisations.includes(s);
                          return (
                            <button key={s} onClick={()=>!already&&setF(p=>({...p,preconisations:[...p.preconisations,s]}))}
                              style={{fontSize:12,fontWeight:600,padding:"5px 12px",borderRadius:20,cursor:already?"default":"pointer",
                                background:already?"rgba(167,139,250,0.2)":"rgba(167,139,250,0.08)",
                                border:`1px solid ${already?"#A78BFA":"rgba(167,139,250,0.3)"}`,
                                color:already?"#A78BFA":"#C4B5FD",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                              {already?"✓":"+"}  {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Toutes les préconisations */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                    {PRECONISATIONS.map(v=><CheckChip key={v} val={v} color="#A78BFA" on={f.preconisations.includes(v)} onClick={()=>toggleArr("preconisations",v)}/>)}
                  </div>
                </div>
              );
            })()}
            <SecHead icon="📝" label="Conclusion (visible client)"/>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{...lbl,marginBottom:0}}>Texte de conclusion</div>
                {f.prestations.length > 0 && (
                  <button onClick={() => {
                    const locStr = formatLoc(f.loc);
                    const generated = generateConclusion(f.prestations, locStr);
                    set("conclusion", generated);
                  }}
                  style={{fontSize:11,fontWeight:700,color:"#A78BFA",background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
                    ✨ Générer automatiquement
                  </button>
                )}
              </div>
              <textarea value={f.conclusion} onChange={e=>set("conclusion",e.target.value)} rows={4}
                placeholder="Texte de conclusion… ou cliquez ✨ Générer pour une proposition automatique basée sur vos saisies."
                style={{...inp(),resize:"vertical",lineHeight:1.6,width:"100%"}}/>
              {f.conclusion && (
                <div style={{fontSize:11,color:"#475569",marginTop:4}}>
                  💡 Vous pouvez modifier librement le texte généré.
                </div>
              )}
            </div>
            <SecHead icon="📷" label="Photos"/>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);addPhotos(e.dataTransfer.files);}}
              style={{border:`2px dashed ${dragOver?"#0EA5E9":"#1E3A5F"}`,borderRadius:10,padding:18,textAlign:"center",cursor:"pointer",marginBottom:f.photos.length?10:20}}>
              <div style={{fontSize:26,marginBottom:4}}>📸</div>
              <div style={{fontSize:13,fontWeight:600,color:"#334155"}}>Glissez ou cliquez — JPG / PNG</div>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addPhotos(e.target.files)}/>
            </div>
            {f.photos.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8,marginBottom:20}}>
                {f.photos.map((p,i)=>(
                  <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",aspectRatio:"4/3",background:"#070F1C"}}>
                    <img src={p.data} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                    <button onClick={()=>set("photos",f.photos.filter((_,j)=>j!==i))} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>×</button>
                  </div>
                ))}
              </div>
            )}
            <SecHead icon="✍️" label="Signature client"/>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              {f.signature
                ?<div style={{background:"#fff",borderRadius:8,padding:8,border:"1px solid #e2e8f0"}}><img src={f.signature} style={{height:56,display:"block"}} alt="sig"/></div>
                :<div style={{border:"2px dashed #1E3A5F",borderRadius:8,padding:"14px 20px",color:"#334155",fontSize:13}}>Aucune signature</div>}
              <button onClick={()=>setShowSig(true)} style={{...gBtn,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none"}}>✍️ {f.signature?"Modifier":"Signer"}</button>
              {f.signature&&<button onClick={()=>set("signature",null)} style={{...gBtn,borderColor:"#EF4444",color:"#EF4444"}}>Effacer</button>}
            </div>
            {f.signature&&<div style={{marginTop:10}}>
              <div style={lbl}>Nom du signataire</div>
              <input value={f.nomSignataire} onChange={e=>set("nomSignataire",e.target.value)} placeholder="Nom et prénom" style={inp()}/>
            </div>}
          </div>
        )}

        {/* ── INTERNE ── */}
        {tab==="interne"&&(
          <div>
            <div style={{background:"rgba(249,115,22,0.08)",border:"1px dashed rgba(249,115,22,0.35)",borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:13,color:"#F97316",fontWeight:600}}>
              🔒 Usage interne uniquement — n'apparaît pas sur le rapport client.
            </div>
            <SecHead icon="🧰" label="Matériel utilisé"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:20}}>
              {MATERIELS.map(v=><CheckChip key={v} val={v} color="#F97316" on={f.materiels.includes(v)} onClick={()=>toggleArr("materiels",v)}/>)}
            </div>
            <SecHead icon="📊" label="Difficulté"/>
            <div style={{display:"flex",gap:7,marginBottom:20}}>
              {["Facile","Normale","Difficile","Très difficile"].map(d=>(
                <button key={d} onClick={()=>set("difficulte",d)} style={{flex:1,padding:"10px 4px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:11,border:`1.5px solid ${f.difficulte===d?"#F97316":"#1E3A5F"}`,background:f.difficulte===d?"#F9731622":"#070F1C",color:f.difficulte===d?"#F97316":"#475569",fontFamily:"inherit"}}>{d}</button>
              ))}
            </div>
            <div style={{marginBottom:16}}><div style={lbl}>⏱️ Temps</div><input value={f.tempsInterne} onChange={e=>set("tempsInterne",e.target.value)} placeholder="Ex : 1h30" style={inp()}/></div>
            <div style={lbl}>📋 Notes internes</div>
            <textarea value={f.notesInternes} onChange={e=>set("notesInternes",e.target.value)} placeholder="Observations, à prévoir…" rows={4} style={{...inp(),resize:"vertical",lineHeight:1.6}}/>
          </div>
        )}
      </div>

      <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
        <button onClick={submit} style={{background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:10,padding:"13px 32px",fontWeight:800,fontSize:15,cursor:"pointer",boxShadow:"0 4px 20px rgba(16,185,129,0.35)",fontFamily:"inherit"}}>💾 Enregistrer la fiche</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════ */
function Dashboard({fiches,onNew,onNewRdv,onDemarrer,onSelect}) {
  const todayStr=today();
  const rdvAujourdHui=fiches.filter(f=>f.dateRdv===todayStr);
  const rdvPlanifies=fiches.filter(f=>f.type==="rdv"||f.status==="planifie");
  const interventions=fiches.filter(f=>f.type==="intervention"||f.status==="en_cours"||f.status==="termine"||f.status==="annule");
  const byStatus={};
  Object.keys(STATUTS).forEach(k=>{byStatus[k]=fiches.filter(f=>f.status===k).length;});
  const byPresta={};
  fiches.forEach(f=>f.prestations?.forEach(p=>{byPresta[p.id]=(byPresta[p.id]||0)+1;}));
  const topPrestas=Object.entries(byPresta).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const techs={};
  fiches.forEach(f=>{if(f.technicien)techs[f.technicien]=(techs[f.technicien]||0)+1;});

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
        {[
          {label:"Total",val:fiches.length,icon:"📋",color:"#0EA5E9"},
          {label:"RDV planifiés",val:rdvPlanifies.length,icon:"📅",color:"#3B82F6"},
          {label:"Aujourd'hui",val:rdvAujourdHui.length,icon:"⚡",color:"#F59E0B"},
          {label:"Terminées",val:byStatus.termine||0,icon:"✅",color:"#10B981"},
          {label:"Signées",val:fiches.filter(f=>f.signature).length,icon:"✍️",color:"#A78BFA"},
        ].map(k=>(
          <div key={k.label} style={{background:"#0B1829",border:`1px solid ${k.color}22`,borderRadius:14,padding:"14px 16px",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-10,right:-10,fontSize:40,opacity:.06}}>{k.icon}</div>
            <div style={{fontSize:9,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>{k.label}</div>
            <div style={{fontSize:28,fontWeight:800,color:k.color,lineHeight:1}}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tableau RDV à réaliser */}
      {rdvPlanifies.length>0&&(
        <div style={{background:"#0B1829",border:"1.5px solid rgba(59,130,246,0.3)",borderRadius:14,padding:"16px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:"#3B82F6",textTransform:"uppercase",letterSpacing:".1em"}}>
              📅 RDV à réaliser ({rdvPlanifies.length})
            </div>
            <button onClick={onNewRdv} style={{...gBtn,borderColor:"#3B82F6",color:"#3B82F6",fontSize:11,padding:"5px 12px"}}>+ Nouveau RDV</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {rdvPlanifies.sort((a,b)=>((a.dateRdv||"")+(a.heureRdv||"")).localeCompare((b.dateRdv||"")+(b.heureRdv||""))).map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:12,background:"#070F1C",borderRadius:10,padding:"11px 14px",border:"1px solid rgba(59,130,246,0.15)"}}>
                <div style={{minWidth:80,textAlign:"center"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#3B82F6"}}>{f.dateRdv?new Date(f.dateRdv).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}):"--/--"}</div>
                  <div style={{fontSize:12,fontWeight:700,color:"#60A5FA"}}>{f.heureRdv||"--:--"}</div>
                </div>
                <div style={{width:1,height:32,background:"#1E3A5F"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.client}</div>
                  <div style={{fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {f.adresse}{f.technicien?` · 👤 ${f.technicien}`:""}</div>
                  {f.noteRdv&&<div style={{fontSize:11,color:"#334155",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {f.noteRdv}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>onSelect(f)} style={{...gBtn,fontSize:11,padding:"6px 10px"}}>👁</button>
                  <button onClick={()=>onDemarrer(f)}
                    style={{...gBtn,background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",fontSize:11,padding:"6px 12px",fontWeight:800}}>
                    ▶ Démarrer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Statuts */}
        <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"16px 18px"}}>
          <div style={secHead}>📊 Par statut</div>
          {Object.entries(STATUTS).map(([k,v])=>{
            const n=byStatus[k]||0;
            const pct=fiches.length?Math.round(n/fiches.length*100):0;
            return (<div key={k} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:12,fontWeight:600,color:v.color}}>● {v.label}</span>
                <span style={{fontSize:12,fontWeight:700}}>{n}</span>
              </div>
              <div style={{height:5,borderRadius:3,background:"#1E3A5F",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:v.color,borderRadius:3,transition:"width .5s"}}/>
              </div>
            </div>);
          })}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Top prestations */}
          {topPrestas.length>0&&(
            <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"16px 18px",flex:1}}>
              <div style={secHead}>🔧 Top prestations</div>
              {topPrestas.map(([id,n])=>{const m=PRESTATIONS.find(p=>p.id===id);return(
                <div key={id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <span style={{fontSize:18}}>{m?.icon}</span>
                  <span style={{flex:1,fontSize:12,color:"#CBD5E1"}}>{m?.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:m?.color}}>{n}</span>
                </div>
              );})}
            </div>
          )}

          {/* Techniciens */}
          {Object.keys(techs).length>0&&(
            <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"16px 18px",flex:1}}>
              <div style={secHead}>👤 Techniciens</div>
              {Object.entries(techs).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,n])=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",background:"#070F1C",borderRadius:6,border:"1px solid #1E3A5F",marginBottom:5,fontSize:12}}>
                  <span>👤 {name}</span>
                  <span style={{fontWeight:700,color:"#0EA5E9"}}>{n}</span>
                </div>
              ))}
            </div>
          )}

          {/* Boutons rapides si rien */}
          {rdvPlanifies.length===0&&topPrestas.length===0&&(
            <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"24px 18px",textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:10}}>🚀</div>
              <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Démarrez !</div>
              <div style={{fontSize:12,color:"#334155",marginBottom:14}}>Planifiez un RDV ou créez votre première intervention.</div>
              <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                <button onClick={onNewRdv} style={{...gBtn,borderColor:"#3B82F6",color:"#3B82F6",fontSize:12}}>📅 RDV</button>
                <button onClick={onNew} style={{...gBtn,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",fontSize:12}}>+ Intervention</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   AGENDA
═══════════════════════════════════════════ */
function Agenda({fiches,onSelect,onDemarrer}) {
  if(fiches.length===0) return <Empty icon="📅" text="Aucun rendez-vous planifié"/>;
  const groups={};
  fiches.forEach(f=>{const k=f.dateRdv||"sans-date";(groups[k]=groups[k]||[]).push(f);});
  const sorted=Object.keys(groups).sort((a,b)=>a==="sans-date"?1:b==="sans-date"?-1:new Date(a)-new Date(b));
  const todayStr=today();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {sorted.map(date=>(
        <div key={date}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{background:date===todayStr?"linear-gradient(135deg,#10B981,#059669)":"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",borderRadius:10,padding:"6px 14px",fontWeight:800,fontSize:13}}>
              {date==="sans-date"?"📌 Sans date":date===todayStr?"📅 Aujourd'hui":dateFr(date)}
            </div>
            <div style={{flex:1,height:1,background:"#1E3A5F"}}/>
            <span style={{fontSize:12,color:"#475569"}}>{groups[date].length} entrée(s)</span>
          </div>
          {groups[date].sort((a,b)=>(a.heureRdv||"").localeCompare(b.heureRdv||"")).map(fiche=>{
            const isRdv=fiche.type==="rdv"||(fiche.status==="planifie"&&!fiche.prestations?.length);
            const prestas=fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
            return (
              <div key={fiche.id} style={{display:"flex",alignItems:"center",gap:12,background:"#0B1829",border:`1px solid ${isRdv?"rgba(59,130,246,0.3)":"#1E3A5F"}`,borderRadius:12,padding:"12px 16px",marginBottom:6,transition:"all .2s"}}>
                {/* Indicateur type */}
                <div style={{textAlign:"center",minWidth:50,flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:isRdv?"#3B82F6":"#0EA5E9"}}>{fiche.heureRdv||"--:--"}</div>
                  <div style={{fontSize:9,fontWeight:700,marginTop:2,color:isRdv?"#3B82F6":STATUTS[fiche.status]?.color}}>
                    {isRdv?"📅 RDV":`● ${STATUTS[fiche.status]?.label}`}
                  </div>
                </div>
                <div style={{width:1,height:36,background:"#1E3A5F"}}/>
                <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onSelect(fiche)}>
                  <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fiche.client}</div>
                  <div style={{fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    📍 {fiche.adresse}{fiche.technicien?` · 👤 ${fiche.technicien}`:""}
                  </div>
                  {isRdv&&fiche.noteRdv&&<div style={{fontSize:11,color:"#334155",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {fiche.noteRdv}</div>}
                </div>
                {!isRdv&&<div style={{display:"flex",gap:3}}>{prestas.slice(0,3).map((p,i)=><span key={i} style={{fontSize:17}}>{p.icon}</span>)}</div>}
                {/* Bouton démarrer si RDV */}
                {isRdv&&(
                  <button onClick={()=>onDemarrer(fiche)}
                    style={{...gBtn,background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",fontSize:12,padding:"7px 14px",fontWeight:800,flexShrink:0}}>
                    ▶ Démarrer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   LISTE CARTES
═══════════════════════════════════════════ */
function ListeCartes({fiches,onSelect}) {
  if(fiches.length===0) return <Empty icon="📭" text="Aucune fiche trouvée"/>;
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
      {fiches.map(fiche=>{
        const prestas=fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
        const main=prestas[0];
        const locStr=formatLoc(fiche.loc);
        return (
          <div key={fiche.id} onClick={()=>onSelect(fiche)} style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"16px 18px",cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=main?.color||"#0EA5E9";e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#1E3A5F";e.currentTarget.style.transform="none";}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${main?.color||"#0EA5E9"},transparent)`}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontFamily:"monospace",fontSize:10,color:"#0EA5E9",fontWeight:700,marginBottom:3}}>{fiche.id}</div>
                <div style={{fontWeight:800,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fiche.client}</div>
                <div style={{fontSize:11,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {locStr||fiche.adresse}</div>
              </div>
              <span style={{fontSize:11,fontWeight:700,color:STATUTS[fiche.status]?.color,background:STATUTS[fiche.status]?.bg,padding:"3px 10px",borderRadius:20,flexShrink:0,marginLeft:8}}>{STATUTS[fiche.status]?.label}</span>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8}}>
              {prestas.map((p,i)=><span key={i} style={{fontSize:11,fontWeight:600,color:p.color,background:p.color+"18",padding:"3px 9px",borderRadius:20}}>{p.icon} {p.label.split(" ")[0]}</span>)}
            </div>
            <div style={{marginTop:10,fontSize:11,borderTop:"1px solid #1E3A5F",paddingTop:8,display:"flex",justifyContent:"space-between",color:"#475569"}}>
              <span>{fiche.technicien&&`👤 ${fiche.technicien}`}</span>
              <span>{dateFr(fiche.dateRdv)}{fiche.signature?" · ✍️":""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   DETAIL
═══════════════════════════════════════════ */
function Detail({fiche,onBack,onEdit,onDelete,onDemarrer}) {
  const [showPreview,setShowPreview]=useState(false);
  const resp=RESPONSABILITES.find(r=>r.id===fiche.responsabilite);
  const locStr=formatLoc(fiche.loc);
  const isRdv=fiche.type==="rdv"||(fiche.status==="planifie"&&!fiche.prestations?.length);

  const envoyerTech=(canal)=>{
    const msg=`🔧 Rappel RDV — InterventionPro\n\nClient : ${fiche.client}\nAdresse : ${fiche.adresse}\nDate : ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}\n${fiche.noteRdv?"Note : "+fiche.noteRdv+"\n":""}\nBonne intervention ! 💪`;
    const num=(fiche.tel||"").replace(/[^0-9+]/g,"");
    if(canal==="whatsapp") window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
    if(canal==="sms") window.location.href=`sms:${num}?&body=${encodeURIComponent(msg)}`;
  };

  const Chips=({items,color})=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      {items.map(v=><span key={v} style={{fontSize:12,fontWeight:600,color,background:color+"15",padding:"4px 10px",borderRadius:20}}>✓ {v}</span>)}
    </div>
  );

  return (
    <div>
      {showPreview&&<ReportPreview fiche={fiche} onClose={()=>setShowPreview(false)}/>}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={gBtn}>← Retour</button>
        <code style={{fontSize:12,color:isRdv?"#3B82F6":"#0EA5E9",background:isRdv?"rgba(59,130,246,0.1)":"rgba(14,165,233,0.1)",border:`1px solid ${isRdv?"rgba(59,130,246,0.2)":"rgba(14,165,233,0.2)"}`,padding:"5px 12px",borderRadius:6,fontWeight:700}}>
          {isRdv?"📅 RDV":""} {fiche.id}
        </code>
        <div style={{marginLeft:"auto",display:"flex",gap:7,flexWrap:"wrap"}}>
          <button onClick={onDelete} style={{...gBtn,borderColor:"#7F1D1D",color:"#EF4444"}}>🗑️</button>
          <button onClick={onEdit} style={gBtn}>✏️ Modifier</button>
          {isRdv?(
            <>
              {fiche.technicien&&<>
                <button onClick={()=>envoyerTech("whatsapp")} style={{...gBtn,borderColor:"#25D366",color:"#25D366",fontSize:12}}>🟢 WhatsApp</button>
                <button onClick={()=>envoyerTech("sms")} style={{...gBtn,fontSize:12}}>💬 SMS</button>
              </>}
              <button onClick={()=>onDemarrer(fiche)}
                style={{...gBtn,background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",fontWeight:800}}>
                ▶ Démarrer l'intervention
              </button>
            </>
          ):(
            <button onClick={()=>setShowPreview(true)} style={{...gBtn,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none"}}>📄 Voir le rapport</button>
          )}
        </div>
      </div>

      {/* Carte RDV planifié */}
      {isRdv&&(
        <div style={{background:"rgba(59,130,246,0.06)",border:"1.5px solid rgba(59,130,246,0.25)",borderRadius:14,padding:"18px 22px",marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:"#3B82F6",textTransform:"uppercase",letterSpacing:".09em",marginBottom:12}}>📅 RDV Planifié</div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>{fiche.client}</h2>
          <div style={{color:"#64748B",marginTop:4}}>📍 {fiche.adresse}</div>
          {fiche.tel&&<div style={{color:"#94A3B8",fontSize:12,marginTop:4}}>📞 {fiche.tel}</div>}
          <div style={{display:"flex",gap:14,marginTop:10,fontSize:12,color:"#64748B",flexWrap:"wrap"}}>
            {fiche.technicien&&<span>👤 {fiche.technicien}</span>}
            <span>📅 {dateFr(fiche.dateRdv)}{fiche.heureRdv?" à "+fiche.heureRdv:""}</span>
          </div>
          {fiche.noteRdv&&(
            <div style={{marginTop:12,background:"rgba(59,130,246,0.08)",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#93C5FD",lineHeight:1.6}}>
              💬 {fiche.noteRdv}
            </div>
          )}
          <div style={{marginTop:16}}>
            <button onClick={()=>onDemarrer(fiche)}
              style={{width:"100%",padding:"13px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(16,185,129,0.3)"}}>
              ▶ Démarrer l'intervention
            </button>
          </div>
        </div>
      )}

      {!isRdv&&(
      <div style={{display:"grid",gridTemplateColumns:"1fr 240px",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"18px 22px"}}>
            <h2 style={{margin:0,fontSize:20,fontWeight:800}}>{fiche.client}</h2>
            <div style={{color:"#64748B",marginTop:4}}>📍 {fiche.adresse}</div>
            {locStr&&<div style={{fontSize:13,color:"#38BDF8",fontWeight:600,marginTop:4,background:"rgba(14,165,233,0.08)",padding:"6px 12px",borderRadius:8,border:"1px solid rgba(14,165,233,0.15)"}}>📍 {locStr}</div>}
            {fiche.tel&&<div style={{color:"#94A3B8",fontSize:12,marginTop:6}}>📞 {fiche.tel}</div>}
            <div style={{display:"flex",gap:12,marginTop:10,fontSize:12,color:"#64748B",flexWrap:"wrap"}}>
              <span>👤 {fiche.technicien||"—"}</span>
              <span>📅 {dateFr(fiche.dateRdv)} {fiche.heureRdv}</span>
              <span style={{color:STATUTS[fiche.status]?.color,fontWeight:700}}>● {STATUTS[fiche.status]?.label}</span>
              {fiche.signature&&<span style={{color:"#10B981",fontWeight:700}}>✍️ Signé{fiche.nomSignataire?` — ${fiche.nomSignataire}`:""}</span>}
            </div>
          </div>

          <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"18px 22px"}}>
            <div style={secHead}>🔧 Prestations ({fiche.prestations?.length||0})</div>
            {fiche.prestations?.map(p=>{
              const meta=PRESTATIONS.find(x=>x.id===p.id);
              const phrases=buildPhrases(p,locStr);
              const hasContent=(p.localisations?.length||0)+(p.problemes?.length||0)+(p.causes?.length||0)+(p.actions?.length||0)+(p.resultats?.length||0)>0||p.note?.trim();
              if(!hasContent) return null;
              return (
                <div key={p.id} style={{background:"#070F1C",borderRadius:10,padding:"12px 16px",borderLeft:`4px solid ${meta?.color}`,marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontSize:20}}>{meta?.icon}</span>
                    <span style={{fontWeight:700,fontSize:14,color:meta?.color}}>{meta?.label}</span>
                  </div>
                  {phrases.map((s,i)=><p key={i} style={{fontSize:13,color:"#CBD5E1",lineHeight:1.7,marginBottom:2}}>{s}</p>)}
                  {!phrases.length&&<p style={{fontSize:12,color:"#475569",fontStyle:"italic"}}>Prestation cochée — aucun détail renseigné.</p>}
                </div>
              );
            })}
            {fiche.responsabilite!=="na"&&resp&&(
              <div style={{marginTop:14}}>
                <div style={secHead}>⚖️ Responsabilité</div>
                <div style={{display:"inline-flex",alignItems:"center",gap:8,background:resp.color+"18",border:`1px solid ${resp.color}44`,borderRadius:20,padding:"7px 16px",fontWeight:700,color:resp.color,fontSize:13}}>● {resp.label} — {resp.desc}</div>
              </div>
            )}
            {fiche.preconisations?.length>0&&<div style={{marginTop:14}}><div style={secHead}>💡 Préconisations</div><Chips items={fiche.preconisations} color="#A78BFA"/></div>}
            {fiche.conclusion&&<div style={{marginTop:14}}><div style={secHead}>📝 Conclusion</div><div style={{background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,padding:"12px 16px",color:"#6EE7B7",lineHeight:1.7,fontSize:13}}>{fiche.conclusion}</div></div>}
            {fiche.photos?.length>0&&<div style={{marginTop:14}}><div style={secHead}>📷 Photos ({fiche.photos.length})</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8}}>
                {fiche.photos.map((p,i)=><div key={i} style={{borderRadius:8,overflow:"hidden",aspectRatio:"4/3"}}><img src={p.data} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/></div>)}
              </div>
            </div>}
          </div>
        </div>

        <div style={{background:"rgba(249,115,22,0.06)",border:"1px dashed rgba(249,115,22,0.35)",borderRadius:14,padding:"16px 18px",height:"fit-content"}}>
          <div style={{fontSize:10,fontWeight:800,color:"#F97316",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>🔒 Usage interne</div>
          {[{label:"Matériel",val:fiche.materiels?.join(", ")||"—"},{label:"Difficulté",val:fiche.difficulte||"—"},{label:"Temps",val:fiche.tempsInterne||"—"}].map(x=>(
            <div key={x.label} style={{marginBottom:12}}>
              <div style={{fontSize:9,fontWeight:700,color:"#7C3D12",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3}}>{x.label}</div>
              <div style={{fontSize:13,fontWeight:600,color:"#FED7AA"}}>{x.val}</div>
            </div>
          ))}
          {fiche.notesInternes&&<div style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"9px 11px",fontSize:12,color:"#FED7AA",lineHeight:1.6}}>{fiche.notesInternes}</div>}
        </div>
      </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORMULAIRE RDV RAPIDE
═══════════════════════════════════════════ */
function RdvForm({ initial, onSave, onBack, fiches }) {
  const [f, setF] = useState(initial || {
    client:"", adresse:"", tel:"", technicien:"", dateRdv:today(),
    heureRdv:"", noteRdv:"", status:"planifie", type:"rdv",
  });
  const [errors, setErrors] = useState({});
  const set = (k,v) => setF(p=>({...p,[k]:v}));

  // Autocomplétion client
  const clients = useMemo(()=>{
    const map={};
    fiches.forEach(f=>{if(f.client)map[f.client.toLowerCase()]={client:f.client,adresse:f.adresse||"",tel:f.tel||""};});
    return Object.values(map);
  },[fiches]);
  const [acOpen, setAcOpen] = useState(false);
  const acRef = useRef();
  const suggestions = useMemo(()=>{
    if(!f.client||f.client.length<2) return [];
    return clients.filter(c=>c.client.toLowerCase().includes(f.client.toLowerCase())).slice(0,5);
  },[f.client,clients]);
  useEffect(()=>{
    const h=e=>{if(acRef.current&&!acRef.current.contains(e.target))setAcOpen(false);};
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);

  const validate=()=>{
    const e={};
    if(!f.client.trim()) e.client="Requis";
    if(!f.adresse.trim()) e.adresse="Requis";
    if(!f.dateRdv) e.dateRdv="Requis";
    setErrors(e); return Object.keys(e).length===0;
  };

  const envoyerTech = (canal) => {
    const msg = `🔧 Nouveau RDV — InterventionPro\n\nClient : ${f.client}\nAdresse : ${f.adresse}\nDate : ${dateFr(f.dateRdv)}${f.heureRdv?" à "+f.heureRdv:""}\n${f.noteRdv?"Note : "+f.noteRdv+"\n":""}\nBonne intervention ! 💪`;
    const num = (f.tel||"").replace(/[^0-9+]/g,"");
    if(canal==="whatsapp") window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
    if(canal==="sms") window.location.href=`sms:${num}?&body=${encodeURIComponent(msg)}`;
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={gBtn}>← Retour</button>
        <div style={{fontWeight:800,fontSize:17}}>📅 {initial?.id ? "Modifier le RDV" : "Nouveau RDV"}</div>        <button onClick={()=>{
          if(validate()) {
            const rdv = {
              ...f,
              id: f.id || uid(),
              createdAt: f.createdAt || ts(),
              type: "rdv",
              status: "planifie",
              prestations: f.prestations || [],
              photos: f.photos || [],
              materiels: f.materiels || [],
              preconisations: f.preconisations || [],
            };
            onSave(rdv);
          }
        }}
          style={{...gBtn,marginLeft:"auto",background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",border:"none"}}>
          💾 Enregistrer le RDV
        </button>
      </div>

      <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:14,padding:"20px 22px"}}>
        <div style={{background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:20,fontSize:13,color:"#93C5FD",fontWeight:600}}>
          📅 RDV planifié — Le formulaire d'intervention complet sera rempli sur place.
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Client avec autocomplétion */}
          <div style={{gridColumn:"1/-1",position:"relative"}} ref={acRef}>
            <div style={lbl}>Client / Société *</div>
            <input value={f.client} onChange={e=>{set("client",e.target.value);setAcOpen(true);}} onFocus={()=>setAcOpen(true)}
              placeholder="Nom ou raison sociale" style={inp(errors.client)} autoComplete="off"/>
            {errors.client&&<div style={errS}>{errors.client}</div>}
            {acOpen&&suggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:"#0B1829",border:"1.5px solid #3B82F6",borderRadius:10,marginTop:4,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
                {suggestions.map((c,i)=>(
                  <div key={i} onClick={()=>{setF(p=>({...p,client:c.client,adresse:c.adresse,tel:c.tel}));setAcOpen(false);}}
                    style={{padding:"10px 16px",cursor:"pointer",borderBottom:"1px solid #1E3A5F"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,0.1)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{fontWeight:700,fontSize:13}}>🏢 {c.client}</div>
                    {c.adresse&&<div style={{fontSize:11,color:"#475569"}}>📍 {c.adresse}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{gridColumn:"1/-1"}}>
            <div style={lbl}>Adresse *</div>
            <input value={f.adresse} onChange={e=>set("adresse",e.target.value)} placeholder="Adresse complète" style={inp(errors.adresse)}/>
            {errors.adresse&&<div style={errS}>{errors.adresse}</div>}
          </div>

          <div>
            <div style={lbl}>Téléphone client</div>
            <input value={f.tel} onChange={e=>set("tel",e.target.value)} placeholder="06 00 00 00 00" style={inp()}/>
          </div>
          <div>
            <div style={lbl}>Technicien assigné</div>
            <input value={f.technicien} onChange={e=>set("technicien",e.target.value)} placeholder="Prénom Nom" style={inp()}/>
          </div>

          <div>
            <div style={lbl}>Date *</div>
            <input type="date" value={f.dateRdv} onChange={e=>set("dateRdv",e.target.value)} style={{...inp(errors.dateRdv),colorScheme:"dark"}}/>
            {errors.dateRdv&&<div style={errS}>{errors.dateRdv}</div>}
          </div>
          <div>
            <div style={lbl}>Heure</div>
            <input type="time" value={f.heureRdv} onChange={e=>set("heureRdv",e.target.value)} style={{...inp(),colorScheme:"dark"}}/>
          </div>

          <div style={{gridColumn:"1/-1"}}>
            <div style={lbl}>Note pour le technicien (optionnel)</div>
            <textarea value={f.noteRdv} onChange={e=>set("noteRdv",e.target.value)} rows={2}
              placeholder="Type d'intervention, accès, code interphone, infos utiles…"
              style={{...inp(),resize:"vertical",lineHeight:1.6}}/>
          </div>
        </div>

        {/* Notifier le technicien */}
        {f.technicien && (
          <div style={{marginTop:20,borderTop:"1px solid #1E3A5F",paddingTop:16}}>
            <div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".09em",marginBottom:10}}>
              📤 Notifier le technicien
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={()=>envoyerTech("whatsapp")}
                style={{...gBtn,background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",border:"none",fontSize:13}}>
                🟢 WhatsApp — {f.technicien}
              </button>
              <button onClick={()=>envoyerTech("sms")}
                style={{...gBtn,background:"#334155",color:"#fff",border:"none",fontSize:13}}>
                💬 SMS — {f.technicien}
              </button>
            </div>
            <div style={{fontSize:11,color:"#334155",marginTop:8}}>
              ℹ️ Envoie les infos du RDV directement au technicien.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   APP
═══════════════════════════════════════════ */
export default function App() {
  const [fiches,setFiches]=useState([]);
  const [view,setView]=useState("accueil");
  const [nav,setNav]=useState("dashboard");
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(null);
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("");
  const [toast,setToast]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [showRdvForm,setShowRdvForm]=useState(false);

  const showToast=m=>{setToast(m);setTimeout(()=>setToast(null),3000);};

  useEffect(()=>{
    (async()=>{
      try{const res=await window.storage.get("fiches_v2");if(res?.value)setFiches(JSON.parse(res.value));}catch(e){}
      setLoaded(true);
    })();
  },[]);

  useEffect(()=>{
    if(!loaded)return;
    (async()=>{try{await window.storage.set("fiches_v2",JSON.stringify(fiches));}catch(e){}})();
  },[fiches,loaded]);

  const handleSave=fiche=>{
    setFiches(prev=>{const ex=prev.find(f=>f.id===fiche.id);return ex?prev.map(f=>f.id===fiche.id?fiche:f):[fiche,...prev];});
    setSelected(fiche);setView("detail");showToast("✓ Fiche enregistrée");
  };

  const handleSaveRdv=rdv=>{
    setFiches(prev=>{const ex=prev.find(f=>f.id===rdv.id);return ex?prev.map(f=>f.id===rdv.id?rdv:f):[rdv,...prev];});
    setShowRdvForm(false);
    setView("accueil");
    setNav("agenda");
    showToast("📅 RDV planifié !");
  };

  // Démarrer une intervention depuis un RDV → bascule vers formulaire complet pré-rempli
  const demarrerIntervention=rdv=>{
    setEditing({
      ...EMPTY,
      id:rdv.id,
      client:rdv.client,
      adresse:rdv.adresse,
      tel:rdv.tel||"",
      technicien:rdv.technicien||"",
      dateRdv:rdv.dateRdv,
      heureRdv:rdv.heureRdv||"",
      status:"en_cours",
      type:"intervention",
      createdAt:rdv.createdAt,
      noteRdv:rdv.noteRdv||"",
    });
    setView("form");
  };

  const handleDelete=id=>{
    setFiches(prev=>prev.filter(f=>f.id!==id));
    setView("accueil");setSelected(null);showToast("🗑️ Supprimé");
  };

  const filtered=useMemo(()=>{
    let r=fiches;
    if(search) r=r.filter(f=>`${f.client} ${f.adresse} ${f.id} ${f.technicien}`.toLowerCase().includes(search.toLowerCase()));
    if(filterStatus) r=r.filter(f=>f.status===filterStatus);
    return r;
  },[fiches,search,filterStatus]);

  const NAV=[{id:"dashboard",label:"📊 Dashboard"},{id:"agenda",label:"📅 Agenda"},{id:"liste",label:"🗂️ Liste"}];

  // RDV form plein écran
  if(showRdvForm) return (
    <div style={{minHeight:"100vh",background:"#070F1C",color:"#E2E8F0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <header style={{background:"rgba(7,15,28,0.97)",borderBottom:"1px solid #1E3A5F",padding:"0 20px",height:58,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:300}}>
        <button onClick={()=>setShowRdvForm(false)} style={gBtn}>← Accueil</button>
        <div style={{fontWeight:800,fontSize:16}}>📅 Nouveau RDV</div>
      </header>
      <div style={{maxWidth:800,margin:"0 auto",padding:"20px 16px"}}>
        <RdvForm fiches={fiches} onSave={handleSaveRdv} onBack={()=>setShowRdvForm(false)}/>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#070F1C",color:"#E2E8F0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <header style={{background:"rgba(7,15,28,0.97)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1E3A5F",padding:"0 20px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:300}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,boxShadow:"0 4px 14px rgba(14,165,233,0.3)"}}>🔧</div>
          <div>
            <div style={{fontWeight:800,fontSize:16}}>Intervention<span style={{color:"#0EA5E9"}}>Pro</span></div>
            <div style={{fontSize:9.5,color:"#334155",textTransform:"uppercase",letterSpacing:".07em"}}>💾 Auto · {fiches.length} fiche(s)</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowRdvForm(true)} style={{...gBtn,borderColor:"#3B82F6",color:"#3B82F6",fontSize:12}}>
            📅 RDV
          </button>
          <button onClick={()=>{setEditing(null);setView("form");}} style={{...gBtn,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",gap:6}}>
            <span style={{fontSize:16}}>+</span> Intervention
          </button>
        </div>
      </header>

      {toast&&<div style={{position:"fixed",top:66,right:20,zIndex:500,background:"#10B981",color:"#fff",padding:"11px 18px",borderRadius:10,fontWeight:700,fontSize:13,boxShadow:"0 8px 32px rgba(16,185,129,0.4)",animation:"slideIn .3s ease"}}>{toast}</div>}

      <div style={{maxWidth:1240,margin:"0 auto",padding:"20px 16px"}}>
        {view==="form"&&<FicheForm initial={editing} onSave={handleSave} onBack={()=>setView(selected&&editing?"detail":"accueil")} fiches={fiches}/>}
        {view==="detail"&&selected&&(
          <Detail fiche={selected} onBack={()=>setView("accueil")}
            onEdit={()=>{setEditing(selected);setView(selected.type==="rdv"?"rdv":"form");}}
            onDelete={()=>{if(confirm("Supprimer ?"))handleDelete(selected.id);}}
            onDemarrer={()=>demarrerIntervention(selected)}/>
        )}
        {view==="rdv"&&editing&&(
          <div style={{maxWidth:800,margin:"0 auto"}}>
            <RdvForm initial={editing} fiches={fiches} onSave={handleSaveRdv} onBack={()=>setView("detail")}/>
          </div>
        )}
        {view==="accueil"&&(
          <>
            <div style={{display:"flex",gap:3,marginBottom:20,background:"#0B1829",borderRadius:10,padding:4,border:"1px solid #1E3A5F"}}>
              {NAV.map(n=>(
                <button key={n.id} onClick={()=>setNav(n.id)} style={{flex:1,padding:"9px 6px",border:"none",borderRadius:7,fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s",fontFamily:"inherit",
                  background:nav===n.id?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",color:nav===n.id?"#fff":"#475569"}}>{n.label}</button>
              ))}
            </div>

            {nav!=="dashboard"&&(
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{flex:1,minWidth:160,padding:"10px 14px",background:"#0B1829",border:"1.5px solid #1E3A5F",borderRadius:8,color:"#E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                  style={{padding:"10px 12px",background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:8,color:"#E2E8F0",fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:"dark"}}>
                  <option value="">Tous statuts</option>
                  {Object.entries(STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                <span style={{fontSize:12,color:"#475569"}}>{filtered.length}/{fiches.length}</span>
              </div>
            )}

            {nav==="dashboard"&&<Dashboard fiches={fiches}
              onNew={()=>{setEditing(null);setView("form");}}
              onNewRdv={()=>setShowRdvForm(true)}
              onDemarrer={rdv=>demarrerIntervention(rdv)}
              onSelect={f=>{setSelected(f);setView("detail");}}/>}
            {nav==="agenda"&&<Agenda fiches={filtered}
              onSelect={f=>{setSelected(f);setView("detail");}}
              onDemarrer={rdv=>demarrerIntervention(rdv)}/>}
            {nav==="liste"&&<ListeCartes fiches={filtered} onSelect={f=>{setSelected(f);setView("detail");}}/>}
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box} textarea,input,select{font-family:inherit} select option{background:#0B1829}
        ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:#0B1829} ::-webkit-scrollbar-thumb{background:#1E3A5F;border-radius:3px}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
      `}</style>
    </div>
  );
}

/* ── Micro-composants ── */
const Empty=({icon,text})=>(<div style={{textAlign:"center",padding:"60px 0",color:"#1E3A5F"}}><div style={{fontSize:44,marginBottom:12}}>{icon}</div><div style={{fontWeight:700,color:"#334155"}}>{text}</div></div>);
const SecHead=({icon,label})=>(<div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".09em",paddingBottom:7,borderBottom:"1px solid #1E3A5F",marginBottom:12,display:"flex",gap:6}}>{icon} {label}</div>);

/* ── Style helpers ── */
const inp=(err)=>({width:"100%",padding:"10px 14px",background:"#070F1C",border:`1.5px solid ${err?"#EF4444":"#1E3A5F"}`,borderRadius:8,color:"#E2E8F0",fontSize:13.5,outline:"none",boxSizing:"border-box",fontFamily:"inherit"});
const lbl={display:"block",fontSize:9.5,fontWeight:700,color:"#475569",letterSpacing:".08em",textTransform:"uppercase",marginBottom:6};
const errS={color:"#EF4444",fontSize:11,marginTop:4,fontWeight:600};
const secHead={fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".1em",paddingBottom:7,borderBottom:"1px solid #1E3A5F",marginBottom:12,display:"flex",gap:6};
const gBtn={background:"#0B1829",border:"1px solid #1E3A5F",color:"#94A3B8",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,fontFamily:"inherit"};
const selStyle={width:"100%",padding:"10px 14px",background:"#070F1C",border:"1.5px solid #1E3A5F",borderRadius:8,color:"#E2E8F0",fontSize:13,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:"dark"};
const inpStyle={width:"100%",padding:"10px 14px",background:"#070F1C",border:"1.5px solid #1E3A5F",borderRadius:8,color:"#E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit"};
