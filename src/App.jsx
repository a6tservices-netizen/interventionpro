import { useRef, useEffect, useMemo, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove } from "firebase/database";

/* ═══════════════════════════════════════════
   FIREBASE CONFIG
═══════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyC1ukd4XUWUt7TZRAL4qj1BHqqAwbgVDUw",
  authDomain: "fiche-d-intervention-ae948.firebaseapp.com",
  databaseURL: "https://fiche-d-intervention-ae948-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fiche-d-intervention-ae948",
  storageBucket: "fiche-d-intervention-ae948.firebasestorage.app",
  messagingSenderId: "47123080220",
  appId: "1:47123080220:web:60ece3478dec6f25206bd9",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const saveFiche = (fiche) => set(ref(db, `fiches/${fiche.id}`), fiche);
const deleteFiche = (id) => remove(ref(db, `fiches/${id}`));
const watchFiches = (cb) => onValue(ref(db, "fiches"), snap => { const d=snap.val(); cb(d?Object.values(d):[]); });
const watchPositions = (cb) => onValue(ref(db, "positions"), snap => cb(snap.val()||{}));
const updatePosition = (nom, lat, lng) => set(ref(db, `positions/${nom}`), { lat, lng, updatedAt: new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}), statut:"En intervention" });
const watchSocietes = (cb) => onValue(ref(db, "societes"), snap => cb(snap.val()||["A6T Services"]));
const saveSocietes = (list) => set(ref(db, "societes"), list);

/* ═══════════════════════════════════════════
   THÈMES
═══════════════════════════════════════════ */
const THEMES = {
  dark: {
    id: "dark",
    label: "Sombre",
    bg: "#070F1C",
    surface: "#0B1829",
    surface2: "#070F1C",
    border: "#1E3A5F",
    text: "#E2E8F0",
    textMuted: "#475569",
    textFaint: "#334155",
    accent: "#0EA5E9",
  },
  light: {
    id: "light",
    label: "Clair",
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    surface2: "#F1F5F9",
    border: "#CBD5E1",
    text: "#0F172A",
    textMuted: "#64748B",
    textFaint: "#94A3B8",
    accent: "#0EA5E9",
  },
  gray: {
    id: "gray",
    label: "Gris",
    bg: "#E2E8F0",
    surface: "#F8FAFC",
    surface2: "#EEF2F7",
    border: "#CBD5E1",
    text: "#1E293B",
    textMuted: "#64748B",
    textFaint: "#94A3B8",
    accent: "#0EA5E9",
  },
};

/* ═══════════════════════════════════════════
   DONNÉES MÉTIER
═══════════════════════════════════════════ */
const PRESTATIONS = [
  {
    id: "degorgement", label: "Débouchage", icon: "🔧", color: "#F97316",
    localisations: ["Cuisine","Salle de bain","WC","Sous-sol","Cour","Colonne commune","Branchement principal"],
    problemes: ["Bouchon total","Bouchon partiel","Odeurs","Remontée d'eaux usées","Débordement"],
    causes: ["Corps étranger","Lingettes / serviettes","Accumulation de graisses","Dépôts calcaires / tartre","Racines / végétation","Effondrement / casse de canalisation","Joint défaillant","Mauvaise pente","Chute de débris (travaux)","Remontée de nappes","Cause indéterminée"],
    actions: ["Par débouchage manuel","Par furet électrique","Par camion hydrocureur","Pompage","Ouverture tampon existant","Remplacement tampon hermétique","Création ouverture sur colonne","Fourniture et pose tampon hermétique neuf","Fermeture colonne","Extraction de corps étranger"],
    resultats: ["Écoulement rétabli","Écoulement amélioré","Problème persistant","Colonne refermée — tampon existant reposé","Colonne refermée — tampon neuf posé"],
  },
  {
    id: "inspection", label: "Inspection télévisée", icon: "📷", color: "#06B6D4",
    localisations: ["Réseau EU","Réseau EP","Branchement","Collecteur","Colonne","Canalisation enterrée"],
    problemes: ["Diagnostic avant travaux","Recherche obstruction","Contrôle après travaux","Recherche effondrement"],
    constatCamera: ["Cassure de canalisation","Déboîtement","Affaissement","Contre-pente","Corps étranger visible","Infiltration","Racines","Obturation partielle","Obturation totale"],
    actions: ["Passage caméra","Repérage défaut","Localisation obstruction","Enregistrement vidéo","Extraction de corps étranger"],
    resultats: ["Réseau en bon état","Défaut localisé","Effondrement détecté","Rapport vidéo fourni"],
  },
  {
    id: "hydrocurage", label: "Hydrocurage", icon: "💧", color: "#0EA5E9",
    localisations: ["Réseau EU","Réseau EP","Regard de visite","Collecteur","Branchement","Colonne"],
    problemes: ["Encrassement","Racines","Dépôts calcaires","Graisses accumulées"],
    actions: ["Hydrocurage HP","Curage mécanique","Extraction corps étranger","Traitement dégraissant"],
    resultats: ["Réseau curé","Débouchage réalisé","Racines extraites","Réseau opérationnel"],
  },
  {
    id: "fosse", label: "Vidange fosse septique", icon: "⚗️", color: "#A78BFA",
    localisations: ["Fosse toutes eaux","Bac dégraisseur","Regard","Épandage","Préfiltre","Micro-station"],
    problemes: ["Fosse pleine","Débordement","Odeurs","Entretien annuel"],
    actions: ["Vidange complète","Vidange partielle","Pompage","Nettoyage bac","Contrôle épandage"],
    resultats: ["Fosse vidangée","Bon fonctionnement","Anomalie détectée","Contrôle conforme"],
  },
  {
    id: "plomberie", label: "Plomberie", icon: "🪛", color: "#10B981",
    localisations: ["Cuisine","Salle de bain","WC","Buanderie","Cave","Gaine technique","Compteur"],
    problemes: ["Fuite","Canalisation cassée","Joint usé","Robinetterie défaillante","Pression insuffisante"],
    actions: ["Remplacement joint","Remplacement robinet","Réparation fuite","Soudure","Déblocage"],
    resultats: ["Réparation effectuée","Fuite stoppée","Pression rétablie","Remplacement à prévoir"],
  },
  {
    id: "nettoyage", label: "Nettoyage / Pompage", icon: "🧽", color: "#14B8A6",
    localisations: ["Cuisine","Salle de bain","WC","Sous-sol","Cave","Cour","Parking","Local technique","Parties communes"],
    problemes: ["Débordement","Refoulement eaux usées","Inondation","Stagnation","Dépôt de boue","Contamination"],
    actions: ["Pompage eaux refoulées","Aspiration","Nettoyage des sols","Désinfection","Évacuation déchets","Assèchement"],
    resultats: ["Zone nettoyée","Eaux évacuées","Surface désinfectée","Assèchement réalisé","Intervention à poursuivre"],
  },
  {
    id: "syndic", label: "Constat / Parties communes", icon: "🏢", color: "#F59E0B",
    localisations: ["Parties communes","Cave","Parking","Colonne montante","Toiture-terrasse","Local poubelles","Hall"],
    problemes: ["Fuite parties communes","Bouchon colonne","Désordre plomberie","Sinistre","Constat contradictoire"],
    actions: ["Constat","Débouchage","Réparation provisoire","Mise en sécurité","Rapport technique"],
    resultats: ["Résolu","Partiellement résolu","Devis nécessaire","Entreprise spécialisée requise"],
  },
];

const RESPONSABILITES = [
  { id:"na", label:"Sans objet", icon:"—", color:"#64748B", desc:"—" },
  { id:"privative", label:"Privative", icon:"🏠", color:"#F97316", desc:"À la charge du propriétaire / locataire" },
  { id:"commune", label:"Commune", icon:"🏢", color:"#0EA5E9", desc:"À la charge de la copropriété" },
  { id:"indetermined", label:"Indéterminée", icon:"❓", color:"#F59E0B", desc:"Expertise complémentaire requise" },
];

const PRECONISATIONS = [
  "Passage caméra recommandé","Détartrage recommandé","Traitement dégraissant périodique",
  "Traitement racinaire à prévoir","Remplacement tampon hermétique à prévoir",
  "Remplacement canalisations à prévoir","Inspection annuelle recommandée",
  "Travaux de reprise à planifier","Pompage préventif recommandé",
  "Vérification étanchéité à prévoir","Mise aux normes recommandée",
  "Entretien régulier recommandé","Contrôle dans 6 mois",
  "Devis travaux à établir","Intervention urgente requise","Aucune préconisation",
];

const MATERIELS = ["Furet électrique","Furet manuel","Pompe à vidanger","Camion hydrocureur","Caméra d'inspection","Haute pression","Outillage plomberie","Tampon hermétique"];

const SOCIETES_DEFAUT = ["A6T Services"];

const STATUTS = {
  planifie: { label:"Planifié",  color:"#3B82F6", bg:"rgba(59,130,246,0.12)" },
  en_cours: { label:"En cours", color:"#F59E0B", bg:"rgba(245,158,11,0.12)" },
  termine:  { label:"Terminé",  color:"#10B981", bg:"rgba(16,185,129,0.12)" },
  annule:   { label:"Annulé",   color:"#EF4444", bg:"rgba(239,68,68,0.12)" },
};

const BATIMENTS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ETAGES = ["Sous-sol 2","Sous-sol 1","Rez-de-chaussée","1er étage","2ème étage","3ème étage","4ème étage","5ème étage","6ème étage","7ème étage","8ème étage","9ème étage","10ème étage","11ème étage","12ème étage","13ème étage","14ème étage","15ème étage","16ème étage","17ème étage","18ème étage","19ème étage","20ème étage"];
const CAGES = ["1","2","3","4","5","6","7","8","9","10"];
const POSITIONS = ["Côté gauche","Côté droit","Central","Façade rue","Façade cour","Angle"];
const EMPTY_LOC = { batimentLettre:"", batimentNom:"", etage:"", cage:"", appartement:"", position:"" };

// ─── Helpers ─────────────────────────────────────────
const uid    = () => "INT-" + Math.random().toString(36).slice(2,8).toUpperCase();
const ts     = () => new Date().toLocaleString("fr-FR");
const today  = () => new Date().toISOString().split("T")[0];
const dateFr = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"long",year:"numeric"}) : "—";

function formatLoc(loc) {
  if (!loc) return null;
  const parts = [];
  if (loc.batimentLettre || loc.batimentNom) {
    let b = "Bâtiment";
    if (loc.batimentLettre) b += ` ${loc.batimentLettre}`;
    if (loc.batimentNom) b += loc.batimentLettre ? ` — ${loc.batimentNom}` : ` ${loc.batimentNom}`;
    parts.push(b);
  }
  if (loc.etage) parts.push(loc.etage);
  if (loc.cage) parts.push(`Cage ${loc.cage}`);
  if (loc.appartement) parts.push(`Apt / Local ${loc.appartement}`);
  if (loc.position) parts.push(loc.position);
  return parts.length ? parts.join(" — ") : null;
}

// ─── Suggestions préconisations ──────────────────────
function suggestPreconisations(prestations) {
  const s = new Set();
  prestations.forEach(p => {
    const causes = p.causes || [];
    const resultats = p.resultats || [];
    if (causes.some(c => c.includes("calcaire") || c.includes("tartre"))) s.add("Détartrage recommandé");
    if (causes.some(c => c.includes("graisse"))) s.add("Traitement dégraissant périodique");
    if (causes.some(c => c.includes("racine"))) { s.add("Passage caméra recommandé"); s.add("Traitement racinaire à prévoir"); }
    if (causes.some(c => c.includes("effondrement") || c.includes("casse"))) { s.add("Passage caméra recommandé"); s.add("Travaux de reprise à planifier"); }
    if (causes.some(c => c.includes("pente"))) s.add("Travaux de reprise à planifier");
    if (causes.some(c => c.includes("joint"))) s.add("Vérification étanchéité à prévoir");
    if (causes.some(c => c.includes("tampon"))) s.add("Remplacement tampon hermétique à prévoir");
    if (resultats.some(r => r.includes("persistant"))) { s.add("Intervention urgente requise"); s.add("Passage caméra recommandé"); }
    if (resultats.some(r => r.includes("amélioré"))) s.add("Contrôle dans 6 mois");
    if (resultats.some(r => r.includes("rétabli") || r.includes("opérationnel"))) s.add("Entretien régulier recommandé");
    if (p.id === "fosse") { s.add("Pompage préventif recommandé"); s.add("Inspection annuelle recommandée"); }
    if (p.id === "inspection") s.add("Passage caméra recommandé");
  });
  return [...s];
}

/* ═══════════════════════════════════════════
   GÉNÉRATION CONCLUSION IA
═══════════════════════════════════════════ */
async function generateConclusionIA(prestations, locStr, responsabilite) {
  const details = prestations.map(p => {
    const meta = PRESTATIONS.find(x => x.id === p.id);
    return {
      prestation: meta?.label,
      localisation: locStr || (p.localisations?.join(", ") || ""),
      problemes: p.problemes?.join(", ") || "",
      causes: p.causes?.join(", ") || "",
      actions: p.actions?.join(", ") || "",
      resultats: p.resultats?.join(", ") || "",
      note: p.note || "",
    };
  });

  const resp = RESPONSABILITES.find(r => r.id === responsabilite);
  const prompt = `Tu es un rédacteur de rapports d'intervention technique pour une entreprise de plomberie et assainissement française.
  
Rédige une conclusion professionnelle, naturelle et bien écrite en français pour un rapport d'intervention avec les informations suivantes :

${details.map(d => `
Prestation : ${d.prestation}
${d.localisation ? `Lieu : ${d.localisation}` : ""}
${d.problemes ? `Problème : ${d.problemes}` : ""}
${d.causes ? `Cause : ${d.causes}` : ""}
${d.actions ? `Actions : ${d.actions}` : ""}
${d.resultats ? `Résultat : ${d.resultats}` : ""}
${d.note ? `Note : ${d.note}` : ""}
`).join("\n")}

${resp && resp.id !== "na" ? `Responsabilité : ${resp.label} — ${resp.desc}` : ""}

Règles :
- Rédige UN seul paragraphe fluide et professionnel
- Utilise un français courant et naturel, pas de jargon
- Commence par "Suite à notre intervention"
- Mentionne le lieu si disponible
- Résume les actions et résultats de manière claire
- Termine par une formule de politesse courte
- Maximum 5-6 phrases
- NE PAS lister les prestations séparément, faire un texte coulant`;

fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "sk-ant-api03-H15PcQvrlsxTR7Sq9mEL-BgU6D10KXiTePcSpXDD6iqX20-RcQM5DqiVqpBqSgXjP6WP7GVW2H4OwnXjeqCCQQ-Kcz1WQAA", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function generateNotePrestation(presta, locStr) {
  const meta = PRESTATIONS.find(x => x.id === presta.id);
  const prompt = `Rédige une courte note technique professionnelle en français (2-3 phrases maximum) pour cette prestation d'intervention :

Prestation : ${meta?.label}
${locStr ? `Lieu : ${locStr}` : ""}
${presta.problemes?.length ? `Problème : ${presta.problemes.join(", ")}` : ""}
${presta.causes?.length ? `Cause : ${presta.causes.join(", ")}` : ""}
${presta.actions?.length ? `Actions : ${presta.actions.join(", ")}` : ""}
${presta.resultats?.length ? `Résultat : ${presta.resultats.join(", ")}` : ""}

Sois concis, professionnel et naturel en français.`;

  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "";
}

/* ═══════════════════════════════════════════
   RAPPORT PDF
═══════════════════════════════════════════ */
function buildReportHTML(fiche, hideInternal = false) {
  const resp = RESPONSABILITES.find(r => r.id === fiche.responsabilite);
  const presta = fiche.prestations.map(p => ({ ...p, meta: PRESTATIONS.find(x => x.id === p.id) }));
  const status = STATUTS[fiche.status] || STATUTS.planifie;
  const locStr = formatLoc(fiche.loc);
  const isUrgent = fiche.urgent;

  const prestaHTML = presta
    .filter(p => {
      const total = (p.localisations?.length||0)+(p.problemes?.length||0)+(p.causes?.length||0)+
        (p.constatCamera?.length||0)+(p.actions?.length||0)+(p.resultats?.length||0);
      return total > 0 || p.note?.trim();
    })
    .map(p => {
      const sentences = [];
      const pLocStr = locStr || (p.localisations?.length ? `${p.localisations.join(", ")}` : null);
      if (pLocStr) sentences.push(`L'intervention a été réalisée : ${pLocStr}.`);
      if (p.problemes?.length) sentences.push(`Problème constaté : ${p.problemes.map(s=>s.toLowerCase()).join(", ")}.`);
      if (p.causes?.length) sentences.push(`Cause identifiée : ${p.causes.map(s=>s.toLowerCase()).join(", ")}.`);
      if (p.constatCamera?.length) sentences.push(`Constat caméra : ${p.constatCamera.map(s=>s.toLowerCase()).join(", ")}.`);
      if (p.actions?.length) {
        // Phrase spéciale pour création ouverture + camion hydrocureur
        const hasCreation = p.actions.includes("Création ouverture sur colonne");
        const hasCamion = p.actions.includes("Par camion hydrocureur");
        if (hasCreation && hasCamion) {
          const autres = p.actions.filter(a => a !== "Création ouverture sur colonne" && a !== "Par camion hydrocureur");
          let phrase = "Action réalisée : création d'une ouverture sur colonne, puis hydrocurage par camion hydrocureur";
          if (autres.length) phrase += `, ${autres.map(s=>s.toLowerCase()).join(", ")}`;
          sentences.push(phrase + ".");
        } else {
          sentences.push(`Action${p.actions.length>1?"s":""} réalisée${p.actions.length>1?"s":""} : ${p.actions.map(s=>s.toLowerCase()).join(", ")}.`);
        }
      }
      if (p.resultats?.length) sentences.push(`Résultat : ${p.resultats.map(s=>s.toLowerCase()).join(", ")}.`);
      if (p.note?.trim()) sentences.push(p.note.trim());

      return `
      <div class="presta-card" style="border-left-color:${p.meta?.color||'#0ea5e9'}">
        <div class="presta-header">
          <span class="presta-icon">${p.meta?.icon||'🔧'}</span>
          <span class="presta-title" style="color:${p.meta?.color}">${p.meta?.label}</span>
        </div>
        <div class="presta-body">
          ${sentences.map(s=>`<p class="phrase">${s}</p>`).join("")}
        </div>
      </div>`;
    }).join("");

  const photoGrid = fiche.photos?.length
    ? `<div class="section-block"><div class="section-title">📷 Photos (${fiche.photos.length})</div>
       <div class="photo-grid">${fiche.photos.map(p=>`<div class="photo-item"><img src="${p.data}" alt=""/></div>`).join("")}</div></div>` : "";

  const sigClientBlock = fiche.signature ? `<img src="${fiche.signature}" class="sig-img"/>` : `<div class="sig-line"></div>`;
  const sigTechBlock = fiche.signatureTech ? `<img src="${fiche.signatureTech}" class="sig-img"/>` : `<div class="sig-line"></div>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Rapport ${fiche.id}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;color:#0f172a;background:#fff;font-size:12px;line-height:1.7}
.header{background:#0a1628;display:grid;grid-template-columns:1fr auto}
.header-left{padding:26px 32px}
.logo{font-family:'Fraunces',serif;font-size:14px;font-weight:700;color:#94a3b8;letter-spacing:.05em}
.report-title{font-family:'Fraunces',serif;font-size:22px;font-weight:900;color:#fff;margin-top:4px}
.header-right{background:#38bdf8;padding:26px 32px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;min-width:200px}
.report-label{font-size:8px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:rgba(10,22,40,0.6);margin-bottom:4px}
.report-id{font-family:'Fraunces',serif;font-size:18px;font-weight:900;color:#0a1628}
.report-date{font-size:11px;font-weight:600;color:#0a1628;margin-top:4px;opacity:.75}
.status-badge{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;background:${status.bg};color:${status.color};border:1px solid ${status.color}44}
.urgent-badge{display:inline-block;margin-top:6px;margin-left:6px;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(239,68,68,0.15);color:#EF4444;border:1px solid #EF444444}
.body{padding:28px 32px}
.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
.info-card{background:#f8fafc;border-radius:8px;padding:10px 14px;border:1px solid #e2e8f0}
.info-card.full{grid-column:1/-1}
.info-label{font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}
.info-value{font-size:12px;font-weight:600;color:#0f172a}
.loc-banner{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 16px;margin-bottom:20px;font-size:12px;font-weight:600;color:#0369a1}
.section-block{margin-bottom:20px}
.section-title{font-size:8.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;padding-bottom:7px;border-bottom:1.5px solid #e2e8f0;margin-bottom:12px}
.presta-card{background:#f8fafc;border-radius:8px;margin-bottom:10px;border-left:4px solid #0ea5e9;overflow:hidden}
.presta-header{padding:10px 14px;background:#f1f5f9;display:flex;align-items:center;gap:8px}
.presta-icon{font-size:16px}
.presta-title{font-family:'Fraunces',serif;font-size:13px;font-weight:700}
.presta-body{padding:12px 16px}
.phrase{font-size:12px;color:#334155;line-height:1.8;margin-bottom:3px}
.resp-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:24px;font-size:11px;font-weight:700;background:${resp?.color||'#64748b'}15;color:${resp?.color||'#64748b'};border:1.5px solid ${resp?.color||'#64748b'}33}
.conclusion-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;color:#166534;font-size:12px;line-height:1.8}
.conclusion-box::before{content:"";display:block;width:28px;height:3px;background:#22c55e;border-radius:2px;margin-bottom:10px}
.preco-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:5px}
.preco-list li{font-size:11px;font-weight:600;color:#6d28d9;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:6px 10px}
.preco-list li::before{content:"▸ ";opacity:.6}
.photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.photo-item{border-radius:8px;overflow:hidden;aspect-ratio:4/3;border:1px solid #e2e8f0;max-height:160px}
.photo-item img{width:100%;height:100%;object-fit:cover;display:block;max-height:160px}
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
@media print{.internal{display:none!important}}
.footer{margin-top:20px;padding-top:10px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
.footer-logo{font-family:'Fraunces',serif;font-size:11px;font-weight:700;color:#cbd5e1}
.footer-logo em{color:#38bdf8;font-style:normal}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header">
  <div class="header-left">
    ${fiche.societe?`<div class="logo">${fiche.societe}</div>`:""}
    <div class="report-title">Rapport d'intervention technique</div>
  </div>
  <div class="header-right">
    <div class="report-label">Référence</div>
    <div class="report-id">${fiche.id}</div>
    <div class="report-date">${dateFr(fiche.dateRdv)}${fiche.heureRdv?" · "+fiche.heureRdv:""}</div>
    <span class="status-badge">${status.label}</span>
    ${isUrgent?'<span class="urgent-badge">🚨 URGENCE</span>':""}
  </div>
</div>
<div class="body">
  <div class="client-grid">
    ${fiche.client?`<div class="info-card"><div class="info-label">Client / Société</div><div class="info-value">${fiche.client}</div></div>`:""}
    <div class="info-card"><div class="info-label">Technicien</div><div class="info-value">${fiche.technicien||"—"}</div></div>
    ${fiche.adresse?`<div class="info-card full"><div class="info-label">Adresse d'intervention</div><div class="info-value">${fiche.adresse}${fiche.diametreCanalisation?" — DN "+fiche.diametreCanalisation:""}</div></div>`:""}
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
    <div class="sig-box">
      <div class="sig-box-label">Signature technicien</div>
      ${sigTechBlock}
      <div class="sig-name">${fiche.technicien||"Technicien"}</div>
    </div>
    <div class="sig-box">
      <div class="sig-box-label">Signature client — Bon pour accord</div>
      ${sigClientBlock}
      ${fiche.nomSignataire?`<div class="sig-name">${fiche.nomSignataire}</div>`:""}
    </div>
  </div>
  ${!hideInternal ? `<div class="internal">
    <div class="internal-title">🔒 Usage interne — Non transmis au client</div>
    <div class="internal-grid">
      <div class="int-card"><div class="info-label">Matériel</div><div class="info-value" style="font-size:11px">${fiche.materiels?.join(", ")||"—"}</div></div>
      <div class="int-card"><div class="info-label">Difficulté</div><div class="info-value" style="font-size:11px">${fiche.difficulte||"—"}</div></div>
      ${fiche.tempsInterne?`<div class="int-card"><div class="info-label">Temps</div><div class="info-value" style="font-size:11px">${fiche.tempsInterne}</div></div>`:""}
      ${fiche.tarifHoraire&&fiche.tempsInterne?`<div class="int-card"><div class="info-label">Montant estimé</div><div class="info-value" style="font-size:11px">${calculerMontant(fiche.tempsInterne, fiche.tarifHoraire)} €</div></div>`:""}
      ${fiche.notesInternes?`<div class="int-card" style="grid-column:1/-1"><div class="info-label">Notes</div><div class="info-value" style="font-size:11px;font-weight:400">${fiche.notesInternes}</div></div>`:""}
    </div>
  </div>` : ""}
  <div class="footer">
    <div class="footer-logo">${fiche.societe||"Rapport d'intervention"}</div>
    <div>Généré le ${ts()}</div>
    <div>${fiche.id} — Confidentiel</div>
  </div>
</div></body></html>`;
}

function calculerMontant(temps, tarif) {
  if (!temps || !tarif) return "—";
  const match = temps.match(/(\d+)h(\d+)?/);
  if (!match) return "—";
  const heures = parseInt(match[1]) + (match[2] ? parseInt(match[2])/60 : 0);
  return (heures * parseFloat(tarif)).toFixed(2);
}

function previewReport(fiche) {
  const html = buildReportHTML(fiche);
  const w = window.open("", "_blank");
  if (w?.document) { w.document.open(); w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{try{w.print();}catch(e){}},900); }
}

function downloadReport(fiche) {
  const html = buildReportHTML(fiche);
  const blob = new Blob([html],{type:"text/html"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`Rapport_${fiche.id}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}

function envoyerRapportWhatsApp(fiche) {
  const locStr = formatLoc(fiche.loc);
  const msg = [
    `📋 Rapport d'intervention — ${fiche.id}`,
    `Client : ${fiche.client||"—"}`,
    fiche.adresse ? `Adresse : ${fiche.adresse}` : "",
    locStr ? `Localisation : ${locStr}` : "",
    `Date : ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}`,
    "",
    "Prestations :",
    ...fiche.prestations.map(p => {
      const meta = PRESTATIONS.find(x=>x.id===p.id);
      return `• ${meta?.label}${p.resultats?.length?" — "+p.resultats.join(", "):""}`;
    }),
    fiche.conclusion ? `\nConclusion :\n${fiche.conclusion}` : "",
    `\nTechnicien : ${fiche.technicien||"—"}`,
  ].filter(Boolean).join("\n");
  const num = (fiche.tel||"").replace(/[^0-9+]/g,"");
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
}

function envoyerRapportSMS(fiche) {
  const msg = `Rapport ${fiche.id} — ${fiche.client||"Client"}. Intervention du ${dateFr(fiche.dateRdv)}. Rapport PDF transmis séparément.`;
  const num = (fiche.tel||"").replace(/[^0-9+]/g,"");
  window.location.href = `sms:${num}?&body=${encodeURIComponent(msg)}`;
}

/* ═══════════════════════════════════════════
   SIGNATURE CANVAS
═══════════════════════════════════════════ */
function SignatureCanvas({ onSave, onCancel, title = "Signature client" }) {
  const ref = useRef(); const draw = useRef(false);
  const [has, setHas] = useState(false);
  const pos = (e,c) => { const r=c.getBoundingClientRect(); const s=e.touches?e.touches[0]:e; return{x:(s.clientX-r.left)*(c.width/r.width),y:(s.clientY-r.top)*(c.height/r.height)}; };
  const start = e => { e.preventDefault(); draw.current=true; const c=ref.current; const x=c.getContext("2d"); const p=pos(e,c); x.beginPath(); x.moveTo(p.x,p.y); setHas(true); };
  const move  = e => { e.preventDefault(); if(!draw.current)return; const c=ref.current; const x=c.getContext("2d"); x.strokeStyle="#0f172a"; x.lineWidth=2.5; x.lineCap="round"; const p=pos(e,c); x.lineTo(p.x,p.y); x.stroke(); };
  const end   = () => { draw.current=false; };
  const clr   = () => { ref.current.getContext("2d").clearRect(0,0,ref.current.width,ref.current.height); setHas(false); };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:24,width:420,maxWidth:"100%"}}>
        <div style={{fontWeight:800,fontSize:16,color:"#0f172a",marginBottom:4}}>✍️ {title}</div>
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
   POP-UP TEMPS
═══════════════════════════════════════════ */
function TempsPopup({ onSave, tarifHoraire }) {
  const [temps, setTemps] = useState("");
  const durees = ["30 min","1h","1h30","2h","2h30","3h","4h","Demi-journée","Journée complète"];
  const montant = tarifHoraire && temps ? (() => {
    const m = temps.match(/(\d+)h(\d+)?/);
    if (!m) return null;
    const h = parseInt(m[1]) + (m[2] ? parseInt(m[2])/60 : 0);
    return (h * parseFloat(tarifHoraire)).toFixed(2);
  })() : null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:16,padding:24,width:400,maxWidth:"100%"}}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>⏱️ Temps passé sur place</div>
        <div style={{fontSize:13,color:"#475569",marginBottom:16}}>Renseignez le temps pour faciliter la facturation.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
          {durees.map(d=>(
            <button key={d} onClick={()=>setTemps(d)} style={{padding:"10px 6px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,border:`1.5px solid ${temps===d?"#0EA5E9":"#1E3A5F"}`,background:temps===d?"rgba(14,165,233,0.12)":"#070F1C",color:temps===d?"#0EA5E9":"#64748B",fontFamily:"inherit"}}>
              {d}
            </button>
          ))}
        </div>
        <input value={temps} onChange={e=>setTemps(e.target.value)} placeholder="Ou saisissez (ex: 2h15)" style={{width:"100%",padding:"10px 14px",background:"#070F1C",border:"1.5px solid #1E3A5F",borderRadius:8,color:"#E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:10}}/>
        {montant && <div style={{fontSize:13,color:"#10B981",fontWeight:600,marginBottom:10}}>💰 Montant estimé : {montant} €</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onSave("")} style={{flex:1,padding:"11px",background:"#070F1C",border:"1px solid #1E3A5F",borderRadius:8,color:"#64748B",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Passer</button>
          <button onClick={()=>onSave(temps)} style={{flex:2,padding:"11px",background:"linear-gradient(135deg,#10B981,#059669)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>✓ Valider</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORMULAIRE FICHE — SCROLL UNIQUE
═══════════════════════════════════════════ */
function FicheForm({ initial, onSave, onBack, fiches = [], theme, societes = ["A6T Services"], onAddSociete }) {
  const T = THEMES[theme] || THEMES.dark;
  const isDark = theme === "dark";

  const [f, setF] = useState(() => ({
    client:"", adresse:"", tel:"", email:"", technicien:"",
    dateRdv:today(), heureRdv:"", diametreCanalisation:"",
    societe:"A6T Services",
    prestations:[], responsabilite:"na", preconisations:[],
    conclusion:"", photos:[], signature:null, signatureTech:null,
    nomSignataire:"", materiels:[], difficulte:"",
    tempsInterne:"", tarifHoraire:"", notesInternes:"",
    status:"planifie", loc:{...EMPTY_LOC}, urgent:false,
    ...(initial||{}),
  }));

  const [showSig, setShowSig] = useState(false);
  const [showSigTech, setShowSigTech] = useState(false);
  const [showTemps, setShowTemps] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const [acAdresseOpen, setAcAdresseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingConclusion, setGeneratingConclusion] = useState(false);
  const [generatingNote, setGeneratingNote] = useState(null);
  const fileRef = useRef();
  const acRef = useRef();
  const acAdresseRef = useRef();

  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const toggleArr = (k,v) => setF(p=>({...p,[k]:p[k].includes(v)?p[k].filter(x=>x!==v):[...p[k],v]}));

  // Autocomplétion clients
  const clientsConnus = useMemo(()=>{
    const map={};
    fiches.forEach(f=>{if(f.client)map[f.client.toLowerCase()]={client:f.client,adresse:f.adresse||"",tel:f.tel||"",email:f.email||""};});
    return Object.values(map);
  },[fiches]);

  const adressesConnues = useMemo(()=>{
    const map={};
    fiches.forEach(f=>{if(f.adresse)map[f.adresse.toLowerCase()]=f.adresse;});
    return Object.values(map);
  },[fiches]);

  const clientSuggestions = useMemo(()=>{
    if(!f.client||f.client.length<2)return[];
    return clientsConnus.filter(c=>c.client.toLowerCase().includes(f.client.toLowerCase())).slice(0,5);
  },[f.client,clientsConnus]);

  const adresseSuggestions = useMemo(()=>{
    if(!f.adresse||f.adresse.length<3)return[];
    return adressesConnues.filter(a=>a.toLowerCase().includes(f.adresse.toLowerCase())).slice(0,5);
  },[f.adresse,adressesConnues]);

  useEffect(()=>{
    const h=e=>{
      if(acRef.current&&!acRef.current.contains(e.target))setAcOpen(false);
      if(acAdresseRef.current&&!acAdresseRef.current.contains(e.target))setAcAdresseOpen(false);
    };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // Prestations
  const hasPresta = id => f.prestations.some(p=>p.id===id);
  const togglePresta = id => setF(p=>{
    if(p.prestations.some(x=>x.id===id)) return{...p,prestations:p.prestations.filter(x=>x.id!==id)};
    return{...p,prestations:[...p.prestations,{id,localisations:[],problemes:[],causes:[],constatCamera:[],actions:[],resultats:[],note:""}]};
  });
  const updatePresta = (id,key,val) => setF(p=>({...p,prestations:p.prestations.map(x=>x.id===id?{...x,[key]:val}:x)}));
  const togglePrestaItem = (id,key,val) => setF(p=>({...p,prestations:p.prestations.map(x=>{
    if(x.id!==id)return x;
    const arr=x[key]||[]; return{...x,[key]:arr.includes(val)?arr.filter(y=>y!==val):[...arr,val]};
  })}));

  const readFiles = files => Promise.all([...files].filter(x=>x.type.startsWith("image/")).map(file=>new Promise(res=>{const r=new FileReader();r.onload=e=>res({name:file.name,data:e.target.result});r.readAsDataURL(file);})));
  const addPhotos = async files => { const imgs = await readFiles(files); setF(p=>({...p,photos:[...p.photos,...imgs]})); };

  const handleGenererConclusion = async () => {
    if(f.prestations.length===0)return;
    setGeneratingConclusion(true);
    try {
      const locStr = formatLoc(f.loc);
      const text = await generateConclusionIA(f.prestations, locStr, f.responsabilite);
      set("conclusion", text);
    } catch(e) { alert("Erreur lors de la génération. Vérifiez votre connexion."); }
    finally { setGeneratingConclusion(false); }
  };

  const handleGenererNote = async (prestaId) => {
    const presta = f.prestations.find(p=>p.id===prestaId);
    if(!presta)return;
    setGeneratingNote(prestaId);
    try {
      const locStr = formatLoc(f.loc);
      const text = await generateNotePrestation(presta, locStr);
      updatePresta(prestaId, "note", text);
    } catch(e) { alert("Erreur lors de la génération."); }
    finally { setGeneratingNote(null); }
  };

  const handleSave = () => {
    setSaving(true);
    setShowTemps(true);
  };

  const handleTempsValidated = (temps) => {
    setShowTemps(false);
    const fiche = { ...f, id:f.id||uid(), createdAt:f.createdAt||ts(), tempsInterne:temps||f.tempsInterne };
    onSave(fiche);
    setSaving(false);
  };

  const suggested = suggestPreconisations(f.prestations);

  // Styles dynamiques
  const inpStyle = (err) => ({
    width:"100%", padding:"10px 14px",
    background: T.surface2,
    border:`1.5px solid ${err?"#EF4444":T.border}`,
    borderRadius:8, color:T.text, fontSize:13.5,
    outline:"none", boxSizing:"border-box", fontFamily:"inherit",
  });
  const lblStyle = { display:"block", fontSize:9.5, fontWeight:700, color:T.textMuted, letterSpacing:".08em", textTransform:"uppercase", marginBottom:6 };
  const sectionStyle = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"18px 20px", marginBottom:16 };
  const sectionTitleStyle = { fontSize:13, fontWeight:800, color:T.text, marginBottom:14, display:"flex", alignItems:"center", gap:8, paddingBottom:10, borderBottom:`1px solid ${T.border}` };

  return (
    <div style={{maxWidth:720, margin:"0 auto"}}>
      {showSig && <SignatureCanvas title="Signature client" onSave={d=>{set("signature",d);setShowSig(false);}} onCancel={()=>setShowSig(false)}/>}
      {showSigTech && <SignatureCanvas title="Signature technicien" onSave={d=>{set("signatureTech",d);setShowSigTech(false);}} onCancel={()=>setShowSigTech(false)}/>}
      {showTemps && <TempsPopup onSave={handleTempsValidated} tarifHoraire={f.tarifHoraire}/>}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <div style={{fontWeight:800,fontSize:17,color:T.text}}>{f.id?`Modifier — ${f.id}`:"Nouvelle intervention"}</div>
        <button onClick={handleSave} disabled={saving}
          style={{marginLeft:"auto",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,padding:"9px 22px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(16,185,129,0.3)"}}>
          💾 Enregistrer
        </button>
      </div>

      {/* ── INFOS CLIENT ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>👤 Informations client</div>

        {/* Badge urgence */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"10px 14px",background:f.urgent?"rgba(239,68,68,0.1)":"transparent",border:`1.5px solid ${f.urgent?"#EF4444":T.border}`,borderRadius:8,cursor:"pointer"}} onClick={()=>set("urgent",!f.urgent)}>
          <div style={{width:20,height:20,borderRadius:5,background:f.urgent?"#EF4444":"transparent",border:`2px solid ${f.urgent?"#EF4444":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",flexShrink:0}}>{f.urgent?"✓":""}</div>
          <span style={{fontWeight:700,fontSize:13,color:f.urgent?"#EF4444":T.textMuted}}>🚨 Intervention urgente</span>
        </div>

        {/* Société intervenante */}
        <div style={{marginBottom:14}}>
          <div style={lblStyle}>Société intervenante</div>
          <select value={f.societe||"A6T Services"} onChange={e=>{
            if(e.target.value==="__new__"){
              const nom=prompt("Nom de la nouvelle société :");
              if(nom?.trim()){onAddSociete&&onAddSociete(nom.trim());set("societe",nom.trim());}
            } else {set("societe",e.target.value);}
          }} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
            {societes.map(s=><option key={s} value={s}>{s}</option>)}
            <option value="__new__">➕ Ajouter une société…</option>
          </select>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Client avec autocomplétion */}
          <div style={{gridColumn:"1/-1",position:"relative"}} ref={acRef}>
            <div style={lblStyle}>Client / Société</div>
            <input value={f.client} onChange={e=>{set("client",e.target.value);setAcOpen(true);}} onFocus={()=>setAcOpen(true)}
              placeholder="Nom ou raison sociale" style={inpStyle()} autoComplete="off"/>
            {acOpen&&clientSuggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:T.surface,border:`1.5px solid #0EA5E9`,borderRadius:10,marginTop:4,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
                {clientSuggestions.map((c,i)=>(
                  <div key={i} onClick={()=>{setF(p=>({...p,client:c.client,adresse:c.adresse,tel:c.tel,email:c.email}));setAcOpen(false);}}
                    style={{padding:"10px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(14,165,233,0.08)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{fontWeight:700,fontSize:13,color:T.text}}>🏢 {c.client}</div>
                    {c.adresse&&<div style={{fontSize:11,color:T.textMuted}}>📍 {c.adresse}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Adresse avec autocomplétion */}
          <div style={{gridColumn:"1/-1",position:"relative"}} ref={acAdresseRef}>
            <div style={lblStyle}>Adresse d'intervention</div>
            <input value={f.adresse} onChange={e=>{set("adresse",e.target.value);setAcAdresseOpen(true);}} onFocus={()=>setAcAdresseOpen(true)}
              placeholder="Adresse complète" style={inpStyle()} autoComplete="off"/>
            {acAdresseOpen&&adresseSuggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:T.surface,border:`1.5px solid #0EA5E9`,borderRadius:10,marginTop:4,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
                {adresseSuggestions.map((a,i)=>(
                  <div key={i} onClick={()=>{set("adresse",a);setAcAdresseOpen(false);}}
                    style={{padding:"10px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,fontSize:13,color:T.text}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(14,165,233,0.08)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    📍 {a}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div><div style={lblStyle}>Téléphone</div><input value={f.tel} onChange={e=>set("tel",e.target.value)} placeholder="06 00 00 00 00" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Email</div><input value={f.email} onChange={e=>set("email",e.target.value)} placeholder="email@exemple.fr" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Technicien</div><input value={f.technicien} onChange={e=>set("technicien",e.target.value)} placeholder="Prénom Nom" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Statut</div>
            <select value={f.status} onChange={e=>set("status",e.target.value)} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              {Object.entries(STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div><div style={lblStyle}>Date</div><input type="date" value={f.dateRdv} onChange={e=>set("dateRdv",e.target.value)} style={{...inpStyle(),colorScheme:isDark?"dark":"light"}}/></div>
          <div><div style={lblStyle}>Heure</div><input type="time" value={f.heureRdv} onChange={e=>set("heureRdv",e.target.value)} style={{...inpStyle(),colorScheme:isDark?"dark":"light"}}/></div>
          <div><div style={lblStyle}>Diamètre canalisation (optionnel)</div><input value={f.diametreCanalisation} onChange={e=>set("diametreCanalisation",e.target.value)} placeholder="Ex : DN 100, DN 150…" style={inpStyle()}/></div>
        </div>
      </div>

      {/* ── LOCALISATION PRÉCISE ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📍 Localisation précise <span style={{fontSize:11,fontWeight:400,color:T.textMuted}}>(optionnel)</span></div>
        {formatLoc(f.loc)&&(
          <div style={{background:"rgba(14,165,233,0.08)",border:"1px solid rgba(14,165,233,0.2)",borderRadius:8,padding:"9px 14px",marginBottom:12,fontSize:13,color:"#38BDF8",fontWeight:600}}>
            📍 {formatLoc(f.loc)}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><div style={lblStyle}>Bâtiment — Lettre</div>
            <select value={f.loc.batimentLettre||""} onChange={e=>setF(p=>({...p,loc:{...p.loc,batimentLettre:e.target.value}}))} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              <option value="">—</option>{BATIMENTS.map(l=><option key={l} value={l}>Bât. {l}</option>)}
            </select>
          </div>
          <div><div style={lblStyle}>Bâtiment — Nom</div><input value={f.loc.batimentNom||""} onChange={e=>setF(p=>({...p,loc:{...p.loc,batimentNom:e.target.value}}))} placeholder='Ex : "Les Lilas"' style={inpStyle()}/></div>
          <div><div style={lblStyle}>Étage</div>
            <select value={f.loc.etage||""} onChange={e=>setF(p=>({...p,loc:{...p.loc,etage:e.target.value}}))} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              <option value="">—</option>{ETAGES.map(e=><option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div><div style={lblStyle}>Cage d'escalier</div>
            <select value={f.loc.cage||""} onChange={e=>setF(p=>({...p,loc:{...p.loc,cage:e.target.value}}))} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              <option value="">—</option>{CAGES.map(c=><option key={c} value={c}>Cage {c}</option>)}
            </select>
          </div>
          <div><div style={lblStyle}>Appartement / Local</div><input value={f.loc.appartement||""} onChange={e=>setF(p=>({...p,loc:{...p.loc,appartement:e.target.value}}))} placeholder="N° ou nom" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Position</div>
            <select value={f.loc.position||""} onChange={e=>setF(p=>({...p,loc:{...p.loc,position:e.target.value}}))} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              <option value="">—</option>{POSITIONS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        {formatLoc(f.loc)&&<button onClick={()=>setF(p=>({...p,loc:{...EMPTY_LOC}}))} style={{marginTop:10,fontSize:11,color:T.textMuted,background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>✕ Effacer</button>}
      </div>

      {/* ── PRESTATIONS ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>🔧 Prestations réalisées</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {PRESTATIONS.map(presta=>{
            const active = hasPresta(presta.id);
            const data = f.prestations.find(p=>p.id===presta.id);
            const isOpen = expanded===presta.id;
            const count = data ? (data.localisations?.length||0)+(data.problemes?.length||0)+(data.causes?.length||0)+(data.constatCamera?.length||0)+(data.actions?.length||0)+(data.resultats?.length||0) : 0;

            return (
              <div key={presta.id} style={{border:`1.5px solid ${active?presta.color:T.border}`,borderRadius:10,overflow:"hidden",background:active?presta.color+"0D":T.surface2,transition:"all .2s",cursor:"pointer"}}
                onClick={()=>{if(!active){togglePresta(presta.id);setExpanded(presta.id);}else setExpanded(isOpen?null:presta.id);}}>

                {/* Header ligne */}
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px"}}>
                  <div onClick={e=>{e.stopPropagation();togglePresta(presta.id);if(!active)setExpanded(presta.id);}}
                    style={{width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",background:active?presta.color:"transparent",border:`2px solid ${active?presta.color:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:800}}>
                    {active?"✓":""}
                  </div>
                  <span style={{fontSize:22}}>{presta.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,color:active?presta.color:T.textMuted}}>{presta.label}</div>
                    {active&&count>0&&<div style={{fontSize:11,color:T.textMuted,marginTop:1}}>{count} détail(s) coché(s)</div>}
                  </div>
                  {active&&<span style={{fontSize:12,color:presta.color,fontWeight:700}}>{isOpen?"▲":"▼"}</span>}
                </div>

                {/* Détails dépliés */}
                {active&&isOpen&&(
                  <div style={{padding:"4px 16px 16px",borderTop:`1px solid ${presta.color}22`}} onClick={e=>e.stopPropagation()}>

                    {/* Sections dynamiques */}
                    {[
                      {key:"localisations",icon:"📍",label:"Localisation",opts:presta.localisations},
                      {key:"problemes",icon:"⚠️",label:"Problème constaté",opts:presta.problemes},
                      ...(presta.causes?[{key:"causes",icon:"🔍",label:"Cause du bouchon",opts:presta.causes,badge:"Débouchage"}]:[]),
                      ...(presta.constatCamera?[{key:"constatCamera",icon:"📹",label:"Constat caméra",opts:presta.constatCamera,badge:"Inspection"}]:[]),
                      {key:"actions",icon:"🔨",label:"Action réalisée",opts:presta.actions},
                      {key:"resultats",icon:"✅",label:"Résultat",opts:presta.resultats},
                    ].map(sec=>(
                      <div key={sec.key}>
                        <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 8px",display:"flex",gap:6,alignItems:"center"}}>
                          {sec.icon} {sec.label}
                          {sec.badge&&<span style={{fontSize:9,color:presta.color,background:presta.color+"18",padding:"1px 6px",borderRadius:10,fontWeight:700}}>{sec.badge}</span>}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                          {sec.opts.map(v=>{
                            const on=(data[sec.key]||[]).includes(v);
                            return(
                              <button key={v} onClick={()=>togglePrestaItem(presta.id,sec.key,v)}
                                style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:12.5,fontWeight:on?700:400,textAlign:"left",background:on?presta.color+"16":T.surface2,border:`1.5px solid ${on?presta.color:T.border}`,color:on?presta.color:T.textMuted,transition:"all .15s",fontFamily:"inherit"}}>
                                <span style={{width:14,height:14,borderRadius:4,flexShrink:0,background:on?presta.color:"transparent",border:`2px solid ${on?presta.color:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff"}}>{on?"✓":""}</span>
                                {v}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Note + bouton IA */}
                    <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>🖊 Note (optionnel)</span>
                      <button onClick={()=>handleGenererNote(presta.id)} disabled={generatingNote===presta.id}
                        style={{fontSize:11,color:"#A78BFA",background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                        {generatingNote===presta.id?"⏳ Génération…":"✨ Générer note IA"}
                      </button>
                    </div>
                    <textarea value={data.note||""} onChange={e=>updatePresta(presta.id,"note",e.target.value)}
                      placeholder="Détail libre ou note générée par IA…" rows={2}
                      style={{width:"100%",padding:"10px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,resize:"vertical",lineHeight:1.5,outline:"none",fontFamily:"inherit"}}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RESPONSABILITÉ ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>⚖️ Responsabilité <span style={{fontSize:11,fontWeight:400,color:T.textMuted}}>(Syndic / Copropriété)</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6}}>
          {RESPONSABILITES.map(r=>(
            <button key={r.id} onClick={()=>set("responsabilite",r.id)}
              style={{padding:"10px 8px",borderRadius:8,cursor:"pointer",background:f.responsabilite===r.id?r.color+"22":T.surface2,border:`1.5px solid ${f.responsabilite===r.id?r.color:T.border}`,color:f.responsabilite===r.id?r.color:T.textMuted,fontWeight:700,fontSize:11,textAlign:"center",lineHeight:1.4,fontFamily:"inherit"}}>
              <div style={{fontSize:18,marginBottom:3}}>{r.icon}</div>{r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PRÉCONISATIONS ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>💡 Préconisations</div>
        {suggested.length>0&&(
          <div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.25)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#A78BFA",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              ✨ Suggestions basées sur vos saisies
              <button onClick={()=>{const toAdd=suggested.filter(s=>!f.preconisations.includes(s));setF(p=>({...p,preconisations:[...p.preconisations,...toAdd]}));}}
                style={{fontSize:10,color:"#A78BFA",background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,marginLeft:4}}>
                Tout ajouter
              </button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {suggested.map(s=>{
                const already=f.preconisations.includes(s);
                return(
                  <button key={s} onClick={()=>!already&&setF(p=>({...p,preconisations:[...p.preconisations,s]}))}
                    style={{fontSize:12,fontWeight:600,padding:"5px 12px",borderRadius:20,cursor:already?"default":"pointer",background:already?"rgba(167,139,250,0.2)":"rgba(167,139,250,0.08)",border:`1px solid ${already?"#A78BFA":"rgba(167,139,250,0.3)"}`,color:already?"#A78BFA":"#C4B5FD",fontFamily:"inherit"}}>
                    {already?"✓":"+"}  {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
          {PRECONISATIONS.map(v=>{
            const on=f.preconisations.includes(v);
            return(
              <button key={v} onClick={()=>toggleArr("preconisations",v)}
                style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:12.5,fontWeight:on?700:400,textAlign:"left",background:on?"rgba(167,139,250,0.16)":T.surface2,border:`1.5px solid ${on?"#A78BFA":T.border}`,color:on?"#A78BFA":T.textMuted,fontFamily:"inherit"}}>
                <span style={{width:14,height:14,borderRadius:4,flexShrink:0,background:on?"#A78BFA":"transparent",border:`2px solid ${on?"#A78BFA":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff"}}>{on?"✓":""}</span>
                {v}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONCLUSION ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📝 Conclusion <span style={{fontSize:11,fontWeight:400,color:T.textMuted}}>(visible client)</span></div>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <button onClick={handleGenererConclusion} disabled={generatingConclusion||f.prestations.length===0}
            style={{fontSize:12,fontWeight:700,color:"#A78BFA",background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:8,padding:"7px 14px",cursor:f.prestations.length===0?"not-allowed":"pointer",fontFamily:"inherit",opacity:f.prestations.length===0?0.5:1}}>
            {generatingConclusion?"⏳ Génération en cours…":"✨ Générer conclusion en bon français"}
          </button>
        </div>
        <textarea value={f.conclusion} onChange={e=>set("conclusion",e.target.value)} rows={5}
          placeholder="Rédigez ou cliquez ✨ pour générer automatiquement une conclusion professionnelle…"
          style={{width:"100%",padding:"12px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,resize:"vertical",lineHeight:1.7,outline:"none",fontFamily:"inherit"}}/>
        {f.conclusion&&<div style={{fontSize:11,color:T.textMuted,marginTop:4}}>💡 Vous pouvez modifier le texte librement.</div>}
      </div>

      {/* ── PHOTOS ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📷 Photos</div>
        <div onClick={()=>fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);addPhotos(e.dataTransfer.files);}}
          style={{border:`2px dashed ${dragOver?"#0EA5E9":T.border}`,borderRadius:10,padding:18,textAlign:"center",cursor:"pointer",marginBottom:f.photos.length?10:0}}>
          <div style={{fontSize:26,marginBottom:4}}>📸</div>
          <div style={{fontSize:13,fontWeight:600,color:T.textMuted}}>Glissez ou cliquez — JPG / PNG</div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addPhotos(e.target.files)}/>
        </div>
        {f.photos.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
            {f.photos.map((p,i)=>(
              <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",aspectRatio:"4/3",background:T.surface2}}>
                <img src={p.data} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                <button onClick={()=>set("photos",f.photos.filter((_,j)=>j!==i))} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SIGNATURES ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>✍️ Signatures</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Signature client */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Client</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {f.signature
                ?<div style={{background:"#fff",borderRadius:8,padding:8,border:"1px solid #e2e8f0"}}><img src={f.signature} style={{height:56,display:"block",maxWidth:"100%"}} alt="sig"/></div>
                :<div style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"14px",color:T.textMuted,fontSize:12,textAlign:"center"}}>Aucune signature</div>}
              <button onClick={()=>setShowSig(true)} style={{padding:"8px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✍️ {f.signature?"Modifier":"Signer"}</button>
              {f.signature&&<button onClick={()=>set("signature",null)} style={{padding:"7px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:"#EF4444",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Effacer</button>}
            </div>
            {f.signature&&<div style={{marginTop:8}}><div style={lblStyle}>Nom du signataire</div><input value={f.nomSignataire} onChange={e=>set("nomSignataire",e.target.value)} placeholder="Nom et prénom" style={inpStyle()}/></div>}
          </div>
          {/* Signature technicien */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Technicien</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {f.signatureTech
                ?<div style={{background:"#fff",borderRadius:8,padding:8,border:"1px solid #e2e8f0"}}><img src={f.signatureTech} style={{height:56,display:"block",maxWidth:"100%"}} alt="sig-tech"/></div>
                :<div style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"14px",color:T.textMuted,fontSize:12,textAlign:"center"}}>Aucune signature</div>}
              <button onClick={()=>setShowSigTech(true)} style={{padding:"8px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✍️ {f.signatureTech?"Modifier":"Signer"}</button>
              {f.signatureTech&&<button onClick={()=>set("signatureTech",null)} style={{padding:"7px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:"#EF4444",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Effacer</button>}
            </div>
          </div>
        </div>
      </div>

      {/* ── INTERNE ── */}
      <div style={{...sectionStyle,background:isDark?"rgba(249,115,22,0.06)":theme==="light"?"#FFF7ED":"#FDF2E9",border:`1px dashed rgba(249,115,22,0.4)`}}>
        <div style={{...sectionTitleStyle,color:"#F97316",borderBottomColor:"rgba(249,115,22,0.2)"}}>🔒 Usage interne — Non transmis au client</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{...lblStyle,color:"#7C3D12"}}>Matériel utilisé</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {MATERIELS.map(v=>{
                const on=f.materiels.includes(v);
                return(
                  <button key={v} onClick={()=>toggleArr("materiels",v)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:on?700:400,textAlign:"left",background:on?"rgba(249,115,22,0.16)":T.surface2,border:`1.5px solid ${on?"#F97316":T.border}`,color:on?"#F97316":T.textMuted,fontFamily:"inherit"}}>
                    <span style={{width:14,height:14,borderRadius:4,flexShrink:0,background:on?"#F97316":"transparent",border:`2px solid ${on?"#F97316":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff"}}>{on?"✓":""}</span>
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{...lblStyle,color:"#7C3D12"}}>Difficulté</div>
            <div style={{display:"flex",gap:6}}>
              {["Facile","Normale","Difficile","Très difficile"].map(d=>(
                <button key={d} onClick={()=>set("difficulte",d)}
                  style={{flex:1,padding:"8px 4px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:10,border:`1.5px solid ${f.difficulte===d?"#F97316":T.border}`,background:f.difficulte===d?"rgba(249,115,22,0.15)":T.surface2,color:f.difficulte===d?"#F97316":T.textMuted,fontFamily:"inherit"}}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{...lblStyle,color:"#7C3D12"}}>Tarif horaire (€/h)</div>
            <input value={f.tarifHoraire} onChange={e=>set("tarifHoraire",e.target.value)} placeholder="Ex : 85" style={inpStyle()}/>
          </div>
        </div>
        <div>
          <div style={{...lblStyle,color:"#7C3D12"}}>Notes internes</div>
          <textarea value={f.notesInternes} onChange={e=>set("notesInternes",e.target.value)} placeholder="Observations, à prévoir, notes pour devis…" rows={3} style={{...inpStyle(),resize:"vertical",lineHeight:1.6}}/>
        </div>
      </div>

      {/* Bouton final */}
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:8,marginBottom:32}}>
        <button onClick={handleSave} disabled={saving}
          style={{background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:10,padding:"14px 36px",fontWeight:800,fontSize:16,cursor:"pointer",boxShadow:"0 4px 24px rgba(16,185,129,0.35)",fontFamily:"inherit"}}>
          💾 Enregistrer la fiche
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORMULAIRE RDV RAPIDE
═══════════════════════════════════════════ */
function RdvForm({ initial, onSave, onBack, fiches = [], theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const isDark = theme === "dark";
  const [f, setF] = useState(initial || { client:"", adresse:"", tel:"", technicien:"", dateRdv:today(), heureRdv:"", noteRdv:"", status:"planifie", type:"rdv" });
  const [errors, setErrors] = useState({});
  const set = (k,v) => setF(p=>({...p,[k]:v}));

  const inpStyle = (err) => ({ width:"100%", padding:"10px 14px", background:T.surface2, border:`1.5px solid ${err?"#EF4444":T.border}`, borderRadius:8, color:T.text, fontSize:13.5, outline:"none", boxSizing:"border-box", fontFamily:"inherit" });
  const lblStyle = { display:"block", fontSize:9.5, fontWeight:700, color:T.textMuted, letterSpacing:".08em", textTransform:"uppercase", marginBottom:6 };

  const clients = useMemo(()=>{const map={};fiches.forEach(f=>{if(f.client)map[f.client.toLowerCase()]={client:f.client,adresse:f.adresse||"",tel:f.tel||""};});return Object.values(map);},[fiches]);
  const [acOpen, setAcOpen] = useState(false);
  const acRef = useRef();
  const suggestions = useMemo(()=>{if(!f.client||f.client.length<2)return[];return clients.filter(c=>c.client.toLowerCase().includes(f.client.toLowerCase())).slice(0,5);},[f.client,clients]);
  useEffect(()=>{const h=e=>{if(acRef.current&&!acRef.current.contains(e.target))setAcOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);

  const validate = () => {
    const e = {};
    if(!f.dateRdv) e.dateRdv = "Requis";
    setErrors(e); return Object.keys(e).length===0;
  };

  const envoyerTech = (canal) => {
    const types = (f.typesIntervention||[]).map(id=>PRESTATIONS.find(p=>p.id===id)).filter(Boolean);
    const typesStr = types.length ? types.map(p=>`${p.icon} ${p.label}`).join(" — ") : "";
    const msg = [
      `🔧 Nouveau RDV — Fiche d'intervention`,
      ``,
      `Client : ${f.client||"—"}`,
      `Adresse : ${f.adresse||"—"}`,
      `Date : ${dateFr(f.dateRdv)}${f.heureRdv?" à "+f.heureRdv:""}`,
      typesStr ? `Type : ${typesStr}` : "",
      f.noteRdv ? `Note : ${f.noteRdv}` : "",
      ``,
      `Bonne intervention ! 💪`,
    ].filter(l=>l!==null&&l!==undefined&&(l===""||l.trim()!=="")).join("\n");
    const num = (f.tel||"").replace(/[^0-9+]/g,"");
    if(canal==="whatsapp") window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
    if(canal==="sms") window.location.href=`sms:${num}?&body=${encodeURIComponent(msg)}`;
  };

  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <div style={{fontWeight:800,fontSize:17,color:T.text}}>📅 {initial?.id?"Modifier le RDV":"Nouveau RDV"}</div>
        <button onClick={()=>{if(validate())onSave({...f,id:f.id||uid(),createdAt:f.createdAt||ts(),type:"rdv",status:"planifie",prestations:f.prestations||[],photos:f.photos||[],materiels:f.materiels||[],preconisations:f.preconisations||[]});}}
          style={{marginLeft:"auto",background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          💾 Enregistrer le RDV
        </button>
      </div>

      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px 22px"}}>
        <div style={{background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:20,fontSize:13,color:"#93C5FD",fontWeight:600}}>
          📅 RDV planifié — La fiche complète sera remplie sur place avec le bouton ▶ Démarrer.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{gridColumn:"1/-1",position:"relative"}} ref={acRef}>
            <div style={lblStyle}>Client / Société</div>
            <input value={f.client} onChange={e=>{set("client",e.target.value);setAcOpen(true);}} onFocus={()=>setAcOpen(true)} placeholder="Nom ou raison sociale" style={inpStyle()} autoComplete="off"/>
            {acOpen&&suggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:T.surface,border:"1.5px solid #3B82F6",borderRadius:10,marginTop:4,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
                {suggestions.map((c,i)=>(
                  <div key={i} onClick={()=>{setF(p=>({...p,client:c.client,adresse:c.adresse,tel:c.tel}));setAcOpen(false);}}
                    style={{padding:"10px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,fontSize:13,color:T.text}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,0.08)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    🏢 {c.client}{c.adresse&&<div style={{fontSize:11,color:T.textMuted}}>📍 {c.adresse}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{gridColumn:"1/-1"}}><div style={lblStyle}>Adresse</div><input value={f.adresse} onChange={e=>set("adresse",e.target.value)} placeholder="Adresse complète" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Téléphone client</div><input value={f.tel} onChange={e=>set("tel",e.target.value)} placeholder="06 00 00 00 00" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Technicien assigné</div><input value={f.technicien} onChange={e=>set("technicien",e.target.value)} placeholder="Prénom Nom" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Date *</div><input type="date" value={f.dateRdv} onChange={e=>set("dateRdv",e.target.value)} style={{...inpStyle(errors.dateRdv),colorScheme:isDark?"dark":"light"}}/>{errors.dateRdv&&<div style={{color:"#EF4444",fontSize:11,marginTop:4}}>{errors.dateRdv}</div>}</div>
          <div><div style={lblStyle}>Heure</div><input type="time" value={f.heureRdv} onChange={e=>set("heureRdv",e.target.value)} style={{...inpStyle(),colorScheme:isDark?"dark":"light"}}/></div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={lblStyle}>Type d'intervention</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
              {PRESTATIONS.map(p=>{
                const selected=(f.typesIntervention||[]).includes(p.id);
                return(
                  <button key={p.id} type="button" onClick={()=>{
                    const arr=f.typesIntervention||[];
                    const next=selected?arr.filter(x=>x!==p.id):[...arr,p.id];
                    set("typesIntervention",next);
                  }} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:8,cursor:"pointer",fontWeight:selected?700:400,fontSize:13,textAlign:"left",background:selected?p.color+"16":T.surface2,border:`1.5px solid ${selected?p.color:T.border}`,color:selected?p.color:T.textMuted,fontFamily:"inherit",transition:"all .15s"}}>
                    <span style={{fontSize:18}}>{p.icon}</span>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div style={lblStyle}>Note complémentaire (optionnel)</div>
            <textarea value={f.noteRdv||""} onChange={e=>set("noteRdv",e.target.value)} rows={2}
              placeholder="Accès, code interphone, précisions… ou collez un texte"
              style={{...inpStyle(),resize:"vertical",lineHeight:1.6}}/>
          </div>
        </div>
        {f.technicien&&(
          <div style={{marginTop:20,borderTop:`1px solid ${T.border}`,paddingTop:16}}>
            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".09em",marginBottom:10}}>📤 Notifier le technicien</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={()=>envoyerTech("whatsapp")} style={{padding:"9px 16px",background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🟢 WhatsApp — {f.technicien}</button>
              <button onClick={()=>envoyerTech("sms")} style={{padding:"9px 16px",background:"#334155",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>💬 SMS — {f.technicien}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   APERÇU RAPPORT
═══════════════════════════════════════════ */
function ReportPreview({ fiche, onClose }) {
  const [versionInterne, setVersionInterne] = useState(false);
  const [dl, setDl] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);

  const currentHtml = buildReportHTML(fiche, !versionInterne);
  const tryPrint = () => { const f=document.getElementById("rif"); try{f?.contentWindow?.focus();f?.contentWindow?.print();}catch(e){} };
  const download = () => {
    const html = buildReportHTML(fiche, !versionInterne);
    const blob = new Blob([html],{type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`Rapport_${fiche.id}${versionInterne?"_interne":""}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    setDl(true); setTimeout(()=>setDl(false),2500);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#050C18",zIndex:800,display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",background:"#0A1525",borderBottom:"1px solid #1a3050",flexShrink:0,flexWrap:"wrap"}}>
        <button onClick={onClose} style={{background:"none",border:"1px solid #1a3050",color:"#94A3B8",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Fermer</button>
        <span style={{fontWeight:800,fontSize:14}}>Rapport — {fiche.id}</span>

        {/* Toggle version client / interne */}
        <div style={{display:"flex",gap:4,background:"#070F1C",border:"1px solid #1a3050",borderRadius:8,padding:3}}>
          <button onClick={()=>setVersionInterne(false)} style={{padding:"5px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit",background:!versionInterne?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",color:!versionInterne?"#fff":"#64748B"}}>
            👤 Client
          </button>
          <button onClick={()=>setVersionInterne(true)} style={{padding:"5px 10px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit",background:versionInterne?"linear-gradient(135deg,#F97316,#EF4444)":"transparent",color:versionInterne?"#fff":"#64748B"}}>
            🔒 Interne
          </button>
        </div>

        <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setShowSendOptions(v=>!v)} style={{background:"#0B1829",border:"1px solid #1a3050",color:"#E2E8F0",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📤 Envoyer</button>
          <button onClick={download} style={{background:"#0B1829",border:"1px solid #10B981",color:"#10B981",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{dl?"✓ Téléchargé":"⬇ Fichier"}</button>
          <button onClick={tryPrint} style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🖨 Imprimer / PDF</button>
        </div>
      </div>
      {showSendOptions&&(
        <div style={{background:"#0A1525",borderBottom:"1px solid #1a3050",padding:"12px 16px",display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>envoyerRapportWhatsApp(fiche)} style={{padding:"8px 16px",background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🟢 WhatsApp</button>
          <button onClick={()=>envoyerRapportSMS(fiche)} style={{padding:"8px 16px",background:"#334155",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>💬 SMS</button>
        </div>
      )}
      {!versionInterne&&<div style={{background:"rgba(14,165,233,0.08)",borderBottom:"1px solid rgba(14,165,233,0.2)",padding:"8px 16px",fontSize:12,color:"#38BDF8"}}>
        👤 Version <b>client</b> — section interne masquée
      </div>}
      {versionInterne&&<div style={{background:"rgba(249,115,22,0.08)",borderBottom:"1px solid rgba(249,115,22,0.2)",padding:"8px 16px",fontSize:12,color:"#FB923C"}}>
        🔒 Version <b>interne</b> — toutes les informations visibles
      </div>}
      <div style={{flex:1,background:"#1e2d3d",overflow:"auto",padding:16}}>
        <iframe id="rif" title="Rapport" srcDoc={currentHtml} style={{width:"100%",minHeight:"100%",height:1600,border:"none",borderRadius:10,background:"#fff",boxShadow:"0 12px 60px rgba(0,0,0,0.5)"}}/>
      </div>
      <div style={{padding:"10px 16px",background:"#0A1525",borderTop:"1px solid #1a3050",fontSize:12,color:"#475569",flexShrink:0}}>
        📱 Sur mobile : <b style={{color:"#94A3B8"}}>🖨 Imprimer / PDF</b> → « Enregistrer en PDF »
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TABLEAU DE BORD
═══════════════════════════════════════════ */
function TableauDeBord({ fiches, onNew, onNewRdv, onDemarrer, onSelect, onFilterStatus, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const todayStr = today();
  const rdvPlanifies = fiches.filter(f=>f.type==="rdv"||(f.status==="planifie"&&!f.prestations?.length));
  const byStatus = {};
  Object.keys(STATUTS).forEach(k=>{byStatus[k]=fiches.filter(f=>f.status===k).length;});
  const byPresta = {};
  fiches.forEach(f=>f.prestations?.forEach(p=>{byPresta[p.id]=(byPresta[p.id]||0)+1;}));
  const topPrestas = Object.entries(byPresta).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const techs = {};
  fiches.forEach(f=>{if(f.technicien)techs[f.technicien]=(techs[f.technicien]||0)+1;});

  const card = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"16px 18px" };
  const secHead = { fontSize:10, fontWeight:700, color:T.textMuted, textTransform:"uppercase", letterSpacing:".1em", paddingBottom:7, borderBottom:`1px solid ${T.border}`, marginBottom:12, display:"flex", gap:6 };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* KPIs cliquables */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
        {[
          {label:"Total fiches",val:fiches.length,icon:"📋",color:"#0EA5E9",action:()=>onFilterStatus("")},
          {label:"RDV planifiés",val:rdvPlanifies.length,icon:"📅",color:"#3B82F6",action:()=>onFilterStatus("planifie")},
          {label:"En cours",val:byStatus.en_cours||0,icon:"⚡",color:"#F59E0B",action:()=>onFilterStatus("en_cours")},
          {label:"Terminées",val:byStatus.termine||0,icon:"✅",color:"#10B981",action:()=>onFilterStatus("termine")},
          {label:"Signées",val:fiches.filter(f=>f.signature).length,icon:"✍️",color:"#A78BFA",action:()=>onFilterStatus("")},
        ].map(k=>(
          <div key={k.label} onClick={k.action} style={{...card,border:`1px solid ${k.color}22`,position:"relative",overflow:"hidden",cursor:"pointer",transition:"all .2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=k.color;e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=k.color+"22";e.currentTarget.style.transform="none";}}>
            <div style={{position:"absolute",top:-10,right:-10,fontSize:40,opacity:.06}}>{k.icon}</div>
            <div style={{fontSize:9,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>{k.label}</div>
            <div style={{fontSize:28,fontWeight:800,color:k.color,lineHeight:1}}>{k.val}</div>
            <div style={{fontSize:9,color:k.color,marginTop:4,opacity:.7}}>→ Voir la liste</div>
          </div>
        ))}
      </div>

      {/* RDV à réaliser */}
      {rdvPlanifies.length>0&&(
        <div style={{...card,border:"1.5px solid rgba(59,130,246,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:"#3B82F6",textTransform:"uppercase",letterSpacing:".1em"}}>📅 RDV à réaliser ({rdvPlanifies.length})</div>
            <button onClick={onNewRdv} style={{padding:"5px 12px",background:"none",border:"1px solid #3B82F6",borderRadius:8,color:"#3B82F6",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Nouveau RDV</button>
          </div>
          {rdvPlanifies.sort((a,b)=>((a.dateRdv||"")+(a.heureRdv||"")).localeCompare((b.dateRdv||"")+(b.heureRdv||""))).map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:12,background:T.surface2,borderRadius:10,padding:"11px 14px",border:`1px solid ${T.border}`,marginBottom:6}}>
              <div style={{minWidth:80,textAlign:"center"}}>
                <div style={{fontSize:11,fontWeight:800,color:"#3B82F6"}}>{f.dateRdv?new Date(f.dateRdv).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}):"--/--"}</div>
                <div style={{fontSize:12,fontWeight:700,color:"#60A5FA"}}>{f.heureRdv||"--:--"}</div>
              </div>
              <div style={{width:1,height:32,background:T.border}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.client||"Client non renseigné"}</div>
                <div onClick={()=>f.adresse&&window.open(`https://maps.google.com/?q=${encodeURIComponent(f.adresse)}`,"_blank")}
                  style={{fontSize:11,color:f.adresse?"#0EA5E9":T.textMuted,cursor:f.adresse?"pointer":"default",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:f.adresse?600:400}}>
                  📍 {f.adresse||"—"}{f.adresse?" → GPS":""}
                </div>
                {f.tel&&<a href={`tel:${f.tel}`} style={{fontSize:11,color:"#10B981",fontWeight:600,textDecoration:"none"}}>📞 {f.tel}</a>}
                {f.technicien&&<div style={{fontSize:10,color:T.textMuted}}>👤 {f.technicien}</div>}
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>onSelect(f)} style={{padding:"6px 10px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>👁</button>
                <button onClick={()=>onDemarrer(f)} style={{padding:"6px 14px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>▶ Démarrer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Statuts */}
        <div style={card}>
          <div style={secHead}>📊 Par statut</div>
          {Object.entries(STATUTS).map(([k,v])=>{
            const n=byStatus[k]||0;
            const pct=fiches.length?Math.round(n/fiches.length*100):0;
            return(<div key={k} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:12,fontWeight:600,color:v.color}}>● {v.label}</span>
                <span style={{fontSize:12,fontWeight:700,color:T.text}}>{n}</span>
              </div>
              <div style={{height:5,borderRadius:3,background:T.border,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:v.color,borderRadius:3,transition:"width .5s"}}/>
              </div>
            </div>);
          })}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {topPrestas.length>0&&(
            <div style={{...card,flex:1}}>
              <div style={secHead}>🔧 Top prestations</div>
              {topPrestas.map(([id,n])=>{const m=PRESTATIONS.find(p=>p.id===id);return(
                <div key={id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <span style={{fontSize:18}}>{m?.icon}</span>
                  <span style={{flex:1,fontSize:12,color:T.text}}>{m?.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:m?.color}}>{n}</span>
                </div>
              );})}
            </div>
          )}
          {Object.keys(techs).length>0&&(
            <div style={{...card,flex:1}}>
              <div style={secHead}>👤 Techniciens</div>
              {Object.entries(techs).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,n])=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",background:T.surface2,borderRadius:6,border:`1px solid ${T.border}`,marginBottom:5,fontSize:12}}>
                  <span style={{color:T.text}}>👤 {name}</span>
                  <span style={{fontWeight:700,color:"#0EA5E9"}}>{n}</span>
                </div>
              ))}
            </div>
          )}
          {rdvPlanifies.length===0&&topPrestas.length===0&&(
            <div style={{...card,textAlign:"center",padding:"24px"}}>
              <div style={{fontSize:32,marginBottom:10}}>🚀</div>
              <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Démarrez !</div>
              <div style={{fontSize:12,color:T.textMuted,marginBottom:14}}>Planifiez un RDV ou créez votre première intervention.</div>
              <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                <button onClick={onNewRdv} style={{padding:"8px 14px",background:"none",border:"1px solid #3B82F6",borderRadius:8,color:"#3B82F6",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📅 RDV</button>
                <button onClick={onNew} style={{padding:"8px 14px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Intervention</button>
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
function Agenda({ fiches, onSelect, onDemarrer, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  if(fiches.length===0) return <Empty icon="📅" text="Aucun rendez-vous planifié" T={T}/>;
  const groups = {};
  fiches.forEach(f=>{const k=f.dateRdv||"sans-date";(groups[k]=groups[k]||[]).push(f);});
  const sorted = Object.keys(groups).sort((a,b)=>a==="sans-date"?1:b==="sans-date"?-1:new Date(a)-new Date(b));
  const todayStr = today();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {sorted.map(date=>(
        <div key={date}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{background:date===todayStr?"linear-gradient(135deg,#10B981,#059669)":"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",borderRadius:10,padding:"6px 14px",fontWeight:800,fontSize:13}}>
              {date==="sans-date"?"📌 Sans date":date===todayStr?"📅 Aujourd'hui":dateFr(date)}
            </div>
            <div style={{flex:1,height:1,background:T.border}}/>
            <span style={{fontSize:12,color:T.textMuted}}>{groups[date].length} entrée(s)</span>
          </div>
          {groups[date].sort((a,b)=>(a.heureRdv||"").localeCompare(b.heureRdv||"")).map(fiche=>{
            const isRdv = fiche.type==="rdv"||(fiche.status==="planifie"&&!fiche.prestations?.length);
            const prestas = fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
            return(
              <div key={fiche.id} style={{display:"flex",alignItems:"center",gap:12,background:T.surface,border:`1px solid ${isRdv?"rgba(59,130,246,0.3)":T.border}`,borderRadius:12,padding:"12px 16px",marginBottom:6,transition:"all .2s"}}>
                <div style={{textAlign:"center",minWidth:50,flexShrink:0}}>
                  <div style={{fontSize:15,fontWeight:800,color:isRdv?"#3B82F6":"#0EA5E9"}}>{fiche.heureRdv||"--:--"}</div>
                  <div style={{fontSize:9,fontWeight:700,marginTop:2,color:isRdv?"#3B82F6":STATUTS[fiche.status]?.color}}>{isRdv?"📅 RDV":`● ${STATUTS[fiche.status]?.label}`}</div>
                  {fiche.urgent&&<div style={{fontSize:8,color:"#EF4444",fontWeight:800,marginTop:1}}>🚨 URGENCE</div>}
                </div>
                <div style={{width:1,height:36,background:T.border}}/>
                <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onSelect(fiche)}>
                  <div style={{fontWeight:700,fontSize:14,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fiche.client||"Client non renseigné"}</div>
                  <div style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {fiche.adresse
                      ? <span onClick={e=>{e.stopPropagation();window.open(`https://maps.google.com/?q=${encodeURIComponent(fiche.adresse)}`,"_blank");}} style={{cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>📍 {fiche.adresse}</span>
                      : "📍 —"}
                    {fiche.technicien?` · 👤 ${fiche.technicien}`:""}
                  </div>
                  {fiche.tel&&(
                    <a href={`tel:${fiche.tel}`} onClick={e=>e.stopPropagation()} style={{fontSize:11,color:"#0EA5E9",fontWeight:600,textDecoration:"none"}}>📞 {fiche.tel}</a>
                  )}
                  {isRdv&&fiche.typesIntervention?.length>0&&(
                    <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                      {fiche.typesIntervention.map(id=>{const p=PRESTATIONS.find(x=>x.id===id);return p?<span key={id} style={{fontSize:10,fontWeight:600,color:p.color,background:p.color+"18",padding:"1px 7px",borderRadius:12}}>{p.icon} {p.label}</span>:null;})}
                    </div>
                  )}
                </div>
                {!isRdv&&<div style={{display:"flex",gap:3}}>{prestas.slice(0,3).map((p,i)=><span key={i} style={{fontSize:17}}>{p.icon}</span>)}</div>}
                {isRdv&&<button onClick={()=>onDemarrer(fiche)} style={{padding:"7px 14px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>▶ Démarrer</button>}
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
function ListeCartes({ fiches, onSelect, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  if(fiches.length===0) return <Empty icon="📭" text="Aucune fiche trouvée" T={T}/>;
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
      {fiches.map(fiche=>{
        const prestas=fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
        const main=prestas[0];
        return(
          <div key={fiche.id} onClick={()=>onSelect(fiche)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=main?.color||"#0EA5E9";e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${main?.color||"#0EA5E9"},transparent)`}}/>
            {fiche.urgent&&<div style={{position:"absolute",top:8,right:8,fontSize:10,fontWeight:700,color:"#EF4444",background:"rgba(239,68,68,0.1)",padding:"2px 8px",borderRadius:12}}>🚨 Urgence</div>}
            <div style={{fontFamily:"monospace",fontSize:10,color:"#0EA5E9",fontWeight:700,marginBottom:3}}>{fiche.id}</div>
            <div style={{fontWeight:800,fontSize:15,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fiche.client||"Client non renseigné"}</div>
            <div style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {fiche.adresse||"—"}</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8}}>
              {prestas.map((p,i)=><span key={i} style={{fontSize:11,fontWeight:600,color:p.color,background:p.color+"18",padding:"3px 9px",borderRadius:20}}>{p.icon} {p.label.split(" ")[0]}</span>)}
            </div>
            <div style={{marginTop:10,fontSize:11,borderTop:`1px solid ${T.border}`,paddingTop:8,display:"flex",justifyContent:"space-between",color:T.textMuted}}>
              <span>{fiche.technicien&&`👤 ${fiche.technicien}`}</span>
              <span style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:11,fontWeight:700,color:STATUTS[fiche.status]?.color}}>● {STATUTS[fiche.status]?.label}</span>
                {fiche.signature&&"· ✍️"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   DÉTAIL FICHE
═══════════════════════════════════════════ */
function DetailFiche({ fiche, onBack, onEdit, onDelete, onDemarrer, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [showPreview, setShowPreview] = useState(false);
  const isRdv = fiche.type==="rdv"||(fiche.status==="planifie"&&!fiche.prestations?.length);
  const locStr = formatLoc(fiche.loc);

  const card = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:"18px 22px", marginBottom:14 };
  const secHead = { fontSize:10, fontWeight:700, color:T.textMuted, textTransform:"uppercase", letterSpacing:".1em", paddingBottom:7, borderBottom:`1px solid ${T.border}`, marginBottom:12, display:"flex", gap:6 };

  const Chips = ({items,color}) => (
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      {items.map(v=><span key={v} style={{fontSize:12,fontWeight:600,color,background:color+"15",padding:"4px 10px",borderRadius:20}}>✓ {v}</span>)}
    </div>
  );

  return (
    <div>
      {showPreview&&<ReportPreview fiche={fiche} onClose={()=>setShowPreview(false)}/>}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <code style={{fontSize:12,color:isRdv?"#3B82F6":"#0EA5E9",background:isRdv?"rgba(59,130,246,0.1)":"rgba(14,165,233,0.1)",border:`1px solid ${isRdv?"rgba(59,130,246,0.2)":"rgba(14,165,233,0.2)"}`,padding:"5px 12px",borderRadius:6,fontWeight:700}}>
          {isRdv?"📅 RDV — ":""}{fiche.id}
        </code>
        {fiche.urgent&&<span style={{fontSize:11,fontWeight:700,color:"#EF4444",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",padding:"4px 10px",borderRadius:20}}>🚨 URGENCE</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:7,flexWrap:"wrap"}}>
          <button onClick={onDelete} style={{background:"none",border:"1px solid #7F1D1D",color:"#EF4444",borderRadius:8,padding:"8px 12px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
          <button onClick={onEdit} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✏️ Modifier</button>
          {isRdv?(
            <button onClick={()=>onDemarrer(fiche)} style={{background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>▶ Démarrer l'intervention</button>
          ):(
            <button onClick={()=>setShowPreview(true)} style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📄 Voir le rapport</button>
          )}
        </div>
      </div>

      {/* Carte infos */}
      <div style={card}>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:T.text}}>{fiche.client||"Client non renseigné"}</h2>
        {fiche.adresse&&(
          <div onClick={()=>window.open(`https://maps.google.com/?q=${encodeURIComponent(fiche.adresse)}`,"_blank")}
            style={{color:"#0EA5E9",marginTop:4,cursor:"pointer",fontWeight:600,fontSize:13,display:"flex",alignItems:"center",gap:4}}>
            📍 {fiche.adresse} <span style={{fontSize:11,opacity:.7}}>→ GPS</span>
          </div>
        )}
        {locStr&&<div style={{fontSize:13,color:"#38BDF8",fontWeight:600,marginTop:6,background:"rgba(14,165,233,0.08)",padding:"6px 12px",borderRadius:8,border:"1px solid rgba(14,165,233,0.15)"}}>📍 {locStr}</div>}
        {fiche.tel&&(
          <a href={`tel:${fiche.tel}`} style={{color:"#10B981",fontSize:13,fontWeight:700,marginTop:6,display:"flex",alignItems:"center",gap:4,textDecoration:"none"}}>
            📞 {fiche.tel} <span style={{fontSize:11,opacity:.7}}>→ Appeler</span>
          </a>
        )}
        <div style={{display:"flex",gap:12,marginTop:10,fontSize:12,color:T.textMuted,flexWrap:"wrap"}}>
          {fiche.technicien&&<span>👤 {fiche.technicien}</span>}
          <span>📅 {dateFr(fiche.dateRdv)} {fiche.heureRdv}</span>
          <span style={{color:STATUTS[fiche.status]?.color,fontWeight:700}}>● {STATUTS[fiche.status]?.label}</span>
          {fiche.signature&&<span style={{color:"#10B981",fontWeight:700}}>✍️ Signé{fiche.nomSignataire?` — ${fiche.nomSignataire}`:""}</span>}
        </div>
        {fiche.noteRdv&&isRdv&&<div style={{marginTop:10,background:"rgba(59,130,246,0.08)",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#93C5FD"}}>💬 {fiche.noteRdv}</div>}
      </div>

      {!isRdv&&fiche.prestations?.length>0&&(
        <div style={card}>
          <div style={secHead}>🔧 Prestations ({fiche.prestations.length})</div>
          {fiche.prestations.map(p=>{
            const meta=PRESTATIONS.find(x=>x.id===p.id);
            const hasContent=(p.localisations?.length||0)+(p.problemes?.length||0)+(p.causes?.length||0)+(p.constatCamera?.length||0)+(p.actions?.length||0)+(p.resultats?.length||0)>0||p.note?.trim();
            if(!hasContent)return null;
            return(
              <div key={p.id} style={{background:T.surface2,borderRadius:10,padding:"12px 16px",borderLeft:`4px solid ${meta?.color}`,marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:20}}>{meta?.icon}</span>
                  <span style={{fontWeight:700,fontSize:14,color:meta?.color}}>{meta?.label}</span>
                </div>
                {p.localisations?.length>0&&<div style={{marginBottom:6}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>📍 Localisation</div><Chips items={p.localisations} color={meta.color}/></div>}
                {p.problemes?.length>0&&<div style={{marginBottom:6}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>⚠️ Problème</div><Chips items={p.problemes} color="#F59E0B"/></div>}
                {p.causes?.length>0&&<div style={{marginBottom:6}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>🔍 Cause</div><Chips items={p.causes} color="#F97316"/></div>}
                {p.constatCamera?.length>0&&<div style={{marginBottom:6}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>📹 Constat caméra</div><Chips items={p.constatCamera} color="#06B6D4"/></div>}
                {p.actions?.length>0&&<div style={{marginBottom:6}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>🔨 Action</div><Chips items={p.actions} color="#0EA5E9"/></div>}
                {p.resultats?.length>0&&<div style={{marginBottom:p.note?6:0}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>✅ Résultat</div><Chips items={p.resultats} color="#10B981"/></div>}
                {p.note&&<div style={{background:T.surface,borderRadius:6,padding:"7px 11px",fontSize:12,color:T.text,marginTop:4,fontStyle:"italic"}}>{p.note}</div>}
              </div>
            );
          })}
          {fiche.conclusion&&<div style={{marginTop:12,background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:8,padding:"12px 16px",color:"#6EE7B7",lineHeight:1.7,fontSize:13}}>
            <div style={{fontSize:9,color:"#10B981",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>📝 Conclusion</div>
            {fiche.conclusion}
          </div>}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   APP PRINCIPALE
═══════════════════════════════════════════ */
export default function App() {
  const [fiches, setFiches] = useState([]);
  const [societes, setSocietes] = useState(["A6T Services"]);
  const [theme, setTheme] = useState("dark");
  const [positions, setPositions] = useState({}); // { nomTech: { lat, lng, updatedAt, statut } }
  const [view, setView] = useState("accueil");
  const [nav, setNav] = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [toast, setToast] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showRdvForm, setShowRdvForm] = useState(false);

  const T = THEMES[theme] || THEMES.dark;
  const showToast = m => { setToast(m); setTimeout(()=>setToast(null),3200); };

  useEffect(()=>{
    // Firebase — écoute en temps réel
    const unsub1 = watchFiches(data => { setFiches(data); setLoaded(true); });
    const unsub2 = watchPositions(data => setPositions(data));
    const unsub3 = watchSocietes(data => setSocietes(data));
    return () => { unsub1(); unsub2(); unsub3(); };
  },[]);

  const handleSave = fiche => {
    saveFiche(fiche); // Firebase
    setSelected(fiche); setView("detail"); showToast("✓ Fiche enregistrée");
  };

  const handleSaveRdv = rdv => {
    saveFiche(rdv); // Firebase
    setShowRdvForm(false); setView("accueil"); setNav("agenda"); showToast("📅 RDV planifié !");
  };

  const demarrerIntervention = rdv => {
    setEditing({
      client:rdv.client||"", adresse:rdv.adresse||"", tel:rdv.tel||"",
      technicien:rdv.technicien||"", dateRdv:rdv.dateRdv, heureRdv:rdv.heureRdv||"",
      status:"en_cours", type:"intervention", id:rdv.id,
      createdAt:rdv.createdAt, noteRdv:rdv.noteRdv||"",
      prestations:[], photos:[], materiels:[], preconisations:[],
      responsabilite:"na", conclusion:"", signature:null, signatureTech:null,
      nomSignataire:"", difficulte:"", tempsInterne:"", tarifHoraire:"",
      notesInternes:"", loc:{...EMPTY_LOC}, urgent:false,
    });
    setView("form");
  };

  const handleDelete = id => {
    deleteFiche(id); // Firebase
    setView("accueil"); setSelected(null); showToast("🗑️ Supprimé");
  };

  const filtered = useMemo(()=>{
    let r=fiches;
    if(search) r=r.filter(f=>`${f.client} ${f.adresse} ${f.id} ${f.technicien}`.toLowerCase().includes(search.toLowerCase()));
    if(filterStatus) r=r.filter(f=>f.status===filterStatus);
    return r;
  },[fiches,search,filterStatus]);

  // Géolocalisation — envoie la position toutes les 2 min via Firebase
  useEffect(() => {
    if (!navigator.geolocation) return;
    const techNom = localStorage.getItem("techNom") || "Technicien";
    const sendPos = () => {
      navigator.geolocation.getCurrentPosition(pos => {
        updatePosition(techNom, pos.coords.latitude, pos.coords.longitude);
      }, null, { enableHighAccuracy: true });
    };
    sendPos();
    const interval = setInterval(sendPos, 120000);
    return () => clearInterval(interval);
  }, []);

  const NAV=[{id:"dashboard",label:"📊 Tableau de bord"},{id:"agenda",label:"📅 Agenda"},{id:"liste",label:"🗂️ Liste"},{id:"carte",label:"🗺️ Carte"}];

  // Formulaire RDV plein écran
  if(showRdvForm) return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <header style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 20px",height:58,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:300}}>
        <button onClick={()=>setShowRdvForm(false)} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <div style={{fontWeight:800,fontSize:16,color:T.text}}>📅 Nouveau RDV</div>
      </header>
      <div style={{maxWidth:800,margin:"0 auto",padding:"20px 16px"}}>
        <RdvForm fiches={fiches} onSave={handleSaveRdv} onBack={()=>setShowRdvForm(false)} theme={theme}/>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>

      {/* HEADER */}
      <header style={{background:T.surface,backdropFilter:"blur(12px)",borderBottom:`1px solid ${T.border}`,padding:"0 16px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:300,boxShadow:theme!=="dark"?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
        {/* Logo — icône seulement */}
        <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:"0 4px 14px rgba(14,165,233,0.3)",flexShrink:0}}>🔧</div>

        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {/* Sélecteur de thème */}
          <div style={{display:"flex",gap:2,background:T.surface2,borderRadius:8,padding:3,border:`1px solid ${T.border}`}}>
            {Object.values(THEMES).map(t=>(
              <button key={t.id} onClick={()=>setTheme(t.id)} title={t.label}
                style={{width:24,height:24,borderRadius:6,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:11,
                  background:theme===t.id?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",
                  color:theme===t.id?"#fff":T.textMuted}}>
                {t.id==="dark"?"🌙":t.id==="light"?"☀️":"🌫️"}
              </button>
            ))}
          </div>
          <button onClick={()=>setShowRdvForm(true)} style={{padding:"7px 10px",background:"none",border:`1px solid #3B82F6`,borderRadius:8,color:"#3B82F6",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📅</button>
          <button onClick={()=>{setEditing(null);setView("form");}} style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(14,165,233,0.25)"}}>
            + Nouvelle
          </button>
        </div>
      </header>

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",top:66,right:20,zIndex:500,background:"#10B981",color:"#fff",padding:"11px 18px",borderRadius:10,fontWeight:700,fontSize:13,boxShadow:"0 8px 32px rgba(16,185,129,0.4)",animation:"slideIn .3s ease"}}>{toast}</div>}

      <div style={{maxWidth:1240,margin:"0 auto",padding:"20px 16px"}}>

        {view==="form"&&(
          <FicheForm initial={editing} onSave={handleSave} onBack={()=>setView(selected&&editing?"detail":"accueil")} fiches={fiches} theme={theme} societes={societes} onAddSociete={s=>setSocietes(prev=>[...new Set([...prev,s])])}/>
        )}

        {view==="rdv"&&editing&&(
          <div style={{maxWidth:800,margin:"0 auto"}}>
            <RdvForm initial={editing} fiches={fiches} onSave={handleSaveRdv} onBack={()=>setView("detail")} theme={theme}/>
          </div>
        )}

        {view==="detail"&&selected&&(
          <DetailFiche fiche={selected} theme={theme}
            onBack={()=>setView("accueil")}
            onEdit={()=>{setEditing(selected);setView(selected.type==="rdv"?"rdv":"form");}}
            onDelete={()=>{if(confirm("Supprimer définitivement cette fiche ?"))handleDelete(selected.id);}}
            onDemarrer={()=>demarrerIntervention(selected)}/>
        )}

        {view==="accueil"&&(
          <>
            {/* Navigation */}
            <div style={{display:"flex",gap:3,marginBottom:20,background:T.surface,borderRadius:10,padding:4,border:`1px solid ${T.border}`}}>
              {NAV.map(n=>(
                <button key={n.id} onClick={()=>setNav(n.id)} style={{flex:1,padding:"9px 6px",border:"none",borderRadius:7,fontWeight:700,fontSize:12.5,cursor:"pointer",transition:"all .2s",fontFamily:"inherit",
                  background:nav===n.id?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",
                  color:nav===n.id?"#fff":T.textMuted}}>{n.label}</button>
              ))}
            </div>

            {/* Barre recherche */}
            {nav!=="dashboard"&&(
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{flex:1,minWidth:160,padding:"10px 14px",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                  style={{padding:"10px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"}}>
                  <option value="">Tous statuts</option>
                  {Object.entries(STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                <span style={{fontSize:12,color:T.textMuted}}>{filtered.length}/{fiches.length}</span>
              </div>
            )}

            {nav==="dashboard"&&<TableauDeBord fiches={fiches} theme={theme} onNew={()=>{setEditing(null);setView("form");}} onNewRdv={()=>setShowRdvForm(true)} onDemarrer={demarrerIntervention} onSelect={f=>{setSelected(f);setView("detail");}} onFilterStatus={s=>{setFilterStatus(s);setNav("liste");}}/>}
            {nav==="agenda"&&<Agenda fiches={filtered} theme={theme} onSelect={f=>{setSelected(f);setView("detail");}} onDemarrer={demarrerIntervention}/>}
            {nav==="liste"&&<ListeCartes fiches={filtered} theme={theme} onSelect={f=>{setSelected(f);setView("detail");}}/>}
            {nav==="carte"&&<CarteView fiches={fiches} positions={positions} theme={theme}/>}
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box} textarea,input,select,button{font-family:inherit}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${T.surface}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
        @keyframes spin{to{transform:rotate(360deg)}}
        select option{background:${T.surface};color:${T.text}}
        .leaflet-container{font-family:'DM Sans',sans-serif}
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════
   CARTE GÉOLOCALISATION
═══════════════════════════════════════════ */
function CarteView({ fiches, positions, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const mapRef = useRef();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const todayStr = today();
  const rdvAujourdhui = fiches.filter(f => f.dateRdv === todayStr);

  // Charge Leaflet (carte open source, gratuite, sans clé API)
  useEffect(() => {
    if (document.getElementById("leaflet-css")) { setMapLoaded(true); return; }
    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setMapLoaded(true);
    script.onerror = () => setMapError(true);
    document.head.appendChild(script);
  }, []);

  // Initialise la carte une fois Leaflet chargé
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapError) return;
    const L = window.L;
    if (!L) return;

    // Évite double init
    if (mapRef.current._leaflet_id) return;

    const map = L.map(mapRef.current).setView([46.603354, 1.888334], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);

    // Marqueurs techniciens (positions en temps réel)
    Object.entries(positions).forEach(([nom, pos]) => {
      if (!pos?.lat || !pos?.lng) return;
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff;">👤</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker([pos.lat, pos.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>👤 ${nom}</b><br/>${pos.statut||""}<br/><small>Mis à jour : ${pos.updatedAt||"—"}</small>`);
    });

    // Marqueurs RDV du jour
    rdvAujourdhui.forEach(f => {
      if (!f.adresse) return;
      const presta = f.prestations?.map(p => PRESTATIONS.find(x => x.id === p.id)).filter(Boolean) || [];
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#F97316;color:#fff;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff;">📍 ${f.client||"RDV"}</div>`,
        iconSize: [null, null],
        iconAnchor: [0, 0],
      });
    });

    // Centre sur la France par défaut
    map.setView([46.603354, 1.888334], 6);
  }, [mapLoaded, positions]);

  const techsActifs = Object.entries(positions).filter(([, p]) => p?.lat && p?.lng);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Légende */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#0EA5E9", display: "inline-block" }} />
          {techsActifs.length} technicien(s) localisé(s)
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#F97316", display: "inline-block" }} />
          {rdvAujourdhui.length} RDV aujourd'hui
        </div>
      </div>

      {/* Carte */}
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}`, height: 500 }}>
        {mapError && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", background: T.surface, gap: 12 }}>
            <div style={{ fontSize: 40 }}>🗺️</div>
            <div style={{ fontWeight: 700, color: T.text }}>Carte indisponible</div>
            <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", maxWidth: 300 }}>La carte nécessite une connexion internet. Vérifiez votre connexion.</div>
          </div>
        )}
        {!mapLoaded && !mapError && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: T.surface, gap: 10 }}>
            <div style={{ width: 24, height: 24, border: `3px solid ${T.border}`, borderTopColor: "#0EA5E9", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
            <span style={{ color: T.textMuted, fontSize: 13 }}>Chargement de la carte…</span>
          </div>
        )}
        <div ref={mapRef} style={{ width: "100%", height: "100%", display: mapLoaded && !mapError ? "block" : "none" }} />
      </div>

      {/* Liste techniciens */}
      {techsActifs.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>👤 Positions des techniciens</div>
          {techsActifs.map(([nom, pos]) => (
            <div key={nom} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>👤 {nom}</span>
              <span style={{ fontSize: 11, color: T.textMuted }}>Mis à jour : {pos.updatedAt || "—"}</span>
              <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>● En ligne</span>
            </div>
          ))}
        </div>
      )}

      {techsActifs.length === 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
          <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>Aucun technicien localisé</div>
          <div style={{ fontSize: 13, color: T.textMuted }}>Les techniciens apparaîtront ici quand ils démarreront une intervention depuis leur téléphone.</div>
        </div>
      )}
    </div>
  );
}

function Empty({ icon, text, T }) {
  return <div style={{textAlign:"center",padding:"60px 0",color:T?.textFaint||"#1E3A5F"}}><div style={{fontSize:44,marginBottom:12}}>{icon}</div><div style={{fontWeight:700,color:T?.textMuted||"#334155"}}>{text}</div></div>;
}seState, u
