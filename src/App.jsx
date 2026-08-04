import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getMessaging, getToken, onMessage, isSupported as fcmIsSupported } from "firebase/messaging";
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
const auth = getAuth(app);
// Clé VAPID publique — générée dans Firebase Console > Paramètres > Cloud Messaging.
// Elle n'est pas secrète (contrairement à la clé de compte de service), elle sert juste
// à autoriser ce site à demander des abonnements de notification.
const VAPID_KEY = "BJcB1a-GjltzN9T1dA97q8RDY5vf36sXYDY9Q6xDRWY6oPPk5z5dYKwf8e3CpHo9MHBnc55vih5UWw__rAqWl1g";
const saveNotifToken = (nom, token) => set(ref(db, `fcmTokens/${logoKey(nom)}`), token || null);
const watchNotifLog = (ficheId, cb) => onValue(ref(db, `fiches/${ficheId}/notif`), snap => cb(snap.val()||null));
async function initNotifications(nom) {
  try {
    if (!("Notification" in window)) return { ok:false, reason:"unsupported" };
    const supported = await fcmIsSupported();
    if (!supported) return { ok:false, reason:"unsupported" };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok:false, reason:"denied" };
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return { ok:false, reason:"no-token" };
    await saveNotifToken(nom, token);
    return { ok:true, token };
  } catch (e) {
    console.error("initNotifications error", e);
    return { ok:false, reason:"error", error:String(e) };
  }
}
async function envoyerNotification(technicien, titre, corps, ficheId) {
  try {
    await fetch("/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ technicien, titre, corps, ficheId }),
    });
  } catch (e) { console.error("envoyerNotification error", e); }
}
const sanitize = (o) => JSON.parse(JSON.stringify(o ?? null));
const saveFiche = (fiche) => set(ref(db, `fiches/${fiche.id}`), sanitize(fiche));
const deleteFiche = (id) => remove(ref(db, `fiches/${id}`));
const watchFiches = (cb) => onValue(ref(db, "fiches"), snap => { const d=snap.val(); cb(d?Object.values(d):[]); });
const watchPositions = (cb) => onValue(ref(db, "positions"), snap => cb(snap.val()||{}));
const updatePosition = (nom, lat, lng) => set(ref(db, `positions/${nom}`), { lat, lng, updatedAt: new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}), statut:"En intervention" });
const watchSocietes = (cb) => onValue(ref(db, "societes"), snap => cb(snap.val()||["A6T Services"]));
const saveSocietes = (list) => set(ref(db, "societes"), sanitize(list));
const watchTechniciens = (cb) => onValue(ref(db, "techniciens"), snap => cb(snap.val()||[]));
const watchSousTraitants = (cb) => onValue(ref(db, "sousTraitants"), snap => cb(snap.val()||[]));
const saveSousTraitants = (list) => set(ref(db, "sousTraitants"), sanitize(list));
const saveTechniciens = (list) => set(ref(db, "techniciens"), sanitize(list));
const saveClient = (c) => set(ref(db, `clients/${c.id}`), sanitize(c));
const deleteClient = (id) => remove(ref(db, `clients/${id}`));
const watchClients = (cb) => onValue(ref(db, "clients"), snap => { const d=snap.val(); cb(d?Object.values(d):[]); });
const saveDevisFb = (d) => set(ref(db, `devis/${d.id}`), sanitize(d));
const deleteDevisFb = (id) => remove(ref(db, `devis/${id}`));
const watchDevis = (cb) => onValue(ref(db, "devis"), snap => { const d=snap.val(); cb(d?Object.values(d):[]); });
const saveContrat = (c) => set(ref(db, `contrats/${c.id}`), sanitize(c));
const deleteContrat = (id) => remove(ref(db, `contrats/${id}`));
const watchContrats = (cb) => onValue(ref(db, "contrats"), snap => { const d=snap.val(); cb(d?Object.values(d):[]); });
const logoKey = (nom) => (nom||"").replace(/[.#$/\[\]]/g, "_");
const watchLogos = (cb) => onValue(ref(db, "logos"), snap => cb(snap.val()||{}));
const watchTechTels = (cb) => onValue(ref(db, "techTels"), snap => cb(snap.val()||{}));
const watchTechColors = (cb) => onValue(ref(db, "techColors"), snap => cb(snap.val()||{}));
const saveTechColor = (nom, couleur) => set(ref(db, `techColors/${logoKey(nom)}`), couleur||null);
const watchChamps = (cb) => onValue(ref(db, "champs"), snap => cb(snap.val()||{}));
const saveChamps = (prestaId, cat, liste) => set(ref(db, `champs/${prestaId}/${cat}`), liste ? JSON.parse(JSON.stringify(liste)) : null);
const saveTechTel = (nom, tel) => set(ref(db, `techTels/${logoKey(nom)}`), (tel||"").trim()||null);
const saveTacheFb = (t) => set(ref(db, `taches/${t.id}`), sanitize(t));
const deleteTacheFb = (id) => remove(ref(db, `taches/${id}`));
const watchTaches = (cb) => onValue(ref(db, "taches"), snap => { const d=snap.val(); cb(d?Object.values(d):[]); });
const saveLogo = (nom, dataUrl) => set(ref(db, `logos/${logoKey(nom)}`), dataUrl||null);
const removeLogo = (nom) => remove(ref(db, `logos/${logoKey(nom)}`));

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
    localisations: ["Cuisine","Salle de bain","WC","Sous-sol","Cour","Colonne commune","Gaine technique","Branchement principal","Regard","Siphon de sol","Vide-ordures","Horizontal","Vertical"],
    problemes: ["Bouchon total","Mauvais écoulement","Odeurs","Remontée d'eaux usées","Débordement"],
    causes: ["Corps étranger","Lingettes","Papier épais","Accumulation de graisses","Dépôts calcaires / tartre","Racines / végétation","Effondrement / casse de canalisation","Joint défaillant","Mauvaise pente","Chute de débris (travaux)","Remontée de nappes","Cause indéterminée"],
    actions: ["Par débouchage manuel","Par furet électrique","Par camion hydrocureur","Pompage","Ouverture tampon existant","Remplacement tampon hermétique","Création ouverture sur colonne","Fourniture et pose tampon hermétique neuf","Fermeture colonne","Extraction de corps étranger","Débouchage de vide-ordures","Ramassage des ordures"],
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
    localisations: ["Cuisine","Salle de bain","WC","Sous-sol","Cour","Parking","Local technique","Parties communes","Vide sanitaire"],
    problemes: ["Débordement","Refoulement eaux usées","Inondation","Stagnation","Dépôt de boue","Infiltration"],
    actions: ["Pompage eaux refoulées","Aspiration","Nettoyage des sols","Désinfection","Évacuation déchets","Assèchement","Descente d'homme dans regard","Descente d'homme dans vide sanitaire"],
    resultats: ["Zone nettoyée","Eaux évacuées","Surface désinfectée","Assèchement réalisé","Intervention à poursuivre"],
  },
];
// Mémorise le libellé d'origine de chaque catégorie (pour pouvoir "revenir à l'origine")
PRESTATIONS.forEach(p=>{ p._origLabel = p.label; });
// Applique des libellés personnalisés (venant de Firebase) directement sur les objets PRESTATIONS.
// Comme tout le reste du code lit p.label depuis ces mêmes objets, la personnalisation
// se répercute automatiquement partout (fiches, PDF, listes, agenda…) sans rien modifier ailleurs.
function applyPrestationLabels(overrides={}) {
  PRESTATIONS.forEach(p=>{ p.label = overrides?.[p.id] || p._origLabel; });
}
const watchPrestationLabels = (cb) => onValue(ref(db, "prestationLabels"), snap => cb(snap.val()||{}));
const savePrestationLabel = (id, label) => set(ref(db, `prestationLabels/${id}`), (label||"").trim()||null);

const RESPONSABILITES = [
  { id:"na", label:"Sans objet", icon:"—", color:"#64748B", desc:"—" },
  { id:"privative", label:"Privative", icon:"🏠", color:"#F97316", desc:"À la charge du propriétaire / locataire" },
  { id:"commune", label:"Commune", icon:"🏢", color:"#0EA5E9", desc:"À la charge de la copropriété" },
  { id:"indetermined", label:"Indéterminée", icon:"❓", color:"#F59E0B", desc:"Expertise complémentaire requise" },
];

const PRECONISATIONS = [
  "Passage caméra recommandé","Détartrage recommandé",
  "Prévoir remplacement de tampon de visite",
  "Remplacement canalisations à prévoir",
  "Travaux de reprise à planifier",
  "Vérification étanchéité à prévoir",
  "Entretien régulier recommandé",
  "Devis travaux à établir","Intervention urgente requise",
];

const MATERIELS = ["Furet électrique","Camion hydrocureur","Caméra d'inspection","Haute pression"];

const SOCIETES_DEFAUT = ["A6T Services"];

const STATUTS = {
  planifie:  { label:"Planifié",         color:"#3B82F6", bg:"rgba(59,130,246,0.12)" },
  en_cours:  { label:"En cours",         color:"#F59E0B", bg:"rgba(245,158,11,0.12)" },
  a_prevoir: { label:"Retour à prévoir", color:"#F97316", bg:"rgba(249,115,22,0.12)" },
  termine:   { label:"Terminé",          color:"#10B981", bg:"rgba(16,185,129,0.12)" },
  annule:    { label:"Annulé",           color:"#EF4444", bg:"rgba(239,68,68,0.12)" },
};

// Une fiche "à programmer" = un RDV enregistré sans date
const estAProgrammer = (f) => !f.dateRdv && (f.type==="rdv" || (f.status==="planifie" && !(f.prestations&&f.prestations.length)));

// Palette couleurs techniciens (agenda style Joynit) — utilisée seulement si aucune couleur n'a été choisie manuellement
const TECH_COLORS = ["#0EA5E9","#8B5CF6","#EC4899","#06B6D4","#F97316","#A78BFA","#F59E0B","#EF4444","#14B8A6","#6366F1"];
const techColor = (nom, techniciens=[], techColors={}) => {
  if(!nom) return "#64748B";
  const custom = techColors[logoKey(nom)];
  if(custom) return custom;
  const idx = techniciens.indexOf(nom);
  return TECH_COLORS[idx>=0 ? idx%TECH_COLORS.length : Math.abs(nom.split("").reduce((a,c)=>a+c.charCodeAt(0),0))%TECH_COLORS.length];
};
const ETAGES = ["Sous-sol 2","Sous-sol 1","Rez-de-chaussée","1er étage","2ème étage","3ème étage","4ème étage","5ème étage","6ème étage","7ème étage","8ème étage","9ème étage","10ème étage","11ème étage","12ème étage","13ème étage","14ème étage","15ème étage","16ème étage","17ème étage","18ème étage","19ème étage","20ème étage"];
const CAGES = ["1","2","3","4","5","6","7","8","9","10"];
const POSITIONS = ["Côté gauche","Côté droit","Central","Façade rue","Façade cour","Angle"];
const EMPTY_LOC = { batimentLettre:"", batimentNom:"", etage:"", cage:"", appartement:"", position:"" };

// ─── Helpers ─────────────────────────────────────────
const resizeLogo = (file) => new Promise(res => {
  const r = new FileReader();
  r.onload = e => { const img = new Image(); img.onload = () => {
    const max = 320; const sc = Math.min(1, max / img.width);
    const c = document.createElement("canvas"); c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    res(c.toDataURL("image/png"));
  }; img.src = e.target.result; };
  r.readAsDataURL(file);
});

const DIAMETRES = ["32","40","50","75","80","100","125","150","200","300"];
const PRESTA_DIAMETRE = ["degorgement","hydrocurage","inspection"];
const DEVIS_CATALOGUE = [
  {label:"Curage de colonne EU/EP", unite:"colonne"},
  {label:"Curage réseau horizontal", unite:"ml"},
  {label:"Détartrage de colonne", unite:"colonne"},
  {label:"Détartrage réseau", unite:"ml"},
  {label:"Nettoyage de siphon de parcours", unite:"u"},
  {label:"Nettoyage de regard", unite:"u"},
  {label:"Pompage / nettoyage bac à graisse", unite:"u"},
  {label:"Inspection caméra", unite:"u"},
  {label:"Remplacement tampon de visite", unite:"u"},
  {label:"Débouchage canalisation", unite:"u"},
];
const resizePhoto = (file) => new Promise(res => {
  const r = new FileReader();
  r.onload = e => { const img = new Image(); img.onload = () => {
    const max = 1024; const sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    res({ name: file.name, data: c.toDataURL("image/jpeg", 0.82) });
  }; img.src = e.target.result; };
  r.readAsDataURL(file);
});
const CONTRAT_TYPES = ["Bac à graisse","Poste de relevage","Curage annuel","Entretien copropriété","Autre entretien"];
const FREQUENCES = { mensuel:{label:"Mensuel",mois:1}, bimestriel:{label:"Tous les 2 mois",mois:2}, trimestriel:{label:"Trimestriel",mois:3}, semestriel:{label:"Semestriel",mois:6}, annuel:{label:"Annuel",mois:12} };
const FACTURATION = { a_facturer:{label:"À facturer",color:"#F59E0B"}, facture:{label:"Facturé",color:"#10B981"} };
const addFreq = (dateISO, freq) => { const d = new Date(dateISO+"T12:00:00"); d.setMonth(d.getMonth() + (FREQUENCES[freq]?.mois||12)); return d.toISOString().split("T")[0]; };
const euro = (n) => (isNaN(n)?0:n).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}) + " €";
const uid2   = (p) => p + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(e){ return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
const stripLourd = (f) => { const {photos, signature, signatureTech, logoSociete, ...rest} = f; return {...rest, _nbPhotos:(photos||[]).length, _signee:!!signature}; };
const nextDevisNum = (list=[]) => {
  const y = new Date().getFullYear();
  let max = 0;
  list.forEach(d => { const m = /^DEV-(\d{4})-(\d+)$/.exec(d.id||""); if(m && +m[1]===y && +m[2]>max) max = +m[2]; });
  return `DEV-${y}-${String(max+1).padStart(3,"0")}`;
};
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
    if (causes.some(c => c.includes("racine"))) s.add("Passage caméra recommandé");
    if (causes.some(c => c.includes("effondrement") || c.includes("casse"))) { s.add("Passage caméra recommandé"); s.add("Travaux de reprise à planifier"); }
    if (causes.some(c => c.includes("pente"))) s.add("Travaux de reprise à planifier");
    if (causes.some(c => c.includes("joint"))) s.add("Vérification étanchéité à prévoir");
    if (causes.some(c => c.includes("tampon"))) s.add("Prévoir remplacement de tampon de visite");
    if (resultats.some(r => r.includes("persistant"))) { s.add("Intervention urgente requise"); s.add("Passage caméra recommandé"); }
    if (resultats.some(r => r.includes("rétabli") || r.includes("opérationnel"))) s.add("Entretien régulier recommandé");
    if (p.id === "inspection") s.add("Passage caméra recommandé");
  });
  return [...s];
}

/* ═══════════════════════════════════════════
   GÉNÉRATION CONCLUSION IA
═══════════════════════════════════════════ */
async function generateConclusionIA(prestations, locStr, responsabilite, preconisations = []) {
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

${preconisations.length ? `Préconisations pour l'avenir (travaux ou contrôles RECOMMANDÉS, PAS encore réalisés) : ${preconisations.join(", ")}` : ""}

Règles :
- VOCABULAIRE ABSOLU : utilise EXACTEMENT le nom de prestation fourni ci-dessus, sans JAMAIS le remplacer par un synonyme. "Débouchage" reste "débouchage" (JAMAIS "curage" ni "désengorgement"), "Hydrocurage" reste "hydrocurage", "Détartrage" reste "détartrage", "Pompage" reste "pompage". Ce sont des prestations DIFFÉRENTES, facturées différemment : les confondre est une faute professionnelle grave.
- SOBRIÉTÉ ABSOLUE : décris UNIQUEMENT et FACTUELLEMENT ce qui a été fait. N'AJOUTE RIEN qui ne soit pas explicitement dans les informations fournies. N'invente aucun détail.
- N'AJOUTE AUCUN commentaire sur l'hygiène, la salubrité, la santé, les risques sanitaires, le confort, la conformité, la sécurité ou la "tranquillité" du client. Pas de phrases de remplissage ni de considérations générales.
- Reste neutre et professionnel : pas de superlatifs, pas de dramatisation, pas de formules commerciales exagérées ("intervention minutieuse", "travail soigné", "remise en état optimale"... à BANNIR).
- Rédige UN seul paragraphe court et fluide
- Commence par "Suite à notre intervention"
- Mentionne le lieu seulement s'il est fourni
- Résume simplement les actions et leur résultat
- Ne présente JAMAIS une préconisation comme une action réalisée. Seules les lignes "Actions" ont été effectuées. Les préconisations sont introduites par "nous préconisons" ou "nous recommandons", au futur ou au conditionnel, et seulement si elles sont fournies
- Si aucune inspection caméra ne figure dans les Actions, n'affirme pas qu'un passage caméra a eu lieu
- Termine par une formule de politesse courte et simple
- Maximum 4 phrases. Si peu d'informations sont fournies, fais encore plus court.
- NE PAS lister les prestations séparément, faire un texte coulant`;

  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || data?.error || "Erreur API");
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
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || data?.error || "Erreur API");
  return data.content?.[0]?.text || "";
}

/* ═══════════════════════════════════════════
   RAPPORT PDF
═══════════════════════════════════════════ */
function telechargerPDF(html, filename) {
  // Méthode universelle : on ouvre le rapport dans un onglet propre avec une barre d'action.
  // Le bouton déclenche l'impression native du navigateur -> "Enregistrer au format PDF".
  // Fonctionne sur PC et mobile, sans dépendance externe (donc rien qui puisse casser).
  const w = window.open("", "_blank");
  if (!w) { alert("Veuillez autoriser les fenêtres pop-up pour ce site, puis réessayez."); return; }
  const titre = (filename || "rapport").replace(/\.pdf$/i, "");
  const barre = `
<div data-print-hide="1" style="position:sticky;top:0;z-index:99999;background:#0B1829;padding:12px;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;font-family:Arial,sans-serif;">
  <button onclick="window.close()" style="background:none;color:#94A3B8;border:1px solid #334155;border-radius:8px;padding:12px 18px;font-weight:800;font-size:14px;cursor:pointer;">← Retour à l'application</button>
  <button onclick="window.print()" style="background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;border:none;border-radius:8px;padding:12px 24px;font-weight:800;font-size:14px;cursor:pointer;">📄 Enregistrer en PDF / Imprimer</button>
  <span style="color:#94A3B8;font-size:12px;">Choisissez « Enregistrer au format PDF » comme imprimante</span>
</div>
<style>@media print{[data-print-hide]{display:none !important}}</style>`;
  let doc;
  if (html.includes("</body>")) {
    doc = html.replace(/<body([^>]*)>/i, "<body$1>" + barre);
    if (doc === html) doc = html.replace("</body>", barre + "</body>");
  } else {
    doc = barre + html;
  }
  // Forcer un titre propre pour le nom du fichier PDF proposé par le navigateur
  if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, `<title>${titre}</title></head>`);
  w.document.open();
  w.document.write(doc);
  w.document.close();
  w.focus();
}

const MAJORATIONS_LABEL = { soir50:"Majoration soirée +50 %", weekend100:"Majoration nuit / week-end +100 %" };
function majorationsTexte(fiche){ return (fiche.majorations||[]).map(m=>MAJORATIONS_LABEL[m]).filter(Boolean); }

function buildReportHTML(fiche, hideInternal = false) {
  const resp = RESPONSABILITES.find(r => r.id === fiche.responsabilite);
  const presta = fiche.prestations.map(p => ({ ...p, meta: PRESTATIONS.find(x => x.id === p.id) }));
  const status = STATUTS[fiche.status] || STATUTS.planifie;
  const locStr = formatLoc(fiche.loc);
  const isUrgent = fiche.urgent;
  // Résultat principal pour l'encart vert de l'en-tête (1er résultat trouvé sur les prestations)
  let resultatPrincipal = null;
  if (fiche.status === "termine") {
    for (const p of (fiche.prestations||[])) {
      if (p.resultats && p.resultats.length) { resultatPrincipal = p.resultats[0]; break; }
    }
    if (!resultatPrincipal) resultatPrincipal = true; // afficher "Intervention terminée" seul
  }

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
          <span class="presta-title" style="color:${p.meta?.color}">${p.meta?.label}${p.diametre?` — Ø ${p.diametre} mm`:""}</span>
        </div>
        <div class="presta-body">
          ${sentences.map(s=>`<p class="phrase">${s}</p>`).join("")}
        </div>
      </div>`;
    }).join("");

  const photoSection = (titre, liste) => liste.length
    ? `<div class="photo-subtitle">${titre} (${liste.length})</div><div class="photo-grid">${liste.map(p=>`<div class="photo-item"><img src="${p.data}" alt=""/></div>`).join("")}</div>` : "";
  const photosOntTag = fiche.photos?.some(p=>p.tag);
  const photoGrid = fiche.photos?.length
    ? `<div class="section-block"><div class="section-title">📷 Photos (${fiche.photos.length})</div>
       ${photosOntTag
         ? photoSection("Avant travaux", fiche.photos.filter(p=>p.tag==="avant")) + photoSection("Après travaux", fiche.photos.filter(p=>p.tag==="apres")) + photoSection("Autres photos", fiche.photos.filter(p=>!p.tag))
         : `<div class="photo-grid">${fiche.photos.map(p=>`<div class="photo-item"><img src="${p.data}" alt=""/></div>`).join("")}</div>`}
       </div>` : "";

  const sigBoxes = [];
  if (fiche.signatureTech) sigBoxes.push(`<div class="sig-box"><div class="sig-box-label">Signature technicien</div><img src="${fiche.signatureTech}" class="sig-img"/><div class="sig-name">${fiche.technicien||"Technicien"}</div></div>`);
  if (fiche.signature) sigBoxes.push(`<div class="sig-box"><div class="sig-box-label">Signature client — Bon pour accord</div><img src="${fiche.signature}" class="sig-img"/>${fiche.nomSignataire?`<div class="sig-name">${fiche.nomSignataire}</div>`:""}</div>`);
  const sigZone = sigBoxes.length ? `<div class="sig-zone" style="grid-template-columns:repeat(${sigBoxes.length},1fr)">${sigBoxes.join("")}</div>` : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Rapport ${fiche.id}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;color:#0f172a;background:#fff;font-size:12px;line-height:1.7}
.header{position:relative;background:linear-gradient(120deg,#0a1c3a 0%,#102b54 55%,#16356b 100%);padding:30px 34px;border-radius:0 0 26px 26px;overflow:hidden}

.header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;position:relative;z-index:1}
.brand{display:flex;align-items:center;gap:13px}
.brand-logo{background:#fff;border-radius:11px;padding:6px;width:54px;height:54px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.brand-logo img{max-width:100%;max-height:100%;display:block}
.brand-name{font-family:'Fraunces',serif;font-size:17px;font-weight:800;color:#fff}
.report-title{font-family:'Fraunces',serif;font-size:25px;font-weight:900;color:#fff;margin-top:18px;position:relative;z-index:1;line-height:1.15}
.report-subtitle{font-size:12px;color:#9fc4f0;margin-top:5px;position:relative;z-index:1}
.result-pill{display:inline-flex;align-items:center;gap:9px;margin-top:18px;background:rgba(16,185,129,0.16);border:1px solid rgba(16,185,129,0.45);border-radius:30px;padding:9px 18px;position:relative;z-index:1}
.result-pill .dot{width:18px;height:18px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900}
.result-pill .txt{font-size:12.5px;font-weight:700;color:#6ee7b7}
.result-pill .txt b{color:#fff;font-weight:800}
.ref-card{background:rgba(8,20,42,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:15px 18px;min-width:188px}
.ref-label{font-size:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#7fb0e6;background:rgba(56,189,248,0.16);display:inline-block;padding:2px 8px;border-radius:5px;margin-bottom:7px}
.ref-id{font-family:'Fraunces',serif;font-size:20px;font-weight:900;color:#fff;border-bottom:1px solid rgba(255,255,255,0.13);padding-bottom:11px;margin-bottom:11px}
.ref-row{display:flex;align-items:center;gap:9px;margin-bottom:9px}
.ref-row .ic{font-size:12px;opacity:.8}
.ref-row .rl{font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7fb0e6;line-height:1.3}
.ref-row .rv{font-size:12px;font-weight:700;color:#fff;line-height:1.3}
.ref-status{display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.13);padding-top:11px;margin-top:3px}
.ref-status .sl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7fb0e6}
.status-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:9px;font-weight:800;text-transform:uppercase;background:${status.bg};color:${status.color};border:1px solid ${status.color}55}
.urgent-badge{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid #EF444466}
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
.photo-subtitle{font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.4px;margin:10px 0 6px}
.photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.photo-item{border-radius:8px;overflow:hidden;aspect-ratio:4/3;border:1px solid #e2e8f0;max-height:160px;background:#f1f5f9;display:flex;align-items:center;justify-content:center}
.photo-item img{width:100%;height:100%;object-fit:contain;display:block;max-height:160px}
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
  <div class="header-top">
    <div>
      <div class="brand">
        ${fiche.logoSociete?`<div class="brand-logo"><img src="${fiche.logoSociete}" alt=""/></div>`:""}
        <div class="brand-name">${fiche.societe||"A6T Services"}</div>
      </div>
      <div class="report-title">Rapport d'intervention technique</div>
      <div class="report-subtitle">Rapport généré après intervention sur site</div>
    </div>
    <div class="ref-card">
      <div class="ref-label">Référence</div>
      <div class="ref-id">${fiche.id}</div>
      <div class="ref-row"><span class="ic">📅</span><div><div class="rl">Date</div><div class="rv">${dateFr(fiche.dateRdv)}</div></div></div>
      ${fiche.heureRdv?`<div class="ref-row"><span class="ic">🕐</span><div><div class="rl">Heure</div><div class="rv">${fiche.heureRdv}</div></div></div>`:""}
      <div class="ref-status"><span class="sl">Statut</span><span class="status-badge">${fiche.status==="a_prevoir"?"⚠":fiche.status==="annule"?"✕":"✓"} ${status.label}</span></div>
      ${isUrgent?'<span class="urgent-badge">🚨 URGENCE</span>':""}
    </div>
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
  ${majorationsTexte(fiche).length?`<div class="section-block"><div class="section-title">⏰ Conditions d'intervention</div><ul class="preco-list">${majorationsTexte(fiche).map(t=>`<li>${t}</li>`).join("")}</ul></div>`:""}
  ${photoGrid}
  ${sigZone}
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

function buildFacturationTexte(fiche) {
  const presta = (fiche.prestations||[]).map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean);
  const match = (fiche.tempsInterne||"").match(/(\d+)h(\d+)?/);
  const heures = match ? parseInt(match[1]) + (match[2]?parseInt(match[2])/60:0) : 0;
  const tarif = parseFloat(fiche.tarifHoraire)||0;
  let coefMaj = 1; const majLignes = [];
  (fiche.majorations||[]).forEach(m=>{
    if(m==="soir50"){coefMaj+=0.5; majLignes.push("Majoration soirée (+50%) incluse dans le calcul ci-dessous");}
    if(m==="weekend100"){coefMaj+=1; majLignes.push("Majoration weekend/nuit (+100%) incluse dans le calcul ci-dessous");}
  });
  const montantHT = heures*tarif*coefMaj;
  const tva = 10;
  const montantTVA = montantHT*tva/100;
  const montantTTC = montantHT+montantTVA;

  const L = [];
  L.push(`PROPOSITION DE FACTURATION — ${fiche.id}`);
  L.push(`Client : ${fiche.client||"—"}`);
  if(fiche.adresse) L.push(`Adresse : ${fiche.adresse}`);
  L.push(`Date d'intervention : ${dateFr(fiche.dateRdv)}`);
  if(fiche.technicien) L.push(`Technicien : ${fiche.technicien}`);
  L.push("");
  L.push("DESCRIPTION DES PRESTATIONS");
  if(presta.length) presta.forEach(p=>L.push(`- ${p.label}`));
  else L.push("- (aucune prestation cochée sur la fiche)");
  if(fiche.conclusion) { L.push(""); L.push(`Résumé de l'intervention : ${fiche.conclusion}`); }
  L.push("");
  L.push("DÉTAIL FACTURATION");
  if(heures>0 && tarif>0) L.push(`Main d'œuvre : ${heures} h × ${euro(tarif)}/h = ${euro(heures*tarif)}`);
  else L.push("Main d'œuvre : à compléter — temps passé ou tarif horaire non renseigné sur la fiche");
  majLignes.forEach(m=>L.push(m));
  L.push("");
  L.push(`Sous-total HT : ${euro(montantHT)}`);
  L.push(`TVA (${tva} %) : ${euro(montantTVA)}`);
  L.push(`TOTAL TTC : ${euro(montantTTC)}`);
  L.push("");
  L.push("⚠️ À vérifier avant saisie dans Pennylane : matériel/fournitures, frais de déplacement, remise éventuelle — non inclus automatiquement.");
  return L.join("\n");
}

function FacturationModal({ fiche, onClose, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [copied, setCopied] = useState(false);
  const texte = buildFacturationTexte(fiche);
  const copier = async () => {
    try { await navigator.clipboard.writeText(texte); setCopied(true); setTimeout(()=>setCopied(false),2000); }
    catch(e) { alert("Impossible de copier automatiquement — sélectionnez le texte manuellement."); }
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:520,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>💶 Proposition de facturation</div>
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:14}}>À vérifier, puis copier pour saisie manuelle dans Pennylane.</div>
        <textarea readOnly value={texte} rows={16}
          style={{width:"100%",padding:"12px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12.5,outline:"none",fontFamily:"monospace",resize:"vertical",boxSizing:"border-box",marginBottom:14,lineHeight:1.6}}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
          <button onClick={copier} style={{flex:2,padding:"12px",background:copied?"linear-gradient(135deg,#10B981,#059669)":"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{copied?"✓ Copié !":"📋 Copier le texte"}</button>
        </div>
      </div>
    </div>
  );
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

function ficheManques(fiche) {
  const m = [];
  if(!(fiche.prestations||[]).length) m.push("Aucune prestation renseignée");
  (fiche.prestations||[]).forEach(p=>{
    const meta = PRESTATIONS.find(x=>x.id===p.id);
    if(!(p.resultats||[]).length && !(p.constatCamera||[]).length) m.push(`Résultat manquant — ${meta?.label||p.id}`);
  });
  if(!fiche.conclusion?.trim()) m.push("Conclusion manquante");
  if(!fiche.signature) m.push("Signature client manquante");
  if(!fiche.signatureTech) m.push("Signature technicien manquante");
  if(!(fiche.photos||[]).length) m.push("Aucune photo");
  if(!fiche.tempsInterne?.trim()) m.push("Temps passé non renseigné");
  return m;
}

function buildSousTraitantTexte(fiche) {
  const types = (fiche.typesIntervention||fiche.prestations||[]).map(x=>{
    const id = typeof x==="object" ? x.id : x;
    return PRESTATIONS.find(p=>p.id===id);
  }).filter(Boolean);
  const typesStr = types.length ? types.map(p=>`${p.icon} ${p.label}`).join(" — ") : "";
  const locStr = formatLoc(fiche.loc);
  return [
    `🔧 Intervention à réaliser — ${fiche.id}`,
    ``,
    `Client : ${fiche.client||"—"}`,
    fiche.adresse ? `Adresse : ${fiche.adresse}` : "",
    locStr ? `Localisation : ${locStr}` : "",
    fiche.tel ? `Téléphone client : ${fiche.tel}` : "",
    `Date : ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}`,
    typesStr ? `Type : ${typesStr}` : "",
    fiche.noteRdv ? `Note : ${fiche.noteRdv}` : "",
    fiche.notesInternes ? `Détails : ${fiche.notesInternes}` : "",
    ``,
    `Merci de confirmer la prise en charge 🙏`,
  ].filter(l=>l!==null&&l!==undefined&&(l===""||l.trim()!=="")).join("\n");
}

function envoyerAuNumero(num, msg) {
  const clean = (num||"").replace(/[^0-9]/g,"");
  window.open(clean?`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");
}

function ProfilModal({ techniciens=[], techNom, onSaveTechNom, onClose, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [nom, setNom] = useState(techNom||"");
  const [statut, setStatut] = useState(null); // null | "loading" | "ok" | "denied" | "unsupported" | "error"
  const activer = async () => {
    if(!nom.trim()){ alert("Choisissez d'abord votre nom."); return; }
    onSaveTechNom(nom.trim());
    setStatut("loading");
    const res = await initNotifications(nom.trim());
    if(res.ok) setStatut("ok");
    else if(res.reason==="denied") setStatut("denied");
    else if(res.reason==="unsupported") setStatut("unsupported");
    else setStatut("error");
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:420,maxWidth:"100%"}}>
        <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>👤 Cet appareil</div>
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:14}}>Indiquez qui utilise ce téléphone pour recevoir vos notifications et votre position sur la carte.</div>

        <div style={{fontSize:11,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Votre nom</div>
        <select value={nom} onChange={e=>setNom(e.target.value)}
          style={{width:"100%",padding:"10px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:16,boxSizing:"border-box",cursor:"pointer"}}>
          <option value="">— Choisir —</option>
          {techniciens.map(t=><option key={t} value={t}>{t}</option>)}
        </select>

        {statut==="ok"&&<div style={{fontSize:12.5,color:"#10B981",fontWeight:700,marginBottom:12}}>✓ Notifications activées sur cet appareil.</div>}
        {statut==="denied"&&<div style={{fontSize:12.5,color:"#EF4444",fontWeight:700,marginBottom:12}}>✕ Notifications refusées — autorisez-les dans les réglages de votre téléphone/navigateur pour ce site, puis réessayez.</div>}
        {statut==="unsupported"&&<div style={{fontSize:12.5,color:"#F59E0B",fontWeight:700,marginBottom:12}}>⚠️ Notifications non disponibles sur cet appareil/navigateur (sur iPhone : installez l'app sur l'écran d'accueil d'abord, voir "Partager → Sur l'écran d'accueil").</div>}
        {statut==="error"&&<div style={{fontSize:12.5,color:"#EF4444",fontWeight:700,marginBottom:12}}>✕ Une erreur est survenue. Réessayez.</div>}

        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
          <button onClick={activer} disabled={statut==="loading"} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit",opacity:statut==="loading"?0.6:1}}>{statut==="loading"?"…":"🔔 Activer les notifications"}</button>
        </div>
      </div>
    </div>
  );
}

function SousTraitantModal({ fiche, sousTraitants=[], onSaveSousTraitants, onClose, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const msg = buildSousTraitantTexte(fiche);
  const envoyer = (num) => { envoyerAuNumero(num, msg); onClose(); };
  const ajouterEtEnvoyer = () => {
    if(!tel.trim()){ alert("Entrez au moins un numéro."); return; }
    const next = [...sousTraitants, { nom: nom.trim()||tel.trim(), tel: tel.trim() }];
    onSaveSousTraitants(next);
    envoyer(tel.trim());
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:440,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>📤 Envoyer au sous-traitant</div>
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:14}}>Choisissez un sous-traitant enregistré, ou saisissez un nouveau numéro.</div>

        {sousTraitants.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
            {sousTraitants.map((s,i)=>(
              <button key={i} onClick={()=>envoyer(s.tel)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"10px 14px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                <span>{s.nom}</span>
                <span style={{color:"#25D366",fontSize:12,fontWeight:700}}>🟢 {s.tel}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{fontSize:11,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Nouveau numéro</div>
        <input value={nom} onChange={e=>setNom(e.target.value)} placeholder="Nom (optionnel)"
          style={{width:"100%",padding:"10px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:8,boxSizing:"border-box"}}/>
        <input value={tel} onChange={e=>setTel(e.target.value)} placeholder="N° WhatsApp (33612345678)"
          style={{width:"100%",padding:"10px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:14,boxSizing:"border-box"}}/>

        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
          <button onClick={ajouterEtEnvoyer} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#25D366,#128C7E)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>💾 Enregistrer &amp; envoyer</button>
        </div>
      </div>
    </div>
  );
}

function relancerTechnicien(fiche, techTels = {}, onSaveTel = null) {
  const manques = ficheManques(fiche);
  const msg = [
    `🔔 Rappel — Fiche ${fiche.id} à compléter`,
    `Client : ${fiche.client||"—"}`,
    fiche.adresse ? `Adresse : ${fiche.adresse}` : "",
    `Date : ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}`,
    fiche.technicien ? `Technicien : ${fiche.technicien}` : "",
    ``,
    manques.length ? `Il manque :` : `La fiche n'est pas validée.`,
    ...manques.map(x=>`• ${x}`),
    ``,
    `Merci de compléter la fiche dès que possible 🙏`,
  ].filter(l=>l!==null&&l!==undefined&&(l===""||l.trim()!=="")).join("\n");
  let num = fiche.technicien ? (techTels[logoKey(fiche.technicien)]||"") : "";
  if(!num && fiche.technicien && onSaveTel){
    const saisie = window.prompt(`Numéro WhatsApp de ${fiche.technicien} ?\n(Format international conseillé : 33612345678)\nIl sera mémorisé pour les prochaines relances. Laissez vide pour choisir le contact à la main.`);
    if(saisie&&saisie.trim()){ num = saisie.replace(/[^0-9+]/g,""); onSaveTel(fiche.technicien, num); }
  }
  window.open(num?`https://wa.me/${num.replace(/[^0-9]/g,"")}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");
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
   DEVIS — document HTML
═══════════════════════════════════════════ */
function devisTotaux(devis) {
  if (devis.modeForfait) {
    const ht = parseFloat(devis.forfaitPrixHT)||0;
    const tva = ht*((parseFloat(devis.tva)||0)/100);
    return { ht, tva, ttc: ht+tva };
  }
  const ht = (devis.lignes||[]).reduce((s,l)=>s+(parseFloat(l.qte)||0)*(parseFloat(l.pu)||0),0);
  const tva = ht*((parseFloat(devis.tva)||0)/100);
  return { ht, tva, ttc: ht+tva };
}

function buildDevisHTML(devis) {
  const { ht, tva, ttc } = devisTotaux(devis);
  const lignesHTML = devis.modeForfait
    ? `<tr><td colspan="2">${devis.forfaitLabel||"Forfait"}</td><td class="r" colspan="2" style="font-weight:800;color:#7C3AED">${euro(parseFloat(devis.forfaitPrixHT)||0)} HT</td></tr>`
    : (devis.lignes||[]).filter(l=>l.label?.trim()).map(l=>{
    const tot=(parseFloat(l.qte)||0)*(parseFloat(l.pu)||0);
    return `<tr><td>${l.label}</td><td class="c">${l.qte}</td><td class="r">${euro(parseFloat(l.pu)||0)}</td><td class="r">${euro(tot)}</td></tr>`;
  }).join("");
  const photosHTML = devis.photos?.length
    ? `<div class="section-title">📷 Photos</div><div class="pgrid">${devis.photos.map(p=>`<div class="pitem"><img src="${p.data||p}"/></div>`).join("")}</div>` : "";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>Devis ${devis.id}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;color:#0f172a;background:#fff;font-size:12px;line-height:1.7}
.header{background:#0a1628;display:grid;grid-template-columns:1fr auto}
.hl{padding:26px 32px}.logo{font-family:'Fraunces',serif;font-size:14px;font-weight:700;color:#94a3b8}
.title{font-family:'Fraunces',serif;font-size:24px;font-weight:900;color:#fff;margin-top:4px}
.hr{background:#38bdf8;padding:26px 32px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;min-width:190px}
.lab{font-size:8px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:rgba(10,22,40,.6)}
.num{font-family:'Fraunces',serif;font-size:18px;font-weight:900;color:#0a1628}
.dat{font-size:11px;font-weight:600;color:#0a1628;margin-top:4px;opacity:.75}
.body{padding:28px 32px}
.cgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}
.icard{background:#f8fafc;border-radius:8px;padding:10px 14px;border:1px solid #e2e8f0}
.ilab{font-size:8px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}
.ival{font-size:12px;font-weight:600}
.section-title{font-size:8.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;padding-bottom:7px;border-bottom:1.5px solid #e2e8f0;margin:18px 0 12px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;padding:8px 10px;border-bottom:2px solid #e2e8f0}
td{padding:9px 10px;border-bottom:1px solid #f1f5f9;font-size:12px}
.c{text-align:center}.r{text-align:right}
.totaux{margin-left:auto;width:260px}
.totaux div{display:flex;justify-content:space-between;padding:6px 10px;font-size:12px}
.totaux .ttc{background:#0a1628;color:#fff;border-radius:8px;font-weight:800;font-size:14px;padding:10px 14px;margin-top:4px}
.notes{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-size:12px;color:#334155;margin-top:14px}
.pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pitem{border-radius:8px;overflow:hidden;aspect-ratio:4/3;border:1px solid #e2e8f0;max-height:150px;background:#f1f5f9;display:flex;align-items:center;justify-content:center}
.pitem img{width:100%;height:100%;object-fit:contain}
.footer{margin-top:24px;padding-top:10px;border-top:1.5px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header">
  <div class="hl">
    ${devis.logoSociete?`<img src="${devis.logoSociete}" alt="" style="max-height:46px;max-width:190px;display:block;margin-bottom:6px;background:#fff;border-radius:6px;padding:3px 8px"/>`:""}
    ${devis.societe?`<div class="logo">${devis.societe}</div>`:""}
    <div class="title">DEVIS</div>
  </div>
  <div class="hr">
    <div class="lab">Numéro</div><div class="num">${devis.id}</div>
    <div class="dat">${dateFr(devis.date)}</div>
  </div>
</div>
<div class="body">
  <div class="cgrid">
    ${devis.client?`<div class="icard"><div class="ilab">Client</div><div class="ival">${devis.client}</div></div>`:""}
    ${devis.site?`<div class="icard"><div class="ilab">Site</div><div class="ival">${devis.site}</div></div>`:""}
    ${devis.adresse?`<div class="icard" style="grid-column:1/-1"><div class="ilab">Adresse des travaux</div><div class="ival">${devis.adresse}</div></div>`:""}
    ${devis.ficheId?`<div class="icard"><div class="ilab">Suite à l'intervention</div><div class="ival">${devis.ficheId}</div></div>`:""}
  </div>
  <div class="section-title">Détail des prestations proposées</div>
  <table><thead><tr><th>Désignation</th><th class="c" style="width:60px">Qté</th><th class="r" style="width:90px">P.U. HT</th><th class="r" style="width:100px">Total HT</th></tr></thead>
  <tbody>${lignesHTML||'<tr><td colspan="4" style="color:#94a3b8;font-style:italic">Aucune ligne</td></tr>'}</tbody></table>
  <div class="totaux">
    <div><span>Total HT</span><b>${euro(ht)}</b></div>
    <div><span>TVA ${devis.tva}%</span><b>${euro(tva)}</b></div>
    <div class="ttc"><span>Total TTC</span><span>${euro(ttc)}</span></div>
  </div>
  ${devis.notes?`<div class="notes">${devis.notes.replace(/\n/g,"<br/>")}</div>`:""}
  ${photosHTML}
  <div class="footer"><div>${devis.societe||""}</div><div>Devis ${devis.id} — validité 30 jours</div></div>
</div></body></html>`;
}

function previewDevis(devis) {
  const html = buildDevisHTML(devis);
  const w = window.open("", "_blank");
  if (w?.document) { w.document.open(); w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{try{w.print();}catch(e){}},900); }
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
function TempsPopup({ onSave, tarifHoraire, initialTemps="", initialMaj=[] }) {
  const [temps, setTemps] = useState(initialTemps||"");
  const [maj, setMaj] = useState(initialMaj||[]); // ex: ["soir50","weekend100"]
  const durees = ["30 min","1h","1h30","2h","2h30","3h","4h","Demi-journée","Journée complète"];
  const isForfait = temps==="Forfait";
  const toggleMaj = (m) => setMaj(p => p.includes(m) ? p.filter(x=>x!==m) : [...p, m]);
  const montant = tarifHoraire && temps ? (() => {
    const m = temps.match(/(\d+)h(\d+)?/);
    if (!m) return null;
    let h = parseInt(m[1]) + (m[2] ? parseInt(m[2])/60 : 0);
    let base = h * parseFloat(tarifHoraire);
    let coef = 1;
    if (maj.includes("soir50")) coef += 0.5;
    if (maj.includes("weekend100")) coef += 1;
    return (base * coef).toFixed(2);
  })() : null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0B1829",border:"1px solid #1E3A5F",borderRadius:16,padding:24,width:420,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>⏱️ Temps passé sur place</div>
        <div style={{fontSize:13,color:"#475569",marginBottom:16}}>Usage interne — non affiché au client. Sert à la facturation.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
          {durees.map(d=>(
            <button key={d} onClick={()=>setTemps(d)} style={{padding:"10px 6px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,border:`1.5px solid ${temps===d?"#0EA5E9":"#1E3A5F"}`,background:temps===d?"rgba(14,165,233,0.12)":"#070F1C",color:temps===d?"#0EA5E9":"#64748B",fontFamily:"inherit"}}>
              {d}
            </button>
          ))}
        </div>
        <button onClick={()=>setTemps(isForfait?"":"Forfait")} style={{width:"100%",padding:"11px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:13,marginBottom:10,fontFamily:"inherit",border:`1.5px solid ${isForfait?"#A78BFA":"#1E3A5F"}`,background:isForfait?"rgba(167,139,250,0.14)":"#070F1C",color:isForfait?"#A78BFA":"#64748B"}}>
          💼 Forfait — intervention au forfait (pas de décompte horaire)
        </button>
        <input value={isForfait?"":temps} onChange={e=>setTemps(e.target.value)} placeholder="Ou saisissez (ex: 2h15)" disabled={isForfait} style={{width:"100%",padding:"10px 14px",background:"#070F1C",border:"1.5px solid #1E3A5F",borderRadius:8,color:"#E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:14,opacity:isForfait?.5:1,boxSizing:"border-box"}}/>

        <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Majoration (apparaît sur le rapport)</div>
        <button onClick={()=>toggleMaj("soir50")} style={{width:"100%",padding:"11px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:13,marginBottom:8,fontFamily:"inherit",textAlign:"left",border:`1.5px solid ${maj.includes("soir50")?"#F59E0B":"#1E3A5F"}`,background:maj.includes("soir50")?"rgba(245,158,11,0.14)":"#070F1C",color:maj.includes("soir50")?"#F59E0B":"#64748B"}}>
          {maj.includes("soir50")?"☑":"☐"} 🌙 Majoration +50 % (soirée)
        </button>
        <button onClick={()=>toggleMaj("weekend100")} style={{width:"100%",padding:"11px",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:13,marginBottom:14,fontFamily:"inherit",textAlign:"left",border:`1.5px solid ${maj.includes("weekend100")?"#EF4444":"#1E3A5F"}`,background:maj.includes("weekend100")?"rgba(239,68,68,0.14)":"#070F1C",color:maj.includes("weekend100")?"#EF4444":"#64748B"}}>
          {maj.includes("weekend100")?"☑":"☐"} 🌃 Majoration +100 % (nuit / week-end)
        </button>

        {montant && <div style={{fontSize:13,color:"#10B981",fontWeight:600,marginBottom:10}}>💰 Montant estimé{maj.length?" (majoration incluse)":""} : {montant} €</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onSave({temps:"",maj:[]})} style={{flex:1,padding:"11px",background:"#070F1C",border:"1px solid #1E3A5F",borderRadius:8,color:"#64748B",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Passer</button>
          <button onClick={()=>onSave({temps,maj})} style={{flex:2,padding:"11px",background:"linear-gradient(135deg,#10B981,#059669)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>✓ Valider</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORMULAIRE FICHE — SCROLL UNIQUE
═══════════════════════════════════════════ */
function FicheForm({ initial, onSave, onBack, fiches = [], theme, societes = ["A6T Services"], onAddSociete, techniciens = [], onAddTechnicien, logos = {}, onSaveLogo, onRemoveLogo, clients = [], champsCustom = {} }) {
  const co = (meta, cat) => (champsCustom?.[meta.id]?.[cat]?.length ? champsCustom[meta.id][cat] : meta[cat]);
  const T = THEMES[theme] || THEMES.dark;
  const isDark = theme === "dark";

  const [f, setF] = useState(() => ({
    client:"", adresse:"", tel:"", email:"", technicien:"", clientId:null, siteId:null, facturation:"",
    dateRdv:today(), heureRdv:"", diametreCanalisation:"",
    societe:"A6T Services",
    prestations:[], responsabilite:"na", preconisations:[],
    conclusion:"", photos:[], signature:null, signatureTech:null,
    nomSignataire:"", materiels:[], difficulte:"",
    tempsInterne:"", majorations:[], tarifHoraire:"", notesInternes:"",
    status:"planifie", loc:{...EMPTY_LOC}, urgent:false,
    ...(initial||{}),
  }));

  const [showSig, setShowSig] = useState(false);
  const [showSigTech, setShowSigTech] = useState(false);
  const [showTemps, setShowTemps] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [precoOpen, setPrecoOpen] = useState(false);
  const [interneOpen, setInterneOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const [acAdresseOpen, setAcAdresseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingConclusion, setGeneratingConclusion] = useState(false);
  const [generatingNote, setGeneratingNote] = useState(null);
  const fileRef = useRef();
  const logoRef = useRef();
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
    return{...p,prestations:[...p.prestations,{id,localisations:[],problemes:[],causes:[],constatCamera:[],actions:[],resultats:[],note:"",...(PRESTA_DIAMETRE.includes(id)?{diametre:"100"}:{})}]};
  });
  const updatePresta = (id,key,val) => setF(p=>({...p,prestations:p.prestations.map(x=>x.id===id?{...x,[key]:val}:x)}));
  const togglePrestaItem = (id,key,val) => setF(p=>({...p,prestations:p.prestations.map(x=>{
    if(x.id!==id)return x;
    const arr=x[key]||[]; return{...x,[key]:arr.includes(val)?arr.filter(y=>y!==val):[...arr,val]};
  })}));

  const addPhotos = async files => {
    const all = [...files];
    const videos = all.filter(x=>x.type.startsWith("video/"));
    if(videos.length) alert("Les vidéos ne sont pas encore prises en charge (limite de stockage). Seules les photos ont été ajoutées.");
    const imgs = await Promise.all(all.filter(x=>x.type.startsWith("image/")).map(resizePhoto));
    setF(p=>({...p,photos:[...p.photos,...imgs]}));
  };

  const handleGenererConclusion = async () => {
    if(f.prestations.length===0)return;
    setGeneratingConclusion(true);
    try {
      const locStr = formatLoc(f.loc);
      const text = await generateConclusionIA(f.prestations, locStr, f.responsabilite, f.preconisations);
      set("conclusion", text);
    } catch(e) { alert("Erreur lors de la génération : " + (e?.message || e)); }
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
    } catch(e) { alert("Erreur lors de la génération : " + (e?.message || e)); }
    finally { setGeneratingNote(null); }
  };

  const [errors, setErrors] = useState({});
  const handleSave = () => {
    const errs = {};
    if(!f.client?.trim()) errs.client = true;
    if(!f.adresse?.trim()) errs.adresse = true;
    if(Object.keys(errs).length){
      setErrors(errs);
      alert("⚠️ Le nom du client et l'adresse sont obligatoires pour enregistrer la fiche.");
      window.scrollTo({top:0,behavior:"smooth"});
      return;
    }
    setErrors({});
    setSaving(true);
    setShowTemps(true);
  };

  const handleTempsValidated = (data) => {
    setShowTemps(false);
    const temps = (data && typeof data==="object") ? data.temps : data;
    const majorations = (data && typeof data==="object") ? (data.maj||[]) : [];
    try {
      const fiche = { ...f, id:f.id||uid(), createdAt:f.createdAt||ts(), tempsInterne:temps||f.tempsInterne, majorations, status: f.status==="annule" ? "annule" : "termine", facturation: f.facturation || "a_facturer", logoSociete: logos[(f.societe||"").replace(/[.#$/\[\]]/g,"_")] || null };
      onSave(fiche);
    } catch(e) {
      alert("Erreur lors de l'enregistrement : " + (e?.message||e));
    }
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
      {showTemps && <TempsPopup onSave={handleTempsValidated} tarifHoraire={f.tarifHoraire} initialTemps={f.tempsInterne} initialMaj={f.majorations}/>}

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
          {/* Logo de la société (optionnel) */}
          {(()=>{ const lk=(f.societe||"").replace(/[.#$/\[\]]/g,"_"); const logo=logos[lk];
          return (
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,flexWrap:"wrap"}}>
              {logo
                ? <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"4px 10px"}}><img src={logo} alt="logo" style={{height:36,display:"block"}}/></div>
                : <span style={{fontSize:11.5,color:T.textMuted}}>Pas de logo — le rapport affichera un bandeau avec le nom (idéal sous-traitance)</span>}
              <button onClick={()=>logoRef.current?.click()} style={{padding:"6px 12px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📷 {logo?"Changer":"Ajouter"} le logo</button>
              {logo&&<button onClick={()=>onRemoveLogo&&onRemoveLogo(f.societe)} style={{padding:"6px 10px",background:"none",border:"1px solid rgba(239,68,68,0.4)",borderRadius:8,color:"#EF4444",fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ Retirer</button>}
              <input ref={logoRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0]; if(file){const d=await resizeLogo(file); onSaveLogo&&onSaveLogo(f.societe,d);} e.target.value="";}}/>
            </div>
          );})()}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Client enregistré → Site (remplit l'adresse) */}
          {clients.length>0&&(
            <div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,background:"rgba(14,165,233,0.06)",border:"1px solid rgba(14,165,233,0.2)",borderRadius:10,padding:"12px"}}>
              <div><div style={lblStyle}>Client enregistré</div>
                <select value={f.clientId||""} onChange={e=>{
                  const v=e.target.value; const c=clients.find(x=>x.id===v);
                  // Ne PAS remplir l'adresse ici : un client peut avoir plusieurs sites
                  setF(p=>({...p,clientId:v||null,siteId:null,
                    client:c?c.nom:p.client, tel:c?(c.tel||""):p.tel, email:c?(c.email||""):p.email}));
                }} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
                  <option value="">— Saisie libre —</option>
                  {clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </div>
              <div><div style={lblStyle}>Site d'intervention</div>
                <select value={f.siteId||""} disabled={!f.clientId} onChange={e=>{
                  const v=e.target.value; const c=clients.find(x=>x.id===f.clientId);
                  const s=Object.values(c?.sites||{}).find(x=>x.id===v);
                  setF(p=>({...p,siteId:v||null, adresse:s?s.adresse:p.adresse}));
                }} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light",opacity:f.clientId?1:.5}}>
                  <option value="">{f.clientId?"— Choisir un site —":"Choisissez d'abord un client"}</option>
                  {Object.values(clients.find(x=>x.id===f.clientId)?.sites||{}).map(s=><option key={s.id} value={s.id}>{s.nom||s.adresse}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Client avec autocomplétion */}
          <div style={{gridColumn:"1/-1",position:"relative"}} ref={acRef}>
            <div style={lblStyle}>Client / Société <span style={{color:"#EF4444"}}>*</span></div>
            <input value={f.client} onChange={e=>{set("client",e.target.value);setAcOpen(true);if(errors.client)setErrors(p=>({...p,client:false}));}} onFocus={()=>setAcOpen(true)}
              placeholder="Nom ou raison sociale (obligatoire)" style={{...inpStyle(),...(errors.client?{border:"1.5px solid #EF4444",background:"rgba(239,68,68,0.06)"}:{})}} autoComplete="off"/>
            {errors.client&&<div style={{fontSize:11,color:"#EF4444",fontWeight:700,marginTop:4}}>⚠️ Champ obligatoire</div>}
            {acOpen&&clientSuggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:T.surface,border:`1.5px solid #0EA5E9`,borderRadius:10,marginTop:4,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
                {clientSuggestions.map((c,i)=>(
                  <div key={i} onClick={()=>{setF(p=>({...p,client:c.client,tel:c.tel,email:c.email}));setAcOpen(false);}}
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
            <div style={lblStyle}>Adresse d'intervention <span style={{color:"#EF4444"}}>*</span></div>
            <input value={f.adresse} onChange={e=>{set("adresse",e.target.value);setAcAdresseOpen(true);if(errors.adresse)setErrors(p=>({...p,adresse:false}));}} onFocus={()=>setAcAdresseOpen(true)}
              placeholder="Adresse complète (obligatoire)" style={{...inpStyle(),...(errors.adresse?{border:"1.5px solid #EF4444",background:"rgba(239,68,68,0.06)"}:{})}} autoComplete="off"/>
            {errors.adresse&&<div style={{fontSize:11,color:"#EF4444",fontWeight:700,marginTop:4}}>⚠️ Champ obligatoire</div>}
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
          <div><div style={lblStyle}>Technicien</div>
            <select value={f.technicien||""} onChange={e=>{
              if(e.target.value==="__new__"){
                const nom=prompt("Nom du technicien :");
                if(nom?.trim()){onAddTechnicien&&onAddTechnicien(nom.trim());set("technicien",nom.trim());}
              } else {set("technicien",e.target.value);}
            }} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              <option value="">— Choisir —</option>
              {[...new Set([...techniciens, ...(f.technicien?[f.technicien]:[])])].map(t=><option key={t} value={t}>{t}</option>)}
              <option value="__new__">➕ Ajouter un technicien…</option>
            </select>
          </div>
          <div><div style={lblStyle}>Statut</div>
            <select value={f.status} onChange={e=>set("status",e.target.value)} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              {Object.entries(STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div><div style={lblStyle}>Date</div><input type="date" value={f.dateRdv} onChange={e=>set("dateRdv",e.target.value)} style={{...inpStyle(),colorScheme:isDark?"dark":"light"}}/></div>
          <div><div style={lblStyle}>Heure</div><input type="time" value={f.heureRdv} onChange={e=>set("heureRdv",e.target.value)} style={{...inpStyle(),colorScheme:isDark?"dark":"light"}}/></div>
        </div>
        {/* Localisation précise (repliable) */}
        <div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:12}}>
          <div onClick={()=>setLocOpen(!locOpen)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:800,fontSize:13,color:T.text}}>
            📍 Localisation précise
            {formatLoc(f.loc)&&<span style={{fontSize:11,fontWeight:700,color:"#38BDF8",background:"rgba(14,165,233,0.13)",padding:"2px 9px",borderRadius:12,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{formatLoc(f.loc)}</span>}
            <span style={{marginLeft:"auto",fontSize:12,color:"#38BDF8",fontWeight:700}}>{locOpen?"▲":"▼ Appuyer si besoin"}</span>
          </div>
          {locOpen&&(<div style={{marginTop:12}}>
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
          </div>)}
        </div>
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
                      {key:"localisations",icon:"📍",label:"Localisation",opts:co(presta,"localisations")},
                      {key:"problemes",icon:"⚠️",label:"Problème constaté",opts:co(presta,"problemes")},
                      ...(presta.causes?[{key:"causes",icon:"🔍",label:"Cause du bouchon",opts:co(presta,"causes"),badge:"Débouchage"}]:[]),
                      ...(presta.constatCamera?[{key:"constatCamera",icon:"📹",label:"Constat caméra",opts:co(presta,"constatCamera"),badge:"Inspection"}]:[]),
                      {key:"actions",icon:"🔨",label:"Action réalisée",opts:co(presta,"actions")},
                      {key:"resultats",icon:"✅",label:"Résultat",opts:co(presta,"resultats")},
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
                  {PRESTA_DIAMETRE.includes(presta.id)&&(
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:6}}>📏 Diamètre canalisation</div>
                      <select value={data.diametre||"100"} onChange={e=>updatePresta(presta.id,"diametre",e.target.value)}
                        style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light",maxWidth:220}}>
                        {(champsCustom?._global?.diametres?.length ? champsCustom._global.diametres : DIAMETRES).map(dn=><option key={dn} value={dn}>Ø {dn} mm</option>)}
                      </select>
                    </div>
                  )}
                    <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 8px"}}>
                      🖊 Note (optionnel)
                    </div>
                    <textarea value={data.note||""} onChange={e=>updatePresta(presta.id,"note",e.target.value)}
                      placeholder="Détail libre…" rows={2}
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
          {RESPONSABILITES.filter(r=>r.id==="privative"||r.id==="commune").map(r=>(
            <button key={r.id} onClick={()=>set("responsabilite",f.responsabilite===r.id?"na":r.id)}
              style={{padding:"10px 8px",borderRadius:8,cursor:"pointer",background:f.responsabilite===r.id?r.color+"22":T.surface2,border:`1.5px solid ${f.responsabilite===r.id?r.color:T.border}`,color:f.responsabilite===r.id?r.color:T.textMuted,fontWeight:700,fontSize:11,textAlign:"center",lineHeight:1.4,fontFamily:"inherit"}}>
              <div style={{fontSize:18,marginBottom:3}}>{r.icon}</div>{r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PRÉCONISATIONS (repliable) ── */}
      <div style={{...sectionStyle,cursor:precoOpen?"default":"pointer"}} onClick={()=>!precoOpen&&setPrecoOpen(true)}>
        <div style={{...sectionTitleStyle,cursor:"pointer",borderBottom:precoOpen?sectionTitleStyle.borderBottom:"none",paddingBottom:precoOpen?10:0,marginBottom:precoOpen?14:0}} onClick={e=>{e.stopPropagation();setPrecoOpen(!precoOpen);}}>
          💡 Préconisations
          {f.preconisations.length>0&&<span style={{fontSize:11,fontWeight:700,color:"#A78BFA",background:"rgba(167,139,250,0.15)",padding:"2px 9px",borderRadius:12}}>{f.preconisations.length} cochée(s)</span>}
          <span style={{marginLeft:"auto",fontSize:12,color:"#A78BFA",fontWeight:700}}>{precoOpen?"▲":"▼ Appuyer si besoin"}</span>
        </div>
        {precoOpen&&(<>
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
          {(champsCustom?._global?.preconisations?.length ? champsCustom._global.preconisations : PRECONISATIONS).map(v=>{
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
      </>)}
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
                <button onClick={()=>{const np=[...f.photos];np[i]={...np[i],tag:np[i].tag==="avant"?"apres":np[i].tag==="apres"?null:"avant"};set("photos",np);}}
                  title="Cliquez pour marquer Avant / Après"
                  style={{position:"absolute",top:4,left:4,background:p.tag==="avant"?"#F59E0B":p.tag==="apres"?"#10B981":"rgba(0,0,0,0.6)",color:"#fff",border:"none",borderRadius:6,padding:"2px 7px",fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:0.3}}>
                  {p.tag==="avant"?"AVANT":p.tag==="apres"?"APRÈS":"Tag"}
                </button>
                <div style={{position:"absolute",bottom:4,left:4,right:4,display:"flex",justifyContent:"space-between"}}>
                  <button onClick={()=>{if(i===0)return;const np=[...f.photos];[np[i-1],np[i]]=[np[i],np[i-1]];set("photos",np);}}
                    style={{background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:i===0?"default":"pointer",fontSize:11,fontFamily:"inherit",opacity:i===0?0.25:1}}>‹</button>
                  <button onClick={()=>{if(i===f.photos.length-1)return;const np=[...f.photos];[np[i+1],np[i]]=[np[i],np[i+1]];set("photos",np);}}
                    style={{background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:i===f.photos.length-1?"default":"pointer",fontSize:11,fontFamily:"inherit",opacity:i===f.photos.length-1?0.25:1}}>›</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {f.photos.some(p=>p.tag)&&<div style={{fontSize:11,color:T.textMuted,marginTop:8}}>💡 Les photos taguées Avant/Après seront regroupées et titrées dans le rapport PDF.</div>}
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
                :<div onClick={()=>setShowSig(true)} style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"14px",color:T.textMuted,fontSize:12,textAlign:"center",cursor:"pointer"}}>✍️ Touchez ici pour signer</div>}
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
                :<div onClick={()=>setShowSigTech(true)} style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"14px",color:T.textMuted,fontSize:12,textAlign:"center",cursor:"pointer"}}>✍️ Touchez ici pour signer</div>}
              <button onClick={()=>setShowSigTech(true)} style={{padding:"8px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✍️ {f.signatureTech?"Modifier":"Signer"}</button>
              {f.signatureTech&&<button onClick={()=>set("signatureTech",null)} style={{padding:"7px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:"#EF4444",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Effacer</button>}
            </div>
          </div>
        </div>
      </div>

      {/* ── INTERNE (repliable) ── */}
      <div style={{...sectionStyle,background:isDark?"rgba(249,115,22,0.06)":theme==="light"?"#FFF7ED":"#FDF2E9",border:`1px dashed rgba(249,115,22,0.4)`,cursor:interneOpen?"default":"pointer"}} onClick={()=>!interneOpen&&setInterneOpen(true)}>
        <div style={{...sectionTitleStyle,color:"#F97316",cursor:"pointer",borderBottom:interneOpen?"1px solid rgba(249,115,22,0.2)":"none",paddingBottom:interneOpen?10:0,marginBottom:interneOpen?14:0}} onClick={e=>{e.stopPropagation();setInterneOpen(!interneOpen);}}>
          🔒 Usage interne
          {(f.materiels.length>0||f.difficulte||f.tarifHoraire||f.notesInternes||f.tempsInterne||f.majorations?.length)&&<span style={{fontSize:11,fontWeight:700,color:"#F97316",background:"rgba(249,115,22,0.15)",padding:"2px 9px",borderRadius:12}}>renseigné</span>}
          <span style={{marginLeft:"auto",fontSize:12,color:"#F97316",fontWeight:700}}>{interneOpen?"▲":"▼ Appuyer si besoin"}</span>
        </div>
        {interneOpen&&(<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{...lblStyle,color:"#7C3D12"}}>Matériel utilisé</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {(champsCustom?._global?.materiels?.length ? champsCustom._global.materiels : MATERIELS).map(v=>{
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
          <div>
            <div style={{...lblStyle,color:"#7C3D12"}}>⏱️ Temps passé sur place</div>
            <input value={f.tempsInterne} onChange={e=>set("tempsInterne",e.target.value)} placeholder="Ex : 2h, 1h30, Forfait…" style={inpStyle()}/>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={{...lblStyle,color:"#7C3D12"}}>Majoration (apparaît sur le rapport)</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={()=>toggleArr("majorations","soir50")} style={{flex:1,minWidth:160,padding:"9px 10px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,textAlign:"left",border:`1.5px solid ${f.majorations?.includes("soir50")?"#F59E0B":T.border}`,background:f.majorations?.includes("soir50")?"rgba(245,158,11,0.15)":T.surface2,color:f.majorations?.includes("soir50")?"#F59E0B":T.textMuted,fontFamily:"inherit"}}>
                {f.majorations?.includes("soir50")?"☑":"☐"} 🌙 +50 % (soirée)
              </button>
              <button onClick={()=>toggleArr("majorations","weekend100")} style={{flex:1,minWidth:160,padding:"9px 10px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,textAlign:"left",border:`1.5px solid ${f.majorations?.includes("weekend100")?"#EF4444":T.border}`,background:f.majorations?.includes("weekend100")?"rgba(239,68,68,0.15)":T.surface2,color:f.majorations?.includes("weekend100")?"#EF4444":T.textMuted,fontFamily:"inherit"}}>
                {f.majorations?.includes("weekend100")?"☑":"☐"} 🌃 +100 % (nuit/we)
              </button>
            </div>
          </div>
        </div>
        <div>
          <div style={{...lblStyle,color:"#7C3D12"}}>Notes internes</div>
          <textarea value={f.notesInternes} onChange={e=>set("notesInternes",e.target.value)} placeholder="Observations, à prévoir, notes pour devis…" rows={3} style={{...inpStyle(),resize:"vertical",lineHeight:1.6}}/>
        </div>
        </>)}
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
   ADMINISTRATION
═══════════════════════════════════════════ */
function AdminView({ societes, techniciens, techTels, techColors={}, logos, champs, sousTraitants=[], onSaveSousTraitants, onSaveSocietes, onSaveTechniciens, onSaveTechTel, onSaveTechColor, onSaveLogo, onRemoveLogo, onSaveChamps, onGoChamps, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const logoRef = useRef();
  const [logoTarget, setLogoTarget] = useState(null);
  const card = {background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14};
  const head = {fontWeight:800,fontSize:14,color:T.text,marginBottom:10,display:"flex",alignItems:"center",gap:8};
  const btn = {border:`1px solid ${T.border}`,background:T.surface2,color:T.textMuted,borderRadius:6,width:28,height:28,cursor:"pointer",fontFamily:"inherit",fontSize:12};
  const addBtn = {border:"1px solid rgba(16,185,129,0.4)",background:T.surface2,color:"#10B981",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700};
  const row = (last)=>({display:"flex",alignItems:"center",gap:8,padding:"8px 4px",borderBottom:last?"none":`1px solid ${T.border}`});

  /* Listes simples éditables via champs/_global */
  const simpleList = (key, def) => (champs?._global?.[key]?.length ? champs._global[key] : def);
  const writeList = (key, l) => onSaveChamps("_global", key, l);
  const SimpleEditor = ({title, icon, k, def, addLabel}) => {
    const liste = simpleList(k, def);
    return (
      <div style={card}>
        <div style={head}>{icon} {title}
          <button onClick={()=>{const v=window.prompt(addLabel||"Nouvel élément :");if(v&&v.trim())writeList(k,[...liste,v.trim()]);}} style={{...addBtn,marginLeft:"auto"}}>➕ Ajouter</button>
        </div>
        {liste.map((item,i)=>(
          <div key={i} style={row(i===liste.length-1)}>
            <span style={{flex:1,fontSize:13,color:T.text}}>{item}</span>
            <button onClick={()=>{if(i>0){const l=[...liste];[l[i-1],l[i]]=[l[i],l[i-1]];writeList(k,l);}}} disabled={i===0} style={{...btn,opacity:i===0?.3:1}}>↑</button>
            <button onClick={()=>{if(i<liste.length-1){const l=[...liste];[l[i+1],l[i]]=[l[i],l[i+1]];writeList(k,l);}}} disabled={i===liste.length-1} style={{...btn,opacity:i===liste.length-1?.3:1}}>↓</button>
            <button onClick={()=>{const v=window.prompt("Nouveau libellé :",item);if(v&&v.trim()){const l=[...liste];l[i]=v.trim();writeList(k,l);}}} style={btn}>✏️</button>
            <button onClick={()=>{if(window.confirm(`Supprimer "${item}" ?`)){const l=[...liste];l.splice(i,1);writeList(k,l);}}} style={{...btn,color:"#EF4444"}}>✕</button>
          </div>
        ))}
      </div>
    );
  };

  /* Catalogue devis : objets {label, unite} */
  const cat = champs?._global?.devisCatalogue?.length ? champs._global.devisCatalogue : DEVIS_CATALOGUE;
  const writeCat = (l) => onSaveChamps("_global","devisCatalogue",l);

  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12.5,color:T.text,lineHeight:1.6}}>
        🛠️ <b>Administration</b> — gérez ici toutes les données de l'application, sans toucher au code. Les modifications sont immédiates pour toute l'équipe.
      </div>

      {/* Sociétés + logos */}
      <div style={card}>
        <div style={head}>🏢 Sociétés intervenantes
          <button onClick={()=>{const v=window.prompt("Nom de la société :");if(v&&v.trim()&&!societes.includes(v.trim()))onSaveSocietes([...societes,v.trim()]);}} style={{...addBtn,marginLeft:"auto"}}>➕ Ajouter</button>
        </div>
        {societes.map((s,i)=>{
          const lk = logoKey(s); const hasLogo = !!logos[lk];
          return (
            <div key={s} style={row(i===societes.length-1)}>
              {hasLogo
                ? <img src={logos[lk]} style={{height:26,maxWidth:64,objectFit:"contain",borderRadius:4,background:"#fff",padding:2}} alt=""/>
                : <span style={{fontSize:10,color:T.textMuted,border:`1px dashed ${T.border}`,borderRadius:4,padding:"4px 7px"}}>sans logo</span>}
              <span style={{flex:1,fontSize:13,fontWeight:700,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{s}</span>
              <button onClick={()=>{setLogoTarget(s);logoRef.current?.click();}} style={{...btn,width:"auto",padding:"0 8px",fontSize:11}}>📷 {hasLogo?"Changer":"Logo"}</button>
              {hasLogo&&<button onClick={()=>{if(window.confirm(`Retirer le logo de ${s} ?`))onRemoveLogo(s);}} style={btn}>🚫</button>}
              <button onClick={()=>{if(window.confirm(`Supprimer la société "${s}" ?\n(Les fiches existantes la gardent.)`))onSaveSocietes(societes.filter(x=>x!==s));}} style={{...btn,color:"#EF4444"}}>✕</button>
            </div>
          );
        })}
        <input ref={logoRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0];if(file&&logoTarget){const d=await resizeLogo(file);onSaveLogo(logoTarget,d);}e.target.value="";}}/>
      </div>

      {/* Techniciens + numéros */}
      <div style={card}>
        <div style={head}>👤 Techniciens, couleurs & numéros WhatsApp
          <button onClick={()=>{const v=window.prompt("Nom du technicien :");if(v&&v.trim()&&!techniciens.includes(v.trim()))onSaveTechniciens([...techniciens,v.trim()]);}} style={{...addBtn,marginLeft:"auto"}}>➕ Ajouter</button>
        </div>
        {techniciens.length===0&&<div style={{fontSize:12,color:T.textMuted,padding:"6px 0"}}>Aucun technicien — ils s'ajoutent aussi automatiquement à la 1ʳᵉ fiche.</div>}
        {techniciens.map((t,i)=>(
          <div key={t} style={row(i===techniciens.length-1)}>
            <span style={{flex:1,fontSize:13,fontWeight:700,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{t}</span>
            <input type="color" title="Couleur de l'agenda" value={techColor(t,techniciens,techColors)}
              onChange={e=>onSaveTechColor(t,e.target.value)}
              style={{width:34,height:30,padding:0,border:`1px solid ${T.border}`,borderRadius:6,background:"none",cursor:"pointer"}}/>
            <input key={t+(techTels[logoKey(t)]||"")} defaultValue={techTels[logoKey(t)]||""} onBlur={e=>{if(e.target.value!==(techTels[logoKey(t)]||""))onSaveTechTel(t,e.target.value);}} placeholder="N° WhatsApp (33612345678)"
              style={{width:170,padding:"7px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={()=>{if(window.confirm(`Supprimer le technicien "${t}" ?`)){onSaveTechniciens(techniciens.filter(x=>x!==t));onSaveTechTel(t,"");onSaveTechColor(t,null);}}} style={{...btn,color:"#EF4444"}}>✕</button>
          </div>
        ))}
      </div>

      {/* Sous-traitants */}
      <div style={card}>
        <div style={head}>📤 Sous-traitants
          <button onClick={()=>{const nom=window.prompt("Nom du sous-traitant :");if(!nom||!nom.trim())return;const tel=window.prompt("Numéro WhatsApp (33612345678) :");if(!tel||!tel.trim())return;onSaveSousTraitants([...sousTraitants,{nom:nom.trim(),tel:tel.trim()}]);}} style={{...addBtn,marginLeft:"auto"}}>➕ Ajouter</button>
        </div>
        {sousTraitants.length===0&&<div style={{fontSize:12,color:T.textMuted,padding:"6px 0"}}>Aucun sous-traitant enregistré — ils s'ajoutent aussi automatiquement depuis le bouton "Envoyer au sous-traitant" sur une fiche.</div>}
        {sousTraitants.map((s,i)=>(
          <div key={i} style={row(i===sousTraitants.length-1)}>
            <span style={{flex:1,fontSize:13,fontWeight:700,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{s.nom}</span>
            <input key={s.nom+s.tel} defaultValue={s.tel} onBlur={e=>{if(e.target.value!==s.tel){const next=[...sousTraitants];next[i]={...next[i],tel:e.target.value};onSaveSousTraitants(next);}}} placeholder="N° WhatsApp (33612345678)"
              style={{width:170,padding:"7px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={()=>{if(window.confirm(`Supprimer "${s.nom}" ?`))onSaveSousTraitants(sousTraitants.filter((_,j)=>j!==i));}} style={{...btn,color:"#EF4444"}}>✕</button>
          </div>
        ))}
      </div>

      {/* Catalogue devis */}
      <div style={card}>
        <div style={head}>⚡ Prestations types des devis
          <button onClick={()=>{const lab=window.prompt("Libellé de la prestation :");if(!lab||!lab.trim())return;const u=window.prompt("Unité (u, ml, colonne…) :","u")||"u";writeCat([...cat,{label:lab.trim(),unite:u.trim()||"u"}]);}} style={{...addBtn,marginLeft:"auto"}}>➕ Ajouter</button>
        </div>
        {cat.map((c2,i)=>(
          <div key={i} style={row(i===cat.length-1)}>
            <span style={{flex:1,fontSize:13,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{c2.label} <span style={{color:T.textMuted,fontSize:11}}>({c2.unite})</span></span>
            <button onClick={()=>{if(i>0){const l=[...cat];[l[i-1],l[i]]=[l[i],l[i-1]];writeCat(l);}}} disabled={i===0} style={{...btn,opacity:i===0?.3:1}}>↑</button>
            <button onClick={()=>{if(i<cat.length-1){const l=[...cat];[l[i+1],l[i]]=[l[i],l[i+1]];writeCat(l);}}} disabled={i===cat.length-1} style={{...btn,opacity:i===cat.length-1?.3:1}}>↓</button>
            <button onClick={()=>{const lab=window.prompt("Libellé :",c2.label);if(!lab||!lab.trim())return;const u=window.prompt("Unité :",c2.unite)||c2.unite;const l=[...cat];l[i]={label:lab.trim(),unite:u.trim()||c2.unite};writeCat(l);}} style={btn}>✏️</button>
            <button onClick={()=>{if(window.confirm(`Supprimer "${c2.label}" ?`)){const l=[...cat];l.splice(i,1);writeCat(l);}}} style={{...btn,color:"#EF4444"}}>✕</button>
          </div>
        ))}
      </div>

      <SimpleEditor title="Matériels (usage interne)" icon="🧰" k="materiels" def={MATERIELS}/>
      <SimpleEditor title="Diamètres de canalisation" icon="📏" k="diametres" def={DIAMETRES} addLabel="Diamètre (mm), ex : 60"/>

      <div onClick={onGoChamps} style={{...card,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>⚙️</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:13.5,color:T.text}}>Personnaliser les cases des fiches</div>
          <div style={{fontSize:11.5,color:T.textMuted}}>Localisations, causes, actions, résultats, préconisations…</div>
        </div>
        <span style={{color:T.textMuted}}>›</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PERSONNALISATION DES CASES
═══════════════════════════════════════════ */
const CHAMPS_CATS = [
  {key:"localisations",icon:"📍",label:"Localisation"},
  {key:"problemes",icon:"⚠️",label:"Problème constaté"},
  {key:"causes",icon:"🔍",label:"Cause du bouchon"},
  {key:"constatCamera",icon:"📹",label:"Constat caméra"},
  {key:"actions",icon:"🔨",label:"Action réalisée"},
  {key:"resultats",icon:"✅",label:"Résultat"},
];
function ChampsEditor({ champs, onSave, onSavePrestationLabel, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [prestaId, setPrestaId] = useState(PRESTATIONS[0].id);
  const isPreco = prestaId==="_global";
  const meta = isPreco ? null : PRESTATIONS.find(p=>p.id===prestaId);
  const cats = isPreco
    ? [{key:"preconisations",icon:"💡",label:"Préconisations"}]
    : CHAMPS_CATS.filter(c=>Array.isArray(meta?.[c.key]));
  const defOf = (cat) => isPreco ? PRECONISATIONS : (meta?.[cat]||[]);
  const listOf = (cat) => (champs?.[prestaId]?.[cat]?.length ? champs[prestaId][cat] : defOf(cat));
  const isCustom = (cat) => !!champs?.[prestaId]?.[cat]?.length;
  const write = (cat, liste) => onSave(prestaId, cat, liste);

  const move = (cat,i,d) => { const l=[...listOf(cat)]; const j=i+d; if(j<0||j>=l.length)return; [l[i],l[j]]=[l[j],l[i]]; write(cat,l); };
  const renameIt = (cat,i) => { const l=[...listOf(cat)]; const v=window.prompt("Nouveau libellé :",l[i]); if(v&&v.trim()){l[i]=v.trim(); write(cat,l);} };
  const removeIt = (cat,i) => { const l=[...listOf(cat)]; if(!window.confirm(`Supprimer la case "${l[i]}" ?`))return; l.splice(i,1); write(cat,l); };
  const addIt = (cat) => { const v=window.prompt("Libellé de la nouvelle case :"); if(v&&v.trim()) write(cat,[...listOf(cat),v.trim()]); };
  const resetIt = (cat) => { if(window.confirm("Revenir à la liste d'origine ? Vos personnalisations de cette rubrique seront effacées.")) write(cat,null); };

  const btn = {border:`1px solid ${T.border}`,background:T.surface2,color:T.textMuted,borderRadius:6,width:28,height:28,cursor:"pointer",fontFamily:"inherit",fontSize:12};
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{background:"rgba(14,165,233,0.07)",border:"1px solid rgba(14,165,233,0.25)",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12.5,color:T.text,lineHeight:1.6}}>
        ⚙️ Ici vous gérez vous-même les cases proposées dans les fiches : <b>ajoutez</b> ➕, <b>renommez</b> ✏️, <b>supprimez</b> ✕ ou <b>déplacez</b> ↑↓ les cases. Les modifications s'appliquent immédiatement pour toute l'équipe. Les fiches déjà enregistrées ne sont pas touchées.
      </div>
      <select value={prestaId} onChange={e=>setPrestaId(e.target.value)}
        style={{width:"100%",padding:"12px 14px",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,fontWeight:700,outline:"none",fontFamily:"inherit",cursor:"pointer",marginBottom:16,boxSizing:"border-box"}}>
        {PRESTATIONS.map(p=><option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
        <option value="_global">💡 Préconisations (toutes fiches)</option>
      </select>
      {!isPreco&&meta&&(
        <div style={{display:"flex",alignItems:"center",gap:10,background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 16px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".05em"}}>Titre de cette catégorie</div>
          <div style={{fontWeight:800,fontSize:14,color:T.text,flex:1}}>{meta.icon} {meta.label}</div>
          {meta.label!==meta._origLabel&&<span style={{fontSize:10,fontWeight:700,color:"#A78BFA",background:"rgba(167,139,250,0.14)",padding:"2px 8px",borderRadius:10}}>personnalisé</span>}
          <button onClick={()=>{const v=window.prompt("Nouveau titre pour cette catégorie :",meta.label);if(v&&v.trim())onSavePrestationLabel(prestaId,v.trim());}} style={{...btn,width:"auto",padding:"0 10px",fontSize:11}}>✏️ Renommer</button>
          {meta.label!==meta._origLabel&&<button onClick={()=>{if(window.confirm(`Revenir au titre d'origine "${meta._origLabel}" ?`))onSavePrestationLabel(prestaId,null);}} style={{...btn,width:"auto",padding:"0 10px",fontSize:11}}>↺ Origine</button>}
        </div>
      )}
      {cats.map(cat=>(
        <div key={cat.key} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{fontWeight:800,fontSize:13.5,color:T.text}}>{cat.icon} {cat.label}</div>
            {isCustom(cat.key)&&<span style={{fontSize:10,fontWeight:700,color:"#A78BFA",background:"rgba(167,139,250,0.14)",padding:"2px 8px",borderRadius:10}}>personnalisé</span>}
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              {isCustom(cat.key)&&<button onClick={()=>resetIt(cat.key)} style={{...btn,width:"auto",padding:"0 10px",fontSize:11}}>↺ Origine</button>}
              <button onClick={()=>addIt(cat.key)} style={{...btn,width:"auto",padding:"0 10px",fontSize:11,color:"#10B981",borderColor:"rgba(16,185,129,0.4)"}}>➕ Ajouter</button>
            </div>
          </div>
          {listOf(cat.key).map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 4px",borderBottom:i<listOf(cat.key).length-1?`1px solid ${T.border}`:"none"}}>
              <span style={{flex:1,fontSize:13,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{item}</span>
              <button onClick={()=>move(cat.key,i,-1)} disabled={i===0} style={{...btn,opacity:i===0?.3:1}}>↑</button>
              <button onClick={()=>move(cat.key,i,1)} disabled={i===listOf(cat.key).length-1} style={{...btn,opacity:i===listOf(cat.key).length-1?.3:1}}>↓</button>
              <button onClick={()=>renameIt(cat.key,i)} style={btn}>✏️</button>
              <button onClick={()=>removeIt(cat.key,i)} style={{...btn,color:"#EF4444"}}>✕</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   IMPORT MAIL → RDV (IA)
═══════════════════════════════════════════ */
function MailImport({ onExtracted, onCancel, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [texte, setTexte] = useState("");
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const analyser = async () => {
    if(!texte.trim() && !img){alert("Collez le texte du mail ou ajoutez une capture d'écran.");return;}
    setBusy(true);
    try {
      const prompt = `Tu extrais les informations d'une demande d'intervention (plomberie/assainissement) reçue par mail ou message, pour créer un rendez-vous. Date du jour : ${today()}.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks, avec exactement ces clés (chaîne vide si l'info est absente) :
{"client":"nom du client ou de la société demandeuse","tel":"téléphone","email":"email","adresse":"adresse complète de l'intervention","dateRdv":"date au format YYYY-MM-DD (interprète 'demain', 'lundi prochain'... par rapport à la date du jour ; vide si aucune date)","heureRdv":"heure au format HH:MM (vide si absente)","note":"résumé en 1-2 phrases du problème ou de la demande"}`;
      const content = [];
      if(img) content.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:img.split(",")[1]}});
      content.push({type:"text",text:prompt+(texte.trim()?`\n\nContenu du mail :\n${texte.trim()}`:"\n\nLes informations sont dans l'image ci-jointe.")});
      const r = await fetch("/api/claude", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, messages:[{role:"user",content}] })
      });
      if(!r.ok) throw new Error("API "+r.status);
      const data = await r.json();
      const raw = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      const j = JSON.parse(raw);
      onExtracted({ client:j.client||"", tel:j.tel||"", email:j.email||"", adresse:j.adresse||"",
        dateRdv:j.dateRdv||today(), heureRdv:j.heureRdv||"", noteRdv:j.note||"" });
    } catch(e) { alert("Erreur lors de l'analyse : "+(e?.message||e)); }
    setBusy(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:480,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>🪄 Créer un RDV depuis un mail</div>
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:14}}>Collez le texte du mail ou ajoutez une capture d'écran — l'IA remplit le RDV pour vous.</div>
        <textarea value={texte} onChange={e=>setTexte(e.target.value)} rows={7} placeholder="Collez ici le texte du mail / SMS / WhatsApp…"
          style={{width:"100%",padding:"10px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",marginBottom:10,lineHeight:1.5}}/>
        {img
          ? <div style={{position:"relative",marginBottom:10}}>
              <img src={img} style={{width:"100%",borderRadius:8,maxHeight:200,objectFit:"contain",background:"#000"}} alt=""/>
              <button onClick={()=>setImg(null)} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontFamily:"inherit"}}>×</button>
            </div>
          : <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"11px",background:"none",border:`2px dashed ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,fontSize:12.5,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>📸 Ou ajouter une capture d'écran du mail</button>}
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{
          const file=e.target.files?.[0]; if(!file)return;
          const r=await resizePhoto(file); setImg(r.data); e.target.value="";
        }}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={onCancel} disabled={busy} style={{flex:1,padding:"12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
          <button onClick={analyser} disabled={busy} style={{flex:2,padding:"12px",background:busy?"rgba(167,139,250,0.3)":"linear-gradient(135deg,#A78BFA,#7C3AED)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:busy?"wait":"pointer",fontFamily:"inherit"}}>{busy?"⏳ Analyse en cours…":"✨ Analyser et pré-remplir"}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORMULAIRE RDV RAPIDE
═══════════════════════════════════════════ */
function RdvForm({ initial, onSave, onBack, fiches = [], theme, techniciens = [], onAddTechnicien }) {
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
  const [adrOpen, setAdrOpen] = useState(false);
  const adressesConnues = useMemo(()=>{const map={};fiches.forEach(x=>{if(x.adresse)map[x.adresse.toLowerCase()]=x.adresse;});return Object.values(map);},[fiches]);
  const adrSuggestions = useMemo(()=>{if(!f.adresse||f.adresse.length<3)return[];return adressesConnues.filter(a=>a.toLowerCase().includes(f.adresse.toLowerCase())&&a.toLowerCase()!==f.adresse.toLowerCase()).slice(0,5);},[f.adresse,adressesConnues]);
  useEffect(()=>{const h=e=>{if(acRef.current&&!acRef.current.contains(e.target))setAcOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);

  const validate = () => { return true; };

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
          📅 RDV planifié — La fiche complète sera remplie sur place avec le bouton ▶ Démarrer. Sans date, il ira dans la rubrique 📌 À programmer de l'agenda.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{gridColumn:"1/-1",position:"relative"}} ref={acRef}>
            <div style={lblStyle}>Client / Société</div>
            <input value={f.client} onChange={e=>{set("client",e.target.value);setAcOpen(true);}} onFocus={()=>setAcOpen(true)} placeholder="Nom ou raison sociale" style={inpStyle()} autoComplete="off"/>
            {acOpen&&suggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:T.surface,border:"1.5px solid #3B82F6",borderRadius:10,marginTop:4,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
                {suggestions.map((c,i)=>(
                  <div key={i} onClick={()=>{setF(p=>({...p,client:c.client,tel:c.tel}));setAcOpen(false);}}
                    style={{padding:"10px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,fontSize:13,color:T.text}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,0.08)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    🏢 {c.client}{c.adresse&&<div style={{fontSize:11,color:T.textMuted}}>📍 {c.adresse}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{gridColumn:"1/-1",position:"relative"}}>
            <div style={lblStyle}>Adresse</div>
            <input value={f.adresse} onChange={e=>{set("adresse",e.target.value);setAdrOpen(true);}} onFocus={()=>setAdrOpen(true)} onBlur={()=>setTimeout(()=>setAdrOpen(false),180)} placeholder="Adresse complète" style={inpStyle()}/>
            {adrOpen&&adrSuggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:30,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,marginTop:4,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.3)"}}>
                {adrSuggestions.map((a,i)=>(
                  <div key={i} onMouseDown={()=>{set("adresse",a);setAdrOpen(false);}} style={{padding:"9px 12px",fontSize:13,color:T.text,cursor:"pointer",borderBottom:i<adrSuggestions.length-1?`1px solid ${T.border}`:"none"}}>📍 {a}</div>
                ))}
              </div>
            )}
          </div>
          <div><div style={lblStyle}>Téléphone client</div><input value={f.tel} onChange={e=>set("tel",e.target.value)} placeholder="06 00 00 00 00" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Technicien assigné</div>
            <select value={f.technicien||""} onChange={e=>{
              if(e.target.value==="__new__"){
                const nom=prompt("Nom du technicien :");
                if(nom?.trim()){onAddTechnicien&&onAddTechnicien(nom.trim());set("technicien",nom.trim());}
              } else {set("technicien",e.target.value);}
            }} style={{...inpStyle(),cursor:"pointer",colorScheme:isDark?"dark":"light"}}>
              <option value="">— Choisir —</option>
              {[...new Set([...techniciens, ...(f.technicien?[f.technicien]:[])])].map(t=><option key={t} value={t}>{t}</option>)}
              <option value="__new__">➕ Ajouter un technicien…</option>
            </select>
          </div>
          <div>
            <div style={lblStyle}>Date</div>
            <input type="date" value={f.dateRdv||""} onChange={e=>set("dateRdv",e.target.value)} style={{...inpStyle(),colorScheme:isDark?"dark":"light",opacity:f.dateRdv?1:.55}}/>
            <label style={{display:"flex",alignItems:"center",gap:7,marginTop:8,fontSize:12,color:T.textMuted,cursor:"pointer",fontWeight:600}}>
              <input type="checkbox" checked={!f.dateRdv} onChange={e=>set("dateRdv", e.target.checked ? "" : today())} style={{width:16,height:16,cursor:"pointer"}}/>
              📌 À programmer plus tard (sans date)
            </label>
          </div>
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
        <div style={{marginTop:20,display:"flex",justifyContent:"flex-end"}}>
          <button onClick={()=>{if(validate())onSave({...f,id:f.id||uid(),createdAt:f.createdAt||ts(),type:"rdv",status:"planifie",prestations:f.prestations||[],photos:f.photos||[],materiels:f.materiels||[],preconisations:f.preconisations||[]});}}
            style={{background:"linear-gradient(135deg,#3B82F6,#6366F1)",color:"#fff",border:"none",borderRadius:10,padding:"14px 32px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(59,130,246,0.35)"}}>
            💾 Enregistrer le RDV
          </button>
        </div>
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
          <button onClick={tryPrint} style={{background:"none",border:"1px solid #1a3050",color:"#94A3B8",borderRadius:8,padding:"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🖨 Imprimer</button>
          <button onClick={()=>telechargerPDF(buildReportHTML(fiche,true),`Rapport-${fiche.id}.pdf`)} style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📄 Télécharger PDF</button>
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
function TableauDeBord({ fiches, onNew, onNewRdv, onDemarrer, onSelect, onFilterStatus, theme, taches=[], onAjouterTache, onToggleTache, onSupprimerTache }) {
  const T = THEMES[theme] || THEMES.dark;
  const todayStr = today();
  const [nouvelleTache, setNouvelleTache] = useState("");
  const [nouvellePriorite, setNouvellePriorite] = useState("À faire");
  const [tachePhoto, setTachePhoto] = useState("");
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
          {label:"RDV planifiés",val:rdvPlanifies.filter(f=>!estAProgrammer(f)).length,icon:"📅",color:"#3B82F6",action:()=>onFilterStatus("planifie")},
          {label:"À planifier",val:fiches.filter(estAProgrammer).length,icon:"📌",color:"#64748B",action:()=>onFilterStatus("__aprogrammer")},
          {label:"En cours",val:byStatus.en_cours||0,icon:"⚡",color:"#F59E0B",action:()=>onFilterStatus("en_cours")},
          {label:"Terminées",val:byStatus.termine||0,icon:"✅",color:"#10B981",action:()=>onFilterStatus("termine")},
          {label:"Signées",val:fiches.filter(f=>f.signature).length,icon:"✍️",color:"#A78BFA",action:()=>onFilterStatus("__signees")},
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

      {/* ── Liste de tâches partagée ── */}
      <div style={{...card,border:"1.5px solid rgba(168,139,250,0.3)"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#A78BFA",textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>📝 Tâches à faire ({taches.filter(t=>!t.fait).length})</div>

        {/* Formulaire d'ajout */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          <input value={nouvelleTache} onChange={e=>setNouvelleTache(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&nouvelleTache.trim()){onAjouterTache(nouvelleTache,nouvellePriorite,tachePhoto);setNouvelleTache("");setTachePhoto("");}}}
            placeholder="Nouvelle tâche…"
            style={{flex:1,minWidth:140,padding:"10px 12px",borderRadius:9,border:`1px solid ${T.border}`,background:T.bg,color:T.text,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}/>
          <select value={nouvellePriorite} onChange={e=>setNouvellePriorite(e.target.value)}
            style={{padding:"10px 12px",borderRadius:9,border:`1px solid ${T.border}`,background:T.bg,color:T.text,fontSize:13,fontFamily:"inherit",cursor:"pointer",colorScheme:theme==="dark"?"dark":"light"}}>
            <option>Très urgent</option>
            <option>À faire</option>
            <option>A le temps</option>
          </select>
          <label style={{padding:"10px 12px",borderRadius:9,border:`1px solid ${tachePhoto?"#10B981":T.border}`,background:T.bg,color:tachePhoto?"#10B981":T.textMuted,fontSize:13,fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
            {tachePhoto?"✓ Photo":"📷 Photo"}
            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];if(file){const r=new FileReader();r.onload=ev=>setTachePhoto(ev.target.result);r.readAsDataURL(file);}}}/>
          </label>
          <button onClick={()=>{if(nouvelleTache.trim()){onAjouterTache(nouvelleTache,nouvellePriorite,tachePhoto);setNouvelleTache("");setTachePhoto("");}}}
            style={{padding:"10px 18px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:9,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Ajouter</button>
        </div>

        {/* Liste triée par priorité */}
        {taches.length===0 ? (
          <div style={{fontSize:13,color:T.textMuted,textAlign:"center",padding:"14px 0"}}>Aucune tâche pour le moment.</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {[...taches].sort((a,b)=>{
              if(a.fait!==b.fait) return a.fait?1:-1;
              const ordre={"Très urgent":0,"À faire":1,"A le temps":2};
              return (ordre[a.priorite]??1)-(ordre[b.priorite]??1);
            }).map(t=>{
              const coul = t.priorite==="Très urgent"?"#EF4444":t.priorite==="A le temps"?"#64748B":"#F59E0B";
              return (
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:T.surface2,borderRadius:9,padding:"10px 12px",border:`1px solid ${T.border}`,borderLeft:`4px solid ${t.fait?"#10B981":coul}`,opacity:t.fait?0.55:1}}>
                  <input type="checkbox" checked={!!t.fait} onChange={()=>onToggleTache(t)} style={{width:18,height:18,cursor:"pointer",flexShrink:0,accentColor:"#10B981"}}/>
                  {t.photo && <img src={t.photo} alt="" style={{width:34,height:34,borderRadius:7,objectFit:"cover",flexShrink:0,cursor:"pointer"}} onClick={()=>window.open(t.photo,"_blank")}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:T.text,textDecoration:t.fait?"line-through":"none",wordBreak:"break-word"}}>{t.titre}</div>
                    {!t.fait && <span style={{fontSize:10,fontWeight:800,color:coul,textTransform:"uppercase",letterSpacing:".05em"}}>{t.priorite}</span>}
                  </div>
                  <button onClick={()=>onSupprimerTache(t.id)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:15,fontFamily:"inherit",flexShrink:0,padding:4}}>🗑</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RDV à réaliser + À planifier */}
      {(() => {
        const rdvDates = rdvPlanifies.filter(f=>!estAProgrammer(f)).sort((a,b)=>((a.dateRdv||"")+(a.heureRdv||"")).localeCompare((b.dateRdv||"")+(b.heureRdv||"")));
        const rdvAprog = rdvPlanifies.filter(estAProgrammer);
        const carte = (f,prog) => (
          <div key={f.id} style={{display:"flex",alignItems:"center",gap:12,background:T.surface2,borderRadius:10,padding:"11px 14px",border:`1px solid ${T.border}`,borderLeft:`4px solid ${prog?"#64748B":"#3B82F6"}`,marginBottom:6}}>
            <div style={{minWidth:46,textAlign:"center",flexShrink:0}}>
              {prog
                ? <div style={{fontSize:18}}>📌</div>
                : <><div style={{fontSize:11,fontWeight:800,color:"#3B82F6"}}>{f.dateRdv?new Date(f.dateRdv).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}):"--/--"}</div>
                    <div style={{fontSize:12,fontWeight:700,color:"#60A5FA"}}>{f.heureRdv||"--:--"}</div></>}
            </div>
            <div style={{width:1,height:32,background:T.border}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:T.text,lineHeight:1.25,wordBreak:"break-word"}}>{f.client||"Client non renseigné"}</div>
              <div onClick={()=>f.adresse&&window.open(`https://waze.com/ul?navigate=yes&q=${encodeURIComponent(f.adresse)}`,"_blank")}
                style={{fontSize:11,color:f.adresse?"#0EA5E9":T.textMuted,cursor:f.adresse?"pointer":"default",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:f.adresse?600:400}}>
                📍 {f.adresse||"—"}{f.adresse?" → GPS":""}
              </div>
              {f.tel&&<a href={`tel:${f.tel}`} style={{fontSize:11,color:"#10B981",fontWeight:600,textDecoration:"none"}}>📞 {f.tel}</a>}
              {f.technicien&&<div style={{fontSize:10,color:T.textMuted}}>👤 {f.technicien}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
              <button onClick={()=>onDemarrer(f)} style={{padding:"7px 12px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>▶ Démarrer</button>
              <button onClick={()=>onSelect(f)} style={{padding:"5px 12px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>👁 Voir</button>
            </div>
          </div>
        );
        return (
          <>
            {rdvDates.length>0&&(
              <div style={{...card,border:"1.5px solid rgba(59,130,246,0.3)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#3B82F6",textTransform:"uppercase",letterSpacing:".1em"}}>📅 RDV à réaliser ({rdvDates.length})</div>
                  <button onClick={onNewRdv} style={{padding:"5px 12px",background:"none",border:"1px solid #3B82F6",borderRadius:8,color:"#3B82F6",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Nouveau RDV</button>
                </div>
                {rdvDates.map(f=>carte(f,false))}
              </div>
            )}
            {rdvAprog.length>0&&(
              <div style={{...card,border:"1.5px solid rgba(100,116,139,0.4)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:".1em"}}>📌 À planifier ({rdvAprog.length})</div>
                  <button onClick={onNewRdv} style={{padding:"5px 12px",background:"none",border:"1px solid #64748B",borderRadius:8,color:"#94A3B8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Nouveau RDV</button>
                </div>
                {rdvAprog.map(f=>carte(f,true))}
              </div>
            )}
          </>
        );
      })()}

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
function AgendaCarte({ fiche, onSelect, onDemarrer, T, etat, techniciens=[], techColors={} }) {
  const isRdv = fiche.type==="rdv"||(fiche.status==="planifie"&&!fiche.prestations?.length);
  const prestas = fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
  const aProg = estAProgrammer(fiche);
  const e = aProg ? "prog" : (etat || (isRdv?"rdv":"complete"));
  const COUL = { rdv:"#3B82F6", complete:"#10B981", prog:"#64748B" };
  const BADGE = { rdv:{t:"📅 RDV à faire",c:"#3B82F6"}, complete:{t:"✅ Terminée",c:"#10B981"}, prog:{t:"📌 À planifier",c:"#64748B"} };
  const badgeInfo = (e==="complete" && fiche.status==="a_prevoir") ? {t:"⚠️ Retour à prévoir",c:"#F97316"}
    : (e==="complete" && fiche.status==="annule") ? {t:"✕ Annulée",c:"#EF4444"}
    : BADGE[e];
  const accent = COUL[e];
  const tColor = fiche.technicien ? techColor(fiche.technicien, techniciens, techColors) : null;
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,background:T.surface,border:`1px solid ${T.border}`,borderLeft:`4px solid ${tColor||accent}`,borderRadius:12,padding:"12px 16px",marginBottom:6,transition:"all .2s"}}>
      <div style={{textAlign:"center",minWidth:58,flexShrink:0}}>
        {fiche.dateRdv&&<div style={{fontSize:10,fontWeight:800,color:T.textMuted,whiteSpace:"nowrap"}}>{new Date(fiche.dateRdv).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"})}</div>}
        <div style={{fontSize:15,fontWeight:800,color:isRdv?"#3B82F6":"#0EA5E9"}}>{fiche.heureRdv||"--:--"}</div>
        <div style={{fontSize:9,fontWeight:700,marginTop:2,color:aProg?"#64748B":(isRdv?"#3B82F6":STATUTS[fiche.status]?.color)}}>{aProg?"📌 À planifier":(isRdv?"📅 RDV":`● ${STATUTS[fiche.status]?.label}`)}</div>
        {fiche.urgent&&<div style={{fontSize:8,color:"#EF4444",fontWeight:800,marginTop:1}}>🚨 URGENCE</div>}
      </div>
      <div style={{width:1,height:36,background:T.border}}/>
      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onSelect(fiche)}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <div style={{fontWeight:700,fontSize:14,color:T.text,wordBreak:"break-word"}}>{fiche.client||"Client non renseigné"}</div>
          <span style={{fontSize:9.5,fontWeight:800,color:badgeInfo.c,background:badgeInfo.c+"1A",padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap"}}>{badgeInfo.t}</span>
        </div>
        {(fiche.tempsInterne||fiche.majorations?.length>0)&&(
          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginTop:4}}>
            {fiche.tempsInterne&&<span style={{fontSize:10.5,fontWeight:800,color:"#F59E0B",background:"rgba(245,158,11,0.14)",padding:"3px 9px",borderRadius:12,whiteSpace:"nowrap"}}>⏱️ {fiche.tempsInterne}</span>}
            {fiche.majorations?.includes("soir50")&&<span style={{fontSize:10.5,fontWeight:800,color:"#F59E0B",background:"rgba(245,158,11,0.14)",padding:"3px 8px",borderRadius:12,whiteSpace:"nowrap"}}>🌙 +50%</span>}
            {fiche.majorations?.includes("weekend100")&&<span style={{fontSize:10.5,fontWeight:800,color:"#EF4444",background:"rgba(239,68,68,0.14)",padding:"3px 8px",borderRadius:12,whiteSpace:"nowrap"}}>🌃 +100%</span>}
          </div>
        )}
        <div style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {fiche.adresse
            ? <span onClick={e=>{e.stopPropagation();window.open(`https://waze.com/ul?navigate=yes&q=${encodeURIComponent(fiche.adresse)}`,"_blank");}} style={{cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>📍 {fiche.adresse}</span>
            : "📍 —"}
          {fiche.technicien?` · 👤 ${fiche.technicien}`:""}
        </div>
        {fiche.tel&&(
          <a href={`tel:${fiche.tel}`} onClick={e=>e.stopPropagation()} style={{fontSize:11,color:"#0EA5E9",fontWeight:600,textDecoration:"none"}}>📞 {fiche.tel}</a>
        )}
        {fiche.technicien&&tColor&&(
          <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10.5,fontWeight:700,color:tColor,background:tColor+"1A",padding:"2px 8px",borderRadius:12,marginTop:2}}>
            👤 {fiche.technicien}
          </span>
        )}
        {fiche.typesIntervention?.length>0&&(
          <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
            {fiche.typesIntervention.map(id=>{const p=PRESTATIONS.find(x=>x.id===id);return p?<span key={id} style={{fontSize:10,fontWeight:600,color:p.color,background:p.color+"18",padding:"1px 7px",borderRadius:12}}>{p.icon} {p.label}</span>:null;})}
          </div>
        )}
      </div>
      {!isRdv&&(
        <button onClick={(ev)=>{ev.stopPropagation();telechargerPDF(buildReportHTML(fiche,true),`Rapport-${fiche.id}.pdf`);}}
          title="Ouvrir le PDF du rapport"
          style={{padding:"7px 12px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>📄 PDF</button>
      )}
      {isRdv&&<button onClick={()=>onDemarrer(fiche)} style={{padding:"7px 14px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>▶ Démarrer</button>}
    </div>
  );
}

function Agenda({ fiches, onSelect, onDemarrer, onNewRdv, onProgrammer, theme, techniciens=[], techColors={} }) {
  const T = THEMES[theme] || THEMES.dark;
  const todayStr = today();
  const [selDay, setSelDay] = useState(todayStr);

  const parseD = (s) => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d, 12); };
  const toStr = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;

  // Lundi de la semaine contenant selDay
  const sel = parseD(selDay);
  const lundi = new Date(sel);
  lundi.setDate(sel.getDate() - ((sel.getDay()+6)%7));
  const semaine = [];
  for (let i=0;i<7;i++){ const dt=new Date(lundi); dt.setDate(lundi.getDate()+i); semaine.push(toStr(dt)); }

  const byDay = {};
  const sansDate = [];
  fiches.forEach(f=>{ if(f.dateRdv) (byDay[f.dateRdv]=byDay[f.dateRdv]||[]).push(f); else sansDate.push(f); });

  const navSemaine = (delta) => { const dt=new Date(lundi); dt.setDate(lundi.getDate()+delta*7); setSelDay(toStr(dt)); };

  const dayFiches = (byDay[selDay]||[]).sort((a,b)=>(a.heureRdv||"").localeCompare(b.heureRdv||""));
  // État : "rdv" (à faire), "complete" (fiche OK), "incomplete" (fiche commencée mais manques)
  const etatFiche = (f) => {
    const isRdv = f.type==="rdv" || (f.status==="planifie" && !f.prestations?.length);
    return isRdv ? "rdv" : "complete";
  };
  const ETAT_COULEUR = { rdv:"#3B82F6", complete:"#10B981" };
  const colorOf = (f) => ETAT_COULEUR[etatFiche(f)];
  const jours = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

  // Libellé de la semaine (ex : "9 – 15 juin 2026")
  const finSemaine = parseD(semaine[6]);
  const moisDeb = lundi.toLocaleDateString("fr-FR",{month:"short"});
  const moisFin = finSemaine.toLocaleDateString("fr-FR",{month:"short"});
  const labelSemaine = moisDeb===moisFin
    ? `${lundi.getDate()} – ${finSemaine.getDate()} ${finSemaine.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}`
    : `${lundi.getDate()} ${moisDeb} – ${finSemaine.getDate()} ${moisFin} ${finSemaine.getFullYear()}`;

  return (
    <div>
      {/* En-tête semaine */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <button onClick={()=>navSemaine(-1)} style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>◀</button>
        <div style={{flex:1,textAlign:"center",fontWeight:800,fontSize:15,color:T.text,textTransform:"capitalize"}}>{labelSemaine}</div>
        <button onClick={()=>navSemaine(1)} style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>▶</button>
        <button onClick={()=>setSelDay(todayStr)} style={{padding:"9px 14px",borderRadius:8,border:`1px solid #0EA5E9`,background:"rgba(14,165,233,0.1)",color:"#0EA5E9",cursor:"pointer",fontSize:12,fontWeight:800,fontFamily:"inherit"}}>Aujourd'hui</button>
      </div>

      {/* Bande semaine : 7 jours */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:16}}>
        {semaine.map((d,i)=>{
          const evts = byDay[d]||[];
          const isToday = d===todayStr, isSel = d===selDay;
          return (
            <div key={d} onClick={()=>{setSelDay(d);if(!evts.length&&onNewRdv)onNewRdv(d);}}
              style={{borderRadius:10,padding:"8px 2px 7px",cursor:"pointer",textAlign:"center",minHeight:62,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",gap:3,
                border:`1.5px solid ${isSel?"#0EA5E9":isToday?"rgba(16,185,129,0.5)":T.border}`,
                background:isSel?"rgba(14,165,233,0.14)":isToday?"rgba(16,185,129,0.07)":T.surface}}>
              <div style={{fontSize:9,fontWeight:700,color:T.textMuted,textTransform:"uppercase"}}>{jours[i]}</div>
              <div style={{fontSize:16,fontWeight:isToday||isSel?800:600,color:isToday?"#10B981":isSel?"#0EA5E9":T.text}}>{parseInt(d.slice(8))}</div>
              <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"center",minHeight:6}}>
                {evts.slice(0,3).map((f,k)=><span key={k} style={{width:5,height:5,borderRadius:"50%",background:f.technicien?techColor(f.technicien,techniciens,techColors):colorOf(f),display:"inline-block"}}/>)}
              </div>
              {evts.length>0&&<div style={{fontSize:8.5,fontWeight:800,color:isSel?"#0EA5E9":T.textMuted}}>{evts.length}</div>}
            </div>
          );
        })}
      </div>

      {/* Légende techniciens */}
      {techniciens.filter(t=>fiches.some(f=>f.technicien===t)).length>0&&(
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,justifyContent:"center"}}>
          {techniciens.filter(t=>fiches.some(f=>f.technicien===t)).map(t=>(
            <span key={t} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.text,fontWeight:600}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:techColor(t,techniciens,techColors),display:"inline-block"}}/>
              {t}
            </span>
          ))}
          <span style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textMuted,fontWeight:600}}><span style={{width:9,height:9,borderRadius:"50%",background:"#10B981"}}/>Terminée</span>
        </div>
      )}
      {techniciens.filter(t=>fiches.some(f=>f.technicien===t)).length===0&&(
      <div style={{display:"flex",gap:14,justifyContent:"center",marginBottom:14,flexWrap:"wrap"}}>
        <span style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textMuted,fontWeight:600}}><span style={{width:9,height:9,borderRadius:"50%",background:"#3B82F6"}}/>RDV à faire</span>
        <span style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textMuted,fontWeight:600}}><span style={{width:9,height:9,borderRadius:"50%",background:"#10B981"}}/>Terminée</span>
      </div>
      )}

      {/* Jour sélectionné */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{background:selDay===todayStr?"linear-gradient(135deg,#10B981,#059669)":"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",borderRadius:10,padding:"7px 15px",fontWeight:800,fontSize:13}}>
          {selDay===todayStr?"📅 Aujourd'hui":dateFr(selDay)}
        </div>
        <div style={{flex:1,height:1,background:T.border}}/>
        <span style={{fontSize:12,color:T.textMuted}}>{dayFiches.length} RDV</span>
        {onNewRdv&&<button onClick={()=>onNewRdv(selDay)} style={{padding:"7px 13px",background:"linear-gradient(135deg,#3B82F6,#2563EB)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>➕ RDV</button>}
      </div>
      {dayFiches.length===0
        ? <div onClick={()=>onNewRdv&&onNewRdv(selDay)} style={{textAlign:"center",padding:"24px",color:T.textMuted,fontSize:13,background:T.surface,border:`1px dashed ${T.border}`,borderRadius:12,cursor:onNewRdv?"pointer":"default"}}>Rien de prévu ce jour{onNewRdv?" — touchez pour ajouter ➕":""}</div>
        : dayFiches.map(fiche=><AgendaCarte key={fiche.id} fiche={fiche} etat={etatFiche(fiche)} onSelect={onSelect} onDemarrer={onDemarrer} T={T} techniciens={techniciens} techColors={techColors}/>)}

      {/* Sans date */}
      {sansDate.length>0&&(
        <div style={{marginTop:18}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{background:"linear-gradient(135deg,#64748B,#475569)",color:"#fff",borderRadius:10,padding:"6px 14px",fontWeight:800,fontSize:13}}>📌 À programmer</div>
            <div style={{flex:1,height:1,background:T.border}}/>
            <span style={{fontSize:12,color:T.textMuted}}>{sansDate.length} entrée(s)</span>
          </div>
          {sansDate.map(fiche=>(
            <div key={fiche.id}>
              <AgendaCarte fiche={fiche} etat={etatFiche(fiche)} onSelect={onSelect} onDemarrer={onDemarrer} T={T} techniciens={techniciens} techColors={techColors}/>
              {onProgrammer&&(
                <div style={{display:"flex",alignItems:"center",gap:8,margin:"-2px 0 12px",paddingLeft:6}}>
                  <span style={{fontSize:12,color:T.textMuted,fontWeight:600}}>📅 Programmer :</span>
                  <input type="date" onChange={e=>{ if(e.target.value) onProgrammer(fiche, e.target.value); }}
                    style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,fontFamily:"inherit",cursor:"pointer",colorScheme:(theme==="light")?"light":"dark"}}/>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CarteFiche({ fiche, onSelect, onDelete, T }) {
  const prestas=fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
  const main=prestas[0];
  const aProg = estAProgrammer(fiche);
  const statutLabel = aProg ? "À planifier" : STATUTS[fiche.status]?.label;
  const statutColor = aProg ? "#64748B" : STATUTS[fiche.status]?.color;
  return(
    <div onClick={()=>onSelect(fiche)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=main?.color||"#0EA5E9";e.currentTarget.style.transform="translateY(-2px)";}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${aProg?"#64748B":(main?.color||"#0EA5E9")},transparent)`}}/>
      {fiche.urgent&&<div style={{position:"absolute",top:8,right:8,fontSize:10,fontWeight:700,color:"#EF4444",background:"rgba(239,68,68,0.1)",padding:"2px 8px",borderRadius:12}}>🚨 Urgence</div>}
      <div style={{fontFamily:"monospace",fontSize:10,color:"#0EA5E9",fontWeight:700,marginBottom:3}}>{fiche.id}</div>
      <div style={{fontWeight:800,fontSize:15,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fiche.client||"Client non renseigné"}</div>
      <div style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {fiche.adresse||"—"}</div>
      {fiche.dateRdv&&<div style={{fontSize:11,color:"#60A5FA",fontWeight:600,marginTop:3}}>📅 {dateFr(fiche.dateRdv)}{fiche.heureRdv?" · "+fiche.heureRdv:""}</div>}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:8}}>
        {prestas.map((p,i)=><span key={i} style={{fontSize:11,fontWeight:600,color:p.color,background:p.color+"18",padding:"3px 9px",borderRadius:20}}>{p.icon} {p.label.split(" ")[0]}</span>)}
      </div>
      {(fiche.tempsInterne||fiche.majorations?.length>0)&&(
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:7}}>
          {fiche.tempsInterne&&<span style={{fontSize:10.5,fontWeight:800,color:"#F59E0B",background:"rgba(245,158,11,0.14)",padding:"3px 9px",borderRadius:12}}>⏱️ {fiche.tempsInterne}</span>}
          {fiche.majorations?.includes("soir50")&&<span style={{fontSize:10.5,fontWeight:800,color:"#F59E0B",background:"rgba(245,158,11,0.14)",padding:"3px 8px",borderRadius:12}}>🌙 +50%</span>}
          {fiche.majorations?.includes("weekend100")&&<span style={{fontSize:10.5,fontWeight:800,color:"#EF4444",background:"rgba(239,68,68,0.14)",padding:"3px 8px",borderRadius:12}}>🌃 +100%</span>}
        </div>
      )}
      <div style={{marginTop:10,fontSize:11,borderTop:`1px solid ${T.border}`,paddingTop:8,display:"flex",justifyContent:"space-between",color:T.textMuted}}>
        <span>{fiche.technicien&&`👤 ${fiche.technicien}`}</span>
        <span style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:statutColor}}>{aProg?"📌":"●"} {statutLabel}</span>
          {fiche.signature&&"· ✍️"}
          {fiche.prestations?.length>0&&<button onClick={e=>{e.stopPropagation();telechargerPDF(buildReportHTML(fiche,true),`Rapport-${fiche.id}.pdf`);}} title="Ouvrir le PDF du rapport" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#0EA5E9",padding:"0 2px",fontFamily:"inherit",fontWeight:700}}>📄</button>}
          {onDelete&&<button onClick={e=>{e.stopPropagation();onDelete(fiche);}} title="Supprimer" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#EF4444",padding:"0 2px",fontFamily:"inherit"}}>🗑️</button>}
        </span>
      </div>
    </div>
  );
}

function ListeCartes({ fiches, onSelect, onDelete, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  if(fiches.length===0) return <Empty icon="📭" text="Aucune fiche trouvée" T={T}/>;
  const aProgrammer = fiches.filter(estAProgrammer);
  const autres = fiches.filter(f=>!estAProgrammer(f));
  const grille = (arr) => (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
      {arr.map(fiche=><CarteFiche key={fiche.id} fiche={fiche} onSelect={onSelect} onDelete={onDelete} T={T}/>)}
    </div>
  );
  return (
    <div>
      {aProgrammer.length>0&&(
        <div style={{marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{background:"linear-gradient(135deg,#64748B,#475569)",color:"#fff",borderRadius:10,padding:"6px 14px",fontWeight:800,fontSize:13}}>📌 À planifier</div>
            <div style={{flex:1,height:1,background:T.border}}/>
            <span style={{fontSize:12,color:T.textMuted}}>{aProgrammer.length} fiche(s)</span>
          </div>
          {grille(aProgrammer)}
        </div>
      )}
      {autres.length>0&&aProgrammer.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",borderRadius:10,padding:"6px 14px",fontWeight:800,fontSize:13}}>🗂️ Interventions</div>
          <div style={{flex:1,height:1,background:T.border}}/>
          <span style={{fontSize:12,color:T.textMuted}}>{autres.length} fiche(s)</span>
        </div>
      )}
      {grille(autres)}
    </div>
  );
}

/* ═══════════════════════════════════════════
   DÉTAIL FICHE
═══════════════════════════════════════════ */
function DetailFiche({ fiche, onBack, onEdit, onDelete, onDemarrer, onCreateDevis, onToggleFacturation, onDuplicate, theme, techTels = {}, onSaveTechTel = null, sousTraitants = [], onSaveSousTraitants = null }) {
  const T = THEMES[theme] || THEMES.dark;
  const [showPreview, setShowPreview] = useState(false);
  const [showFacturation, setShowFacturation] = useState(false);
  const [showSousTraitant, setShowSousTraitant] = useState(false);
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
      {showFacturation&&<FacturationModal fiche={fiche} theme={theme} onClose={()=>setShowFacturation(false)}/>}
      {showSousTraitant&&<SousTraitantModal fiche={fiche} sousTraitants={sousTraitants} onSaveSousTraitants={onSaveSousTraitants||(()=>{})} theme={theme} onClose={()=>setShowSousTraitant(false)}/>}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <code style={{fontSize:12,color:isRdv?"#3B82F6":"#0EA5E9",background:isRdv?"rgba(59,130,246,0.1)":"rgba(14,165,233,0.1)",border:`1px solid ${isRdv?"rgba(59,130,246,0.2)":"rgba(14,165,233,0.2)"}`,padding:"5px 12px",borderRadius:6,fontWeight:700}}>
          {isRdv?"📅 RDV — ":""}{fiche.id}
        </code>
        {fiche.urgent&&<span style={{fontSize:11,fontWeight:700,color:"#EF4444",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",padding:"4px 10px",borderRadius:20}}>🚨 URGENCE</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:7,flexWrap:"wrap"}}>
          <button onClick={onDelete} style={{background:"none",border:"1px solid #7F1D1D",color:"#EF4444",borderRadius:8,padding:"8px 12px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
          <button onClick={onEdit} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✏️ Modifier</button>
          {onDuplicate&&<button onClick={onDuplicate} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📋 Dupliquer</button>}
          <button onClick={()=>setShowSousTraitant(true)} style={{background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📤 Envoyer au sous-traitant</button>
          {isRdv?(
            <button onClick={()=>onDemarrer(fiche)} style={{background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>▶ Démarrer l'intervention</button>
          ):(
            <button onClick={()=>setShowPreview(true)} style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📄 Voir le rapport</button>
          )}
          {!isRdv&&onCreateDevis&&(
            <button onClick={()=>onCreateDevis(fiche)} style={{background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🧾 Créer devis</button>
          )}
          {!isRdv&&(
            <button onClick={()=>setShowFacturation(true)} style={{background:"linear-gradient(135deg,#10B981,#0D9488)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>💶 Proposition de facturation</button>
          )}
        </div>
      </div>

      {/* Carte infos */}
      <div style={card}>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:T.text}}>{fiche.client||"Client non renseigné"}</h2>
        {fiche.adresse&&(
          <div onClick={()=>window.open(`https://waze.com/ul?navigate=yes&q=${encodeURIComponent(fiche.adresse)}`,"_blank")}
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
          {!isRdv&&onToggleFacturation&&(
            <span style={{display:"flex",gap:5}}>
              {Object.entries(FACTURATION).map(([k,v])=>(
                <button key={k} onClick={()=>onToggleFacturation(fiche, fiche.facturation===k?"":k)}
                  style={{fontSize:10.5,fontWeight:700,padding:"3px 10px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
                    background:fiche.facturation===k?v.color+"22":"transparent",
                    border:`1.5px solid ${fiche.facturation===k?v.color:T.border}`,
                    color:fiche.facturation===k?v.color:T.textMuted}}>
                  {k==="facture"?"✅ ":"💶 "}{v.label}
                </button>
              ))}
            </span>
          )}
        </div>
        {fiche.noteRdv&&isRdv&&<div style={{marginTop:10,background:"rgba(59,130,246,0.08)",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#93C5FD"}}>💬 {fiche.noteRdv}</div>}
      </div>

      {!isRdv&&fiche.prestations?.length>0&&(
        <div style={card}>
          <div style={secHead}>🔧 Prestations ({fiche.prestations.length})</div>
          {(fiche.prestations||[]).map(p=>{
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

      {/* Temps passé & facturation (usage interne, visible gestion) */}
      {!isRdv&&(fiche.tempsInterne||fiche.majorations?.length)&&(
        <div style={{...card,border:"1px solid rgba(245,158,11,0.35)",background:isRdv?T.surface:"rgba(245,158,11,0.05)"}}>
          <div style={{...secHead,color:"#F59E0B",borderColor:"rgba(245,158,11,0.25)"}}>⏱️ Temps passé & facturation <span style={{marginLeft:"auto",fontSize:9,opacity:.7}}>🔒 interne</span></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:20,alignItems:"center"}}>
            {fiche.tempsInterne&&<div><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Temps sur place</div><div style={{fontSize:20,fontWeight:800,color:T.text}}>{fiche.tempsInterne}</div></div>}
            {fiche.tarifHoraire&&fiche.tempsInterne&&(()=>{
              const base = calculerMontant(fiche.tempsInterne, fiche.tarifHoraire);
              let coef = 1; (fiche.majorations||[]).forEach(m=>{ if(m==="soir50")coef+=0.5; if(m==="weekend100")coef+=1; });
              const total = base!=null ? (parseFloat(base)*coef).toFixed(2) : null;
              return total!=null ? <div><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Montant estimé{coef>1?" (majoré)":""}</div><div style={{fontSize:20,fontWeight:800,color:"#10B981"}}>{total} €</div></div> : null;
            })()}
            {fiche.majorations?.length>0&&<div style={{flex:1,minWidth:140}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Majorations</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{fiche.majorations.map(m=><span key={m} style={{fontSize:11,fontWeight:700,color:m==="weekend100"?"#EF4444":"#F59E0B",background:(m==="weekend100"?"#EF4444":"#F59E0B")+"1A",padding:"4px 10px",borderRadius:20}}>{m==="soir50"?"🌙 +50 %":"🌃 +100 %"}</span>)}</div></div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   APP PRINCIPALE
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   DEVIS — formulaire & liste
═══════════════════════════════════════════ */
function DevisForm({ initial, onSave, onBack, theme, clients = [], champsCustom = {} }) {
  const catalogue = champsCustom?._global?.devisCatalogue?.length ? champsCustom._global.devisCatalogue : DEVIS_CATALOGUE;
  const T = THEMES[theme] || THEMES.dark;
  const [d, setD] = useState(()=>({ tva:10, lignes:[], photos:[], notes:"", statut:"brouillon", releve:{colonnes:[],metres:[]}, ...(initial||{}) }));
  // Relevé terrain (L/M) : entrées cumulatives
  const releve = d.releve || {colonnes:[],metres:[]};
  const [relInput, setRelInput] = useState({colonnes:"",metres:""});
  const [relNote, setRelNote] = useState({colonnes:"",metres:""});
  const addReleve = (type) => {
    const val = parseFloat(relInput[type]);
    if(isNaN(val)||val<=0) return;
    const entree = { v: val, note: (relNote[type]||"").trim() };
    setD(p=>({...p, releve:{...(p.releve||{colonnes:[],metres:[]}), [type]:[...((p.releve||{})[type]||[]), entree]}}));
    setRelInput(p=>({...p,[type]:""})); setRelNote(p=>({...p,[type]:""}));
  };
  const delReleve = (type,i) => setD(p=>({...p, releve:{...(p.releve||{}), [type]:((p.releve||{})[type]||[]).filter((_,j)=>j!==i)}}));
  const totalReleve = (type) => (releve[type]||[]).reduce((s,e)=>s+(e.v||0),0);
  const photosDispo = initial?._photosDispo || [];
  const photoRef = useRef();
  const [genIA, setGenIA] = useState(false);
  const genererDescriptifIA = async () => {
    const lignesValides = d.lignes.filter(l=>l.label?.trim());
    if(!lignesValides.length){alert("Ajoutez d'abord des lignes au devis.");return;}
    setGenIA(true);
    try {
      const prompt = `Tu rédiges le descriptif d'un devis pour une entreprise d'assainissement/plomberie. Rédige un court paragraphe professionnel (3 à 5 phrases, français soigné, ton commercial sobre) décrivant les travaux proposés ci-dessous. Utilise "nous proposons" / "notre intervention comprendra". Ne donne AUCUN prix, AUCUN montant. Ne liste pas ligne par ligne : fais des phrases fluides qui regroupent les travaux. Termine par une phrase sur le résultat attendu (rétablissement du bon écoulement, prévention des obstructions...).
${d.client?`Client : ${d.client}`:""}
${d.adresse?`Adresse : ${d.adresse}`:""}
Travaux prévus :
${lignesValides.map(l=>`- ${l.label}${l.qte>1?` (quantité : ${l.qte})`:""}`).join("\n")}
Réponds UNIQUEMENT avec le paragraphe, sans titre ni préambule.`;
      const r = await fetch("/api/claude", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, messages:[{role:"user",content:prompt}] })
      });
      if(!r.ok) throw new Error("API "+r.status);
      const data = await r.json();
      const text = (data.content||[]).map(c=>c.text||"").join("").trim();
      if(!text) throw new Error(data.error?.message||"Réponse vide");
      set("notes", text);
    } catch(e) { alert("Erreur lors de la génération : "+(e?.message||e)); }
    setGenIA(false);
  };
  const set = (k,v)=>setD(p=>({...p,[k]:v}));
  const sitesCli = Object.values(clients.find(x=>x.id===d.clientId)?.sites||{});
  const setLigne = (i,k,v)=>setD(p=>({...p,lignes:p.lignes.map((l,j)=>j===i?{...l,[k]:v}:l)}));
  const { ht, tva, ttc } = devisTotaux(d);
  const inp = {width:"100%",padding:"9px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const lbl = {display:"block",fontSize:9.5,fontWeight:700,color:T.textMuted,letterSpacing:".08em",textTransform:"uppercase",marginBottom:6};
  const sec = {background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px 20px",marginBottom:16};
  const togglePhoto = (p)=>setD(prev=>{
    const has = prev.photos.some(x=>(x.data||x)===(p.data||p));
    return {...prev, photos: has ? prev.photos.filter(x=>(x.data||x)!==(p.data||p)) : [...prev.photos, p]};
  });
  const handleSave = ()=>{ const clean={...d}; Object.keys(clean).forEach(k=>{if(k.startsWith("_"))delete clean[k];}); onSave(clean); };
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <div style={{fontWeight:800,fontSize:17,color:T.text}}>📄 Devis {d.id}</div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={()=>previewDevis(d)} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"9px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🖨 Aperçu</button>
          <button onClick={()=>telechargerPDF(buildDevisHTML(d),`Devis-${d.id}.pdf`)} style={{background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"9px 14px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>
          <button onClick={handleSave} style={{background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>💾 Enregistrer</button>
        </div>
      </div>

      <div style={sec}>
        {clients.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12,background:"rgba(14,165,233,0.06)",border:"1px solid rgba(14,165,233,0.2)",borderRadius:10,padding:"10px"}}>
            <div><div style={lbl}>Client enregistré</div>
              <select value={d.clientId||""} onChange={e=>{const v=e.target.value;const c=clients.find(x=>x.id===v);
                setD(p=>({...p,clientId:v||null,siteId:null,client:c?c.nom:p.client}));}}
                style={{...inp,cursor:"pointer"}}>
                <option value="">— Saisie libre —</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Site</div>
              <select value={d.siteId||""} disabled={!sitesCli.length} onChange={e=>{const v=e.target.value;const s=sitesCli.find(x=>x.id===v);
                setD(p=>({...p,siteId:v||null,site:s?(s.nom||""):p.site,adresse:s?s.adresse:p.adresse}));}}
                style={{...inp,cursor:"pointer",opacity:sitesCli.length?1:.5}}>
                <option value="">{sitesCli.length?"— Choisir —":"—"}</option>
                {sitesCli.map(s=><option key={s.id} value={s.id}>{s.nom||s.adresse}</option>)}
              </select>
            </div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><div style={lbl}>Client</div><input value={d.client||""} onChange={e=>set("client",e.target.value)} style={inp}/></div>
          <div><div style={lbl}>Site</div><input value={d.site||""} onChange={e=>set("site",e.target.value)} style={inp}/></div>
          <div style={{gridColumn:"1/-1"}}><div style={lbl}>Adresse des travaux</div><input value={d.adresse||""} onChange={e=>set("adresse",e.target.value)} style={inp}/></div>
          <div><div style={lbl}>Date</div><input type="date" value={d.date||""} onChange={e=>set("date",e.target.value)} style={{...inp,colorScheme:theme==="dark"?"dark":"light"}}/></div>
          <div><div style={lbl}>TVA</div>
            <select value={d.tva} onChange={e=>set("tva",parseFloat(e.target.value))} style={{...inp,cursor:"pointer",colorScheme:theme==="dark"?"dark":"light"}}>
              <option value={10}>10 %</option><option value={20}>20 %</option><option value={0}>0 %</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{...sec,border:"1px solid rgba(168,139,250,0.35)"}}>
        <div style={{fontSize:13,fontWeight:800,color:"#A78BFA",marginBottom:4}}>📐 Relevé sur place</div>
        <div style={{fontSize:11.5,color:T.textMuted,marginBottom:14}}>Comptez au fur et à mesure : saisissez une quantité, ajoutez une note d'accès si besoin, puis « Ajouter ». Le total se calcule automatiquement.</div>

        {[{type:"colonnes",label:"Colonnes",icon:"🏛️",unite:"col.",ph:"Ex : 3"},{type:"metres",label:"Mètres linéaires (horizontal)",icon:"📏",unite:"ml",ph:"Ex : 12"}].map(blk=>(
          <div key={blk.type} style={{marginBottom:16,padding:"12px 14px",background:T.surface2,borderRadius:10,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,fontWeight:800,color:T.text,marginBottom:9}}>{blk.icon} {blk.label}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <input type="number" value={relInput[blk.type]} onChange={e=>setRelInput(p=>({...p,[blk.type]:e.target.value}))} placeholder={blk.ph}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addReleve(blk.type);}}}
                style={{...inp,width:90,textAlign:"center"}}/>
              <input value={relNote[blk.type]} onChange={e=>setRelNote(p=>({...p,[blk.type]:e.target.value}))} placeholder="Note d'accès (ex : cave, local technique…)"
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addReleve(blk.type);}}}
                style={{...inp,flex:1,minWidth:140}}/>
              <button onClick={()=>addReleve(blk.type)} style={{padding:"9px 16px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Ajouter</button>
            </div>
            {(releve[blk.type]||[]).length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                {(releve[blk.type]||[]).map((e,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,color:T.text,background:T.surface,borderRadius:6,padding:"6px 10px"}}>
                    <span style={{fontWeight:800,color:"#A78BFA",minWidth:46}}>+{e.v} {blk.unite}</span>
                    {e.note&&<span style={{flex:1,color:T.textMuted,fontSize:12}}>📍 {e.note}</span>}
                    {!e.note&&<span style={{flex:1}}/>}
                    <button onClick={()=>delReleve(blk.type,i)} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${T.border}`,paddingTop:8}}>
              <span style={{fontSize:13,fontWeight:800,color:T.text}}>Total : {totalReleve(blk.type)} {blk.unite}</span>
              {totalReleve(blk.type)>0&&(
                <button onClick={()=>{
                  const lab = blk.type==="colonnes" ? `Colonnes (${totalReleve("colonnes")} colonnes)` : `Mètres linéaires horizontaux (${totalReleve("metres")} ml)`;
                  setD(p=>({...p,lignes:[...p.lignes.filter(l=>l.label||l.pu),{label:lab,qte:totalReleve(blk.type),pu:""}]}));
                }} style={{padding:"6px 12px",background:"rgba(168,139,250,0.15)",border:"1px solid #A78BFA",borderRadius:7,color:"#A78BFA",fontWeight:700,fontSize:11.5,cursor:"pointer",fontFamily:"inherit"}}>↓ Ajouter au devis</button>
              )}
            </div>
          </div>
        ))}
        {(releve.colonnes?.some(e=>e.note)||releve.metres?.some(e=>e.note))&&(
          <div style={{fontSize:11.5,color:"#A78BFA",background:"rgba(168,139,250,0.08)",borderRadius:8,padding:"9px 12px"}}>
            💡 Les notes d'accès sont conservées dans le relevé. Pensez à les reporter dans les notes du devis si besoin.
          </div>
        )}
      </div>

      <div style={sec}>
        <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:8}}>Lignes du devis</div>

        {/* Mode forfait */}
        <div style={{marginBottom:14,padding:"12px 14px",background:d.modeForfait?"rgba(167,139,250,0.08)":T.surface2,border:`1.5px solid ${d.modeForfait?"#A78BFA":T.border}`,borderRadius:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:d.modeForfait?12:0}}>
            <button onClick={()=>setD(p=>({...p,modeForfait:!p.modeForfait}))}
              style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",
                border:`1.5px solid ${d.modeForfait?"#A78BFA":T.border}`,
                background:d.modeForfait?"rgba(167,139,250,0.14)":T.surface,
                color:d.modeForfait?"#A78BFA":T.textMuted}}>
              <span style={{width:16,height:16,borderRadius:4,background:d.modeForfait?"#A78BFA":"transparent",border:`2px solid ${d.modeForfait?"#A78BFA":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff"}}>{d.modeForfait?"✓":""}</span>
              💼 Devis forfaitaire (prix global, sans détail par ligne)
            </button>
          </div>
          {d.modeForfait&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:10,alignItems:"end"}}>
              <div>
                <div style={{...lbl,color:"#A78BFA"}}>Intitulé du forfait</div>
                <input value={d.forfaitLabel||""} onChange={e=>set("forfaitLabel",e.target.value)}
                  placeholder="Ex : Curage réseau complet — forfait tout compris"
                  style={{...inp,border:"1.5px solid #A78BFA"}}/>
              </div>
              <div style={{minWidth:140}}>
                <div style={{...lbl,color:"#A78BFA"}}>Prix forfaitaire HT (€)</div>
                <input type="number" value={d.forfaitPrixHT||""} onChange={e=>set("forfaitPrixHT",e.target.value)}
                  placeholder="Ex : 450"
                  style={{...inp,textAlign:"right",border:"1.5px solid #A78BFA"}}/>
              </div>
              {d.forfaitPrixHT&&(
                <div style={{gridColumn:"1/-1",fontSize:13,color:"#A78BFA",fontWeight:600}}>
                  💰 TTC : {euro((parseFloat(d.forfaitPrixHT)||0)*(1+(parseFloat(d.tva)||0)/100))} — TVA {d.tva}%
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{fontSize:10.5,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:7}}>⚡ Prestations types — touchez pour ajouter</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
          {catalogue.map(item=>(
            <button key={item.label} onClick={()=>setD(p=>({...p,lignes:[...p.lignes.filter(l=>l.label||l.pu),{label:`${item.label} (${item.unite})`,qte:1,pu:""}]}))}
              style={{fontSize:11.5,fontWeight:600,padding:"6px 11px",borderRadius:16,cursor:"pointer",fontFamily:"inherit",background:"rgba(14,165,233,0.08)",border:"1px solid rgba(14,165,233,0.3)",color:"#38BDF8"}}>
              + {item.label}
            </button>
          ))}
        </div>
        {d.lignes.map((l,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 64px 90px 90px 32px",gap:6,marginBottom:6,alignItems:"center"}}>
            <input value={l.label} onChange={e=>setLigne(i,"label",e.target.value)} placeholder="Désignation" style={inp}/>
            <input type="number" value={l.qte} onChange={e=>setLigne(i,"qte",e.target.value)} placeholder="Qté" style={{...inp,textAlign:"center"}}/>
            <input type="number" value={l.pu} onChange={e=>setLigne(i,"pu",e.target.value)} placeholder="P.U. HT" style={{...inp,textAlign:"right"}}/>
            <div style={{fontSize:12.5,fontWeight:700,color:T.text,textAlign:"right"}}>{euro((parseFloat(l.qte)||0)*(parseFloat(l.pu)||0))}</div>
            <button onClick={()=>setD(p=>({...p,lignes:p.lignes.filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>✕</button>
          </div>
        ))}
        <button onClick={()=>setD(p=>({...p,lignes:[...p.lignes,{label:"",qte:1,pu:""}]}))} style={{marginTop:6,padding:"8px 14px",background:"none",border:`1.5px dashed ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,fontSize:12.5,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>➕ Ajouter une ligne</button>
        <div style={{marginTop:14,marginLeft:"auto",width:240,fontSize:13}}>
          <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",color:T.textMuted}}><span>Total HT</span><b style={{color:T.text}}>{euro(ht)}</b></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",color:T.textMuted}}><span>TVA {d.tva}%</span><b style={{color:T.text}}>{euro(tva)}</b></div>
          <div style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",borderRadius:8,color:"#fff",fontWeight:800,marginTop:4}}><span>Total TTC</span><span>{euro(ttc)}</span></div>
        </div>
      </div>

      <div style={sec}>
        <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:10}}>📷 Photos jointes au devis ({d.photos.length})</div>
        {d.photos.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8,marginBottom:10}}>
            {d.photos.map((p,i)=>(
              <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",aspectRatio:"4/3"}}>
                <img src={p.data||p} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                <button onClick={()=>setD(prev=>({...prev,photos:prev.photos.filter((_,j)=>j!==i)}))} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>×</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={()=>photoRef.current?.click()} style={{width:"100%",padding:"12px",background:"none",border:`2px dashed ${T.border}`,borderRadius:10,color:T.textMuted,fontWeight:700,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>📸 Ajouter des photos</button>
        <input ref={photoRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>{
          const files=[...(e.target.files||[])].filter(x=>x.type.startsWith("image/"));
          const imgs=await Promise.all(files.map(resizePhoto));
          setD(p=>({...p,photos:[...p.photos,...imgs]})); e.target.value="";
        }}/>
      </div>

      {photosDispo.length>0&&(
        <div style={sec}>
          <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:4}}>🗂️ Photos de la fiche d'intervention</div>
          <div style={{fontSize:11.5,color:T.textMuted,marginBottom:10}}>Touchez les photos à joindre au devis (justification des travaux)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8}}>
            {photosDispo.map((p,i)=>{
              const sel = d.photos.some(x=>(x.data||x)===(p.data||p));
              return (
                <div key={i} onClick={()=>togglePhoto(p)} style={{position:"relative",borderRadius:8,overflow:"hidden",aspectRatio:"4/3",cursor:"pointer",border:`2.5px solid ${sel?"#10B981":T.border}`,opacity:sel?1:.6}}>
                  <img src={p.data||p} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                  {sel&&<div style={{position:"absolute",top:4,right:4,background:"#10B981",color:"#fff",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>✓</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={sec}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{...lbl,marginBottom:0}}>Descriptif / notes (optionnel)</div>
          <button onClick={genererDescriptifIA} disabled={genIA}
            style={{background:genIA?"rgba(167,139,250,0.3)":"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:800,fontSize:12,cursor:genIA?"wait":"pointer",fontFamily:"inherit"}}>
            {genIA?"⏳ Rédaction…":"✨ Rédiger le descriptif (IA)"}
          </button>
        </div>
        <textarea value={d.notes||""} onChange={e=>set("notes",e.target.value)} rows={5} placeholder="Descriptif des travaux, délais, conditions d'accès… (ou touchez ✨ pour une rédaction automatique à partir des lignes)" style={{...inp,resize:"vertical",lineHeight:1.6}}/>
      </div>
    </div>
  );
}

const DEVIS_STATUTS = { brouillon:{label:"Brouillon",color:"#94A3B8"}, envoye:{label:"Envoyé",color:"#0EA5E9"}, accepte:{label:"Accepté",color:"#10B981"}, refuse:{label:"Refusé",color:"#EF4444"} };

function DevisList({ devisList, onOpen, onDelete, onChangeStatut, onCreate, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const sorted = [...devisList].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const btnNew = (
    <button onClick={onCreate} style={{background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:10,padding:"11px 20px",fontWeight:800,fontSize:13.5,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 18px rgba(124,58,237,0.3)"}}>➕ Nouveau devis</button>
  );
  if(!sorted.length) return (
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>{btnNew}</div>
      <Empty icon="📄" text="Aucun devis — créez-en un ici ou depuis une fiche d'intervention" T={T}/>
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}>{btnNew}</div>
      {sorted.map(dv=>{
        const { ttc } = devisTotaux(dv);
        const st = DEVIS_STATUTS[dv.statut]||DEVIS_STATUTS.brouillon;
        return (
          <div key={dv.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:160,cursor:"pointer"}} onClick={()=>onOpen(dv)}>
              <div style={{fontWeight:800,fontSize:14,color:T.text}}>{dv.client||"Client ?"} <code style={{fontSize:10.5,color:"#0EA5E9"}}>{dv.id}</code></div>
              <div style={{fontSize:11.5,color:T.textMuted}}>{dateFr(dv.date)}{dv.site?` · ${dv.site}`:""}</div>
            </div>
            <div style={{fontWeight:800,fontSize:14,color:T.text}}>{euro(ttc)}</div>
            <select value={dv.statut||"brouillon"} onChange={e=>onChangeStatut(dv,e.target.value)} onClick={e=>e.stopPropagation()}
              style={{padding:"6px 9px",background:T.surface2,border:`1.5px solid ${st.color}55`,borderRadius:8,color:st.color,fontSize:11.5,fontWeight:700,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"}}>
              {Object.entries(DEVIS_STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={()=>previewDevis(dv)} title="Aperçu" style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,padding:"7px 10px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>🖨</button>
            <button onClick={()=>telechargerPDF(buildDevisHTML(dv),`Devis-${dv.id}.pdf`)} title="Télécharger PDF" style={{background:"none",border:`1px solid rgba(167,139,250,0.4)`,borderRadius:8,color:"#A78BFA",padding:"7px 10px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>📄</button>
            <button onClick={()=>onDelete(dv)} title="Supprimer" style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>🗑️</button>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CLIENTS & SITES
═══════════════════════════════════════════ */
function ClientsView({ clients, fiches, onSaveClient, onDeleteClient, onSelectFiche, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [newSite, setNewSite] = useState({nom:"",adresse:""});
  const [siteFilter, setSiteFilter] = useState("");
  const client = clients.find(c=>c.id===sel);
  const inp = {width:"100%",padding:"9px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const lbl = {display:"block",fontSize:9.5,fontWeight:700,color:T.textMuted,letterSpacing:".08em",textTransform:"uppercase",marginBottom:5};
  const sec = {background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px 18px",marginBottom:14};

  if (client) {
    const sites = Object.values(client.sites||{});
    const histo = fiches.filter(f=>f.clientId===client.id && (!siteFilter || f.siteId===siteFilter))
      .sort((a,b)=>(b.dateRdv||"").localeCompare(a.dateRdv||""));
    return (
      <div style={{maxWidth:720,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <button onClick={()=>{setSel(null);setSiteFilter("");}} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Clients</button>
          <div style={{fontWeight:800,fontSize:18,color:T.text}}>🏢 {client.nom}</div>
          <button onClick={()=>{if(window.confirm(`Supprimer le client ${client.nom} ? (les fiches existantes sont conservées)`)){onDeleteClient(client.id);setSel(null);}}} style={{marginLeft:"auto",background:"none",border:"1px solid #7F1D1D",color:"#EF4444",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>🗑️ Supprimer</button>
        </div>
        <div style={sec}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"1/-1"}}><div style={lbl}>Nom / Raison sociale</div><input value={client.nom} onChange={e=>onSaveClient({...client,nom:e.target.value})} style={inp}/></div>
            <div><div style={lbl}>Téléphone</div><input value={client.tel||""} onChange={e=>onSaveClient({...client,tel:e.target.value})} style={inp}/></div>
            <div><div style={lbl}>Email</div><input value={client.email||""} onChange={e=>onSaveClient({...client,email:e.target.value})} style={inp}/></div>
          </div>
        </div>
        <div style={sec}>
          <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:10}}>📍 Sites d'intervention ({sites.length})</div>
          {sites.map(s=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:T.surface2,border:`1.5px solid ${siteFilter===s.id?"#0EA5E9":T.border}`,borderRadius:9,marginBottom:6,cursor:"pointer"}} onClick={()=>setSiteFilter(siteFilter===s.id?"":s.id)}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:T.text}}>{s.nom||"Site"}</div>
                <div style={{fontSize:11.5,color:T.textMuted}}>{s.adresse}</div>
              </div>
              <span style={{fontSize:10.5,color:T.textMuted}}>{fiches.filter(f=>f.siteId===s.id).length} fiche(s)</span>
              <button onClick={e=>{e.stopPropagation();if(window.confirm(`Supprimer le site ${s.nom||s.adresse} ?`)){const ns={...client.sites};delete ns[s.id];onSaveClient({...client,sites:ns});if(siteFilter===s.id)setSiteFilter("");}}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>✕</button>
            </div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.6fr auto",gap:6,marginTop:10}}>
            <input value={newSite.nom} onChange={e=>setNewSite(p=>({...p,nom:e.target.value}))} placeholder="Nom du site (ex : Résidence Les Lilas)" style={inp}/>
            <input value={newSite.adresse} onChange={e=>setNewSite(p=>({...p,adresse:e.target.value}))} placeholder="Adresse complète" style={inp}/>
            <button onClick={()=>{if(!newSite.adresse.trim())return;const id=uid2("SITE");onSaveClient({...client,sites:{...(client.sites||{}),[id]:{id,...newSite}}});setNewSite({nom:"",adresse:""});}} style={{padding:"9px 14px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>➕</button>
          </div>
        </div>
        <div style={sec}>
          <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:10}}>
            🗂️ Historique {siteFilter?`— ${sites.find(s=>s.id===siteFilter)?.nom||"site"}`:"(tous sites)"} · {histo.length} fiche(s)
            {siteFilter&&<button onClick={()=>setSiteFilter("")} style={{marginLeft:8,background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.textMuted,fontSize:10.5,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>✕ tous</button>}
          </div>
          {histo.length===0&&<div style={{fontSize:12.5,color:T.textFaint,fontStyle:"italic"}}>Aucune intervention pour le moment.</div>}
          {histo.map(f=>(
            <div key={f.id} onClick={()=>onSelectFiche(f)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
              <code style={{fontSize:10.5,color:"#0EA5E9"}}>{f.id}</code>
              <span style={{fontSize:12,color:T.text,flex:1}}>{dateFr(f.dateRdv)}</span>
              <span style={{fontSize:11,fontWeight:700,color:STATUTS[f.status]?.color}}>● {STATUTS[f.status]?.label}</span>
              {f.facturation&&<span style={{fontSize:10.5,fontWeight:700,color:FACTURATION[f.facturation]?.color}}>{FACTURATION[f.facturation]?.label}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const list = clients.filter(c=>!search||c.nom.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.nom.localeCompare(b.nom));
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <input placeholder="🔍 Rechercher un client…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,flex:1,minWidth:160,width:"auto"}}/>
        <button onClick={()=>{const nom=prompt("Nom du nouveau client :");if(nom?.trim()){const c={id:uid2("CLI"),nom:nom.trim(),tel:"",email:"",sites:{}};onSaveClient(c);setSel(c.id);}}}
          style={{padding:"9px 16px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>➕ Nouveau client</button>
      </div>
      {list.length===0&&<Empty icon="👥" text="Aucun client enregistré" T={T}/>}
      {list.map(c=>{
        const nbSites = Object.keys(c.sites||{}).length;
        const nbFiches = fiches.filter(f=>f.clientId===c.id).length;
        return (
          <div key={c.id} onClick={()=>setSel(c.id)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"13px 16px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>🏢</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:14,color:T.text}}>{c.nom}</div>
              <div style={{fontSize:11.5,color:T.textMuted}}>{nbSites} site(s) · {nbFiches} intervention(s){c.tel?` · 📞 ${c.tel}`:""}</div>
            </div>
            <span style={{color:T.textMuted}}>›</span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CONTRATS D'ENTRETIEN
═══════════════════════════════════════════ */
function ContratsView({ contrats, clients, techniciens, onSaveContrat, onDeleteContrat, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [showForm, setShowForm] = useState(false);
  const [c, setC] = useState({clientId:"",siteId:"",type:CONTRAT_TYPES[0],frequence:"annuel",dateDebut:today(),technicien:"",actif:true});
  const inp = {width:"100%",padding:"9px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"};
  const lbl = {display:"block",fontSize:9.5,fontWeight:700,color:T.textMuted,letterSpacing:".08em",textTransform:"uppercase",marginBottom:5};
  const cli = clients.find(x=>x.id===c.clientId);
  const sites = Object.values(cli?.sites||{});
  const creer = ()=>{
    if(!c.clientId){alert("Choisissez un client (créez-le dans l'onglet Clients si besoin).");return;}
    const site = sites.find(s=>s.id===c.siteId);
    onSaveContrat({ id:uid2("CTR"), clientId:c.clientId, client:cli?.nom||"", siteId:c.siteId||null, site:site?.nom||"", adresse:site?.adresse||"", tel:cli?.tel||"", type:c.type, frequence:c.frequence, dateDebut:c.dateDebut, prochaine:c.dateDebut, technicien:c.technicien, actif:true });
    setShowForm(false);
    setC({clientId:"",siteId:"",type:CONTRAT_TYPES[0],frequence:"annuel",dateDebut:today(),technicien:"",actif:true});
  };
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        <button onClick={()=>setShowForm(!showForm)} style={{padding:"9px 16px",background:showForm?"none":"linear-gradient(135deg,#0EA5E9,#6366F1)",border:showForm?`1px solid ${T.border}`:"none",borderRadius:8,color:showForm?T.textMuted:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{showForm?"✕ Annuler":"➕ Nouveau contrat"}</button>
      </div>
      {showForm&&(
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px 18px",marginBottom:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={lbl}>Client</div>
              <select value={c.clientId} onChange={e=>setC(p=>({...p,clientId:e.target.value,siteId:""}))} style={{...inp,cursor:"pointer"}}>
                <option value="">— Choisir —</option>
                {clients.map(x=><option key={x.id} value={x.id}>{x.nom}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Site</div>
              <select value={c.siteId} onChange={e=>setC(p=>({...p,siteId:e.target.value}))} disabled={!sites.length} style={{...inp,cursor:"pointer",opacity:sites.length?1:.5}}>
                <option value="">{sites.length?"— Choisir —":"Aucun site pour ce client"}</option>
                {sites.map(s=><option key={s.id} value={s.id}>{s.nom||s.adresse}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Type d'entretien</div>
              <select value={c.type} onChange={e=>setC(p=>({...p,type:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                {CONTRAT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Fréquence</div>
              <select value={c.frequence} onChange={e=>setC(p=>({...p,frequence:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                {Object.entries(FREQUENCES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Première intervention</div><input type="date" value={c.dateDebut} onChange={e=>setC(p=>({...p,dateDebut:e.target.value}))} style={inp}/></div>
            <div><div style={lbl}>Technicien (optionnel)</div>
              <select value={c.technicien} onChange={e=>setC(p=>({...p,technicien:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                <option value="">—</option>
                {techniciens.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button onClick={creer} style={{marginTop:14,width:"100%",padding:"11px",background:"linear-gradient(135deg,#10B981,#059669)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>✓ Créer le contrat</button>
          <div style={{fontSize:11,color:T.textMuted,marginTop:8}}>💡 Les interventions seront créées automatiquement dans l'agenda à chaque échéance (30 jours à l'avance).</div>
        </div>
      )}
      {contrats.length===0&&!showForm&&<Empty icon="🔁" text="Aucun contrat d'entretien" T={T}/>}
      {contrats.map(ct=>(
        <div key={ct.id} style={{background:T.surface,border:`1px solid ${ct.actif!==false?T.border:"rgba(239,68,68,0.3)"}`,borderRadius:12,padding:"13px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",opacity:ct.actif!==false?1:.6}}>
          <span style={{fontSize:20}}>🔁</span>
          <div style={{flex:1,minWidth:170}}>
            <div style={{fontWeight:800,fontSize:14,color:T.text}}>{ct.type} — {ct.client}</div>
            <div style={{fontSize:11.5,color:T.textMuted}}>{ct.site||ct.adresse||"—"} · {FREQUENCES[ct.frequence]?.label}{ct.technicien?` · 👤 ${ct.technicien}`:""}</div>
          </div>
          <div style={{fontSize:11.5,fontWeight:700,color:"#3B82F6"}}>📅 Prochaine : {dateFr(ct.prochaine)}</div>
          <button onClick={()=>onSaveContrat({...ct,actif:ct.actif===false})} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:ct.actif!==false?"#F59E0B":"#10B981",padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{ct.actif!==false?"⏸ Suspendre":"▶ Réactiver"}</button>
          <button onClick={()=>{if(window.confirm(`Supprimer le contrat ${ct.type} de ${ct.client} ? Les interventions déjà créées sont conservées.`))onDeleteContrat(ct.id);}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>🗑️</button>
        </div>
      ))}
    </div>
  );
}

function LoginPage({ theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setErr("");
    if(!email.trim() || !pwd){ setErr("Entrez votre email et votre mot de passe."); return; }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pwd);
      // La connexion réussie est détectée par onAuthStateChanged → l'app s'affiche
    } catch(e) {
      const code = e?.code || "";
      if(code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
        setErr("Email ou mot de passe incorrect.");
      else if(code.includes("invalid-email")) setErr("Adresse email invalide.");
      else if(code.includes("too-many-requests")) setErr("Trop de tentatives. Réessayez dans quelques minutes.");
      else if(code.includes("network")) setErr("Pas de connexion internet. Vérifiez votre réseau.");
      else setErr("Connexion impossible. Réessayez.");
      setBusy(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,background:T.surface,border:`1px solid ${T.border}`,borderRadius:18,padding:"34px 26px",boxShadow:"0 12px 48px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:24}}>
          <div style={{width:60,height:60,borderRadius:16,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,boxShadow:"0 6px 20px rgba(14,165,233,0.35)",marginBottom:14}}>🔧</div>
          <div style={{fontSize:20,fontWeight:800,color:T.text}}>InterventionPro</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>Connectez-vous pour continuer</div>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:6}}>Email</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoCapitalize="none" autoCorrect="off"
            onKeyDown={e=>{if(e.key==="Enter")handleLogin();}}
            placeholder="vous@exemple.fr"
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.border}`,background:T.bg,color:T.text,fontSize:15,fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>

        <div style={{marginBottom:18}}>
          <div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:6}}>Mot de passe</div>
          <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")handleLogin();}}
            placeholder="••••••••"
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.border}`,background:T.bg,color:T.text,fontSize:15,fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>

        {err && <div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.4)",color:"#EF4444",borderRadius:9,padding:"10px 12px",fontSize:13,fontWeight:600,marginBottom:14}}>{err}</div>}

        <button onClick={handleLogin} disabled={busy}
          style={{width:"100%",padding:"13px",background:busy?"#64748B":"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:15,cursor:busy?"default":"pointer",fontFamily:"inherit",boxShadow:"0 4px 18px rgba(14,165,233,0.3)"}}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>

        <div style={{fontSize:11.5,color:T.textMuted,textAlign:"center",marginTop:18,lineHeight:1.5}}>
          Une fois connecté, vous restez identifié sur cet appareil.<br/>Pas besoin de retaper à chaque ouverture.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [fiches, setFiches] = useState(()=>lsGet("cache_fiches")||[]);
  const [societes, setSocietes] = useState(["A6T Services"]);
  const [techniciens, setTechniciens] = useState([]);
  const [logos, setLogos] = useState({});
  const [clients, setClients] = useState([]);
  const [devisList, setDevisList] = useState([]);
  const [contrats, setContrats] = useState([]);
  const [taches, setTaches] = useState([]);
  const [editingDevis, setEditingDevis] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [positions, setPositions] = useState({}); // { nomTech: { lat, lng, updatedAt, statut } }
  const [view, setView] = useState("accueil");
  const [nav, setNav] = useState("agenda");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [toast, setToast] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showRdvForm, setShowRdvForm] = useState(false);
  const [rdvPrefill, setRdvPrefill] = useState(null);
  const [showMailImport, setShowMailImport] = useState(false);
  const [techTels, setTechTels] = useState({});
  const [techColors, setTechColors] = useState({});
  const [sousTraitants, setSousTraitants] = useState([]);
  const [techNom, setTechNom] = useState(()=>localStorage.getItem("techNom")||"");
  const [showProfil, setShowProfil] = useState(false);
  const [prestaLabelsVersion, setPrestaLabelsVersion] = useState(0);
  const [champsCustom, setChampsCustom] = useState({});
  const [online, setOnline] = useState(typeof navigator!=="undefined" ? navigator.onLine : true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(()=>{
    const on=()=>{setOnline(true);flushPending();}, off=()=>setOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    try { if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{}); } catch(e){}
    setTimeout(flushPending, 3000);
    return ()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);
  // Surveillance de la connexion (Firebase Auth)
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, (u)=>{ setCurrentUser(u); setAuthReady(true); });
    return ()=>unsub();
  },[]);

  const T = THEMES[theme] || THEMES.dark;
  const showToast = m => { setToast(m); setTimeout(()=>setToast(null),3200); };

  const exporterExcel = () => {
    try {
      const entete = ["Reference","Date RDV","Heure","Statut","Client","Adresse","Telephone","Email","Technicien","Societe","Prestations","Temps passe","Majorations","Facturation","Conclusion"];
      const echap = (v)=>{ const s=(v==null?"":String(v)).replace(/"/g,'""').replace(/\r?\n/g," "); return '"'+s+'"'; };
      const majLib = {soir50:"Soir +50%",weekend100:"Nuit/WE +100%"};
      const lignes = fiches.map(f=>{
        const prest = (f.prestations||[]).map(p=>{const m=PRESTATIONS.find(x=>x.id===p.id);return m?m.label:p.id;}).join(" / ");
        const maj = (f.majorations||[]).map(m=>majLib[m]||m).join(" + ");
        const stat = STATUTS[f.status]?.label || f.status || "";
        return [f.id,f.dateRdv||"",f.heureRdv||"",stat,f.client||"",f.adresse||"",f.tel||"",f.email||"",f.technicien||"",f.societe||"",prest,f.tempsInterne||"",maj,f.facturation||"",f.conclusion||""].map(echap).join(";");
      });
      const csv = "\uFEFF" + entete.map(echap).join(";") + "\r\n" + lignes.join("\r\n");
      const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dt = new Date().toISOString().slice(0,10);
      a.href=url; a.download=`Interventions_${dt}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      showToast("📊 Export Excel téléchargé ("+fiches.length+" fiches)");
    } catch(e){ alert("Erreur export : "+(e?.message||e)); }
  };

  useEffect(()=>{
    // Firebase — écoute en temps réel
    const unsub1 = watchFiches(data => { setFiches(data); setLoaded(true); lsSet("cache_fiches", data.map(stripLourd)); });
    const unsub2 = watchPositions(data => setPositions(data));
    const unsub3 = watchSocietes(data => setSocietes(data));
    const unsub4 = watchTechniciens(data => setTechniciens(data));
    const unsub5 = watchLogos(data => setLogos(data));
    const unsubT = watchTechTels(data => setTechTels(data));
    const unsubTC = watchTechColors(data => setTechColors(data));
    const unsubST = watchSousTraitants(data => setSousTraitants(data));
    const unsubPL = watchPrestationLabels(data => { applyPrestationLabels(data); setPrestaLabelsVersion(v=>v+1); });
    const unsubCh = watchChamps(data => setChampsCustom(data));
    const unsub6 = watchClients(data => setClients(data));
    const unsub7 = watchDevis(data => setDevisList(data));
    const unsub8 = watchContrats(data => setContrats(data));
    const unsub9 = watchTaches(data => setTaches(data));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8(); unsub9(); unsubT(); unsubTC(); unsubST(); unsubPL(); unsubCh(); };
  },[]);

  const ajouterSociete = (nom) => {
    const next = [...new Set([...societes, nom])];
    setSocietes(next); saveSocietes(next); // Firebase
  };
  const ajouterTechnicien = (nom) => {
    const next = [...new Set([...techniciens, nom])];
    setTechniciens(next); saveTechniciens(next); // Firebase
  };

  // ── Liste de tâches partagée (Firebase) ──
  const ajouterTache = (titre, priorite, photo) => {
    const t = { id: uid(), titre:(titre||"").trim(), priorite:priorite||"À faire", photo:photo||"", fait:false, createdAt: ts() };
    if(!t.titre) return;
    saveTacheFb(t); // Firebase (la liste se met à jour via watchTaches)
  };
  const toggleTache = (t) => { saveTacheFb({ ...t, fait: !t.fait }); };
  const supprimerTache = (id) => { deleteTacheFb(id); };

  const flushPending = () => {
    const q = lsGet("pending_saves")||[];
    if(!q.length || (typeof navigator!=="undefined" && !navigator.onLine)) return;
    q.forEach(fi=>{ try{ saveFiche(fi); }catch(e){} });
    lsSet("pending_saves", []);
    showToast(`📡 ${q.length} fiche(s) synchronisée(s)`);
  };
  const handleSave = fiche => {
    if(typeof navigator!=="undefined" && !navigator.onLine){
      lsSet("pending_saves", [...(lsGet("pending_saves")||[]).filter(x=>x.id!==fiche.id), fiche]);
      setFiches(p=>[...p.filter(x=>x.id!==fiche.id), fiche]);
      setSelected(fiche); setView("detail");
      showToast("📴 Hors ligne — fiche mise en attente, envoi automatique au retour du réseau");
      return;
    }
    saveFiche(fiche); // Firebase
    try {
      if (fiche.societe && !societes.includes(fiche.societe)) ajouterSociete(fiche.societe);
      if (fiche.technicien?.trim() && !techniciens.includes(fiche.technicien.trim())) ajouterTechnicien(fiche.technicien.trim());
      const prev = fiches.find(x=>x.id===fiche.id);
      if (fiche.technicien?.trim() && fiche.technicien.trim()!==prev?.technicien) {
        envoyerNotification(fiche.technicien.trim(), "🔧 Intervention assignée", `${fiche.client||"Client"} — ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}`, fiche.id);
      }
    } catch(e) { console.error(e); }
    setSelected(fiche); setView("detail"); showToast("✓ Fiche enregistrée");
  };

  const handleSaveRdv = rdv => {
    setRdvPrefill(null);
    if(typeof navigator!=="undefined" && !navigator.onLine){
      lsSet("pending_saves", [...(lsGet("pending_saves")||[]).filter(x=>x.id!==rdv.id), rdv]);
      setFiches(p=>[...p.filter(x=>x.id!==rdv.id), rdv]);
      setShowRdvForm(false);
      showToast("📴 Hors ligne — RDV mis en attente, envoi automatique au retour du réseau");
      return;
    }
    saveFiche(rdv); // Firebase
    if (rdv.technicien?.trim() && !techniciens.includes(rdv.technicien.trim())) ajouterTechnicien(rdv.technicien.trim());
    const prevRdv = fiches.find(x=>x.id===rdv.id);
    if (rdv.technicien?.trim() && rdv.technicien.trim()!==prevRdv?.technicien) {
      envoyerNotification(rdv.technicien.trim(), "📅 Nouveau RDV assigné", `${rdv.client||"Client"} — ${dateFr(rdv.dateRdv)}${rdv.heureRdv?" à "+rdv.heureRdv:""}`, rdv.id);
    }
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

  const handleDuplicate = (fiche) => {
    // Repartir d'une copie : nouvelle réf, statut planifié, sans signatures/photos/conclusion/temps
    const copie = {
      ...fiche, id:uid(), createdAt:ts(),
      status:"planifie", type:"rdv",
      dateRdv: today(), heureRdv:"",
      signature:null, signatureTech:null, nomSignataire:"",
      conclusion:"", photos:[], tempsInterne:"", majorations:[],
      facturation:"",
    };
    setEditing(copie); setView("form");
    showToast("📋 Intervention dupliquée — modifiez et enregistrez");
  };

  // Contrats : créer automatiquement les prochaines interventions (horizon 30 jours)
  useEffect(()=>{
    if(!loaded) return;
    const horizon = new Date(); horizon.setDate(horizon.getDate()+30);
    contrats.forEach(c=>{
      if(c.actif===false || !c.prochaine) return;
      let next = c.prochaine, guard = 0, advanced = false;
      while(new Date(next+"T12:00:00") <= horizon && guard < 13){
        guard++;
        const exists = fiches.some(f=>f.contratId===c.id && f.dateRdv===next);
        if(!exists){
          saveFiche({ id:uid(), type:"rdv", contratId:c.id, client:c.client||"", clientId:c.clientId||null, siteId:c.siteId||null,
            adresse:c.adresse||"", tel:c.tel||"", technicien:c.technicien||"", dateRdv:next, heureRdv:"",
            status:"planifie", prestations:[], typesRdv:[], preconisations:[], photos:[], materiels:[],
            conclusion:"", responsabilite:"na", urgent:false, loc:{...EMPTY_LOC},
            note:`🔁 Contrat ${c.type} — ${FREQUENCES[c.frequence]?.label||""}`, createdAt:ts() });
        }
        next = addFreq(next, c.frequence); advanced = true;
      }
      if(advanced && next !== c.prochaine) saveContrat({...c, prochaine: next});
    });
  },[loaded, contrats, fiches]);

  const handleSaveClient = (c) => saveClient(c);
  const handleCreateDevis = (fiche) => {
    const lignes = (fiche.preconisations||[]).map(p=>({label:p.replace(/ recommandé| à prévoir| à planifier| à établir| requise|Prévoir /gi,"").trim().replace(/^./,m=>m.toUpperCase()), qte:1, pu:""}));
    setEditingDevis({ id:nextDevisNum(devisList), ficheId:fiche.id, client:fiche.client||"", site:"", adresse:fiche.adresse||"",
      date:today(), tva:10, statut:"brouillon", lignes: lignes.length?lignes:[{label:"",qte:1,pu:""}],
      photos:[], notes:"", societe:fiche.societe||"", logoSociete:fiche.logoSociete||null, _photosDispo:fiche.photos||[] });
    setView("devisform");
  };
  const handleSaveDevis = (d) => { saveDevisFb(d); setEditingDevis(null); setView("accueil"); setNav("devis"); showToast("📄 Devis enregistré"); };
  const handleToggleFacturation = (fiche, val) => { const nf={...fiche, facturation: val}; saveFiche(nf); setSelected(nf); };

  const filtered = useMemo(()=>{
    let r=fiches;
    if(search) r=r.filter(f=>`${f.client} ${f.adresse} ${f.id} ${f.technicien}`.toLowerCase().includes(search.toLowerCase()));
    if(filterStatus==="__aprogrammer") r=r.filter(estAProgrammer);
    else if(filterStatus==="__signees") r=r.filter(f=>f.signature);
    else if(filterStatus==="__afacturer") r=r.filter(f=>f.facturation==="a_facturer");
    else if(filterStatus==="__facture") r=r.filter(f=>f.facturation==="facture");
    else if(filterStatus==="planifie") r=r.filter(f=>f.status==="planifie"&&!estAProgrammer(f));
    else if(filterStatus) r=r.filter(f=>f.status===filterStatus);
    return r;
  },[fiches,search,filterStatus]);

  // Notifications reçues pendant que l'app est ouverte au premier plan
  // (le service worker ne gère que les notifications reçues quand l'app est en arrière-plan/fermée)
  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const supported = await fcmIsSupported();
        if (!supported) return;
        const messaging = getMessaging(app);
        unsub = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || payload.data?.title || "InterventionPro";
          const body = payload.notification?.body || payload.data?.body || "";
          showToast(`🔔 ${title} — ${body}`);
          // Sans ça, une notification reçue app ouverte reste silencieuse (juste le bandeau ci-dessus).
          // new Notification(...) déclenche le vrai son/vibration du téléphone, comme les autres apps.
          if ("Notification" in window && Notification.permission === "granted") {
            try { new Notification(title, { body, icon: "/icon-192.png" }); } catch(e) {}
          }
        });
      } catch (e) { console.error("onMessage error", e); }
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  // Géolocalisation — envoie la position toutes les 2 min via Firebase
  useEffect(() => {
    if (!navigator.geolocation) return;
    const nomPourGeoloc = techNom || "Technicien";
    const sendPos = () => {
      navigator.geolocation.getCurrentPosition(pos => {
        updatePosition(nomPourGeoloc, pos.coords.latitude, pos.coords.longitude);
      }, null, { enableHighAccuracy: true });
    };
    sendPos();
    const interval = setInterval(sendPos, 120000);
    return () => clearInterval(interval);
  }, [techNom]);
  const NAV=[{id:"dashboard",label:"📊 Tableau de bord"},{id:"agenda",label:"📅 Agenda"},{id:"devis",label:"📄 Devis"}];
  const NAV_MENU=[{id:"liste",label:"🗂️ Liste des interventions"},{id:"clients",label:"👥 Clients & Sites"},{id:"contrats",label:"🔁 Contrats d'entretien"},{id:"carte",label:"🗺️ Carte techniciens"},{id:"admin",label:"🛠️ Administration"},{id:"champs",label:"⚙️ Personnaliser les cases"}];

  const offlineBanner = !online && (
    <div style={{background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"#fff",textAlign:"center",fontWeight:800,fontSize:12.5,padding:"8px 12px"}}>
      📴 Mode hors ligne — consultation possible, vos enregistrements seront synchronisés au retour du réseau
    </div>
  );

  const mailImportModal = showMailImport && (
    <MailImport theme={theme} onCancel={()=>setShowMailImport(false)}
      onExtracted={data=>{ setShowMailImport(false); setRdvPrefill({ technicien:"", status:"planifie", type:"rdv", ...data }); setShowRdvForm(true); }}/>
  );

  // ── Sécurité : connexion obligatoire ──
  if(!authReady) return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px"}}>🔧</div>
        <div style={{fontSize:14,color:T.textMuted}}>Chargement…</div>
      </div>
    </div>
  );
  if(!currentUser) return <LoginPage theme={theme} />;

  // Formulaire RDV plein écran
  if(showRdvForm) return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      {offlineBanner}
      <header style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 20px",height:58,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:300}}>
        <button onClick={()=>setShowRdvForm(false)} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <div style={{fontWeight:800,fontSize:16,color:T.text}}>📅 Nouveau RDV</div>
      </header>
      <div style={{maxWidth:800,margin:"0 auto",padding:"20px 16px"}}>
        <RdvForm initial={rdvPrefill} fiches={fiches} onSave={handleSaveRdv} onBack={()=>{setShowRdvForm(false);setRdvPrefill(null);}} theme={theme} techniciens={techniciens} onAddTechnicien={ajouterTechnicien}/>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      {offlineBanner}
      {mailImportModal}
      {showProfil&&<ProfilModal techniciens={techniciens} techNom={techNom} onSaveTechNom={n=>{setTechNom(n);localStorage.setItem("techNom",n);}} theme={theme} onClose={()=>setShowProfil(false)}/>}

      {/* HEADER */}
      <header style={{background:T.surface,backdropFilter:"blur(12px)",borderBottom:`1px solid ${T.border}`,padding:"0 16px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:300,boxShadow:theme!=="dark"?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
        {/* Logo — icône seulement */}
        <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:"0 4px 14px rgba(14,165,233,0.3)",flexShrink:0}}>🔧</div>

        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>setShowProfil(true)} title="Cet appareil / Notifications" style={{position:"relative",padding:"7px 10px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            🔔
            {!techNom&&<span style={{position:"absolute",top:-3,right:-3,width:9,height:9,borderRadius:"50%",background:"#EF4444",border:`1.5px solid ${T.surface}`}}/>}
          </button>
          <button onClick={()=>setShowRdvForm(true)} style={{padding:"7px 10px",background:"none",border:`1px solid #3B82F6`,borderRadius:8,color:"#3B82F6",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📅</button>
          <button onClick={()=>{setEditing(null);setView("form");}} style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(14,165,233,0.25)"}}>
            + Nouvelle
          </button>
        </div>
      </header>

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",top:66,right:20,zIndex:500,background:"#10B981",color:"#fff",padding:"11px 18px",borderRadius:10,fontWeight:700,fontSize:13,boxShadow:"0 8px 32px rgba(16,185,129,0.4)",animation:"slideIn .3s ease"}}>{toast}</div>}

      <div style={{maxWidth:1240,margin:"0 auto",padding:"20px 16px"}}>

        {view==="devisform"&&editingDevis&&(
          <DevisForm initial={editingDevis} theme={theme} clients={clients} champsCustom={champsCustom} onSave={handleSaveDevis} onBack={()=>{setEditingDevis(null);setView("accueil");setNav("devis");}}/>
        )}

        {view==="form"&&(
          <FicheForm champsCustom={champsCustom} initial={editing} onSave={handleSave} onBack={()=>setView(selected&&editing?"detail":"accueil")} fiches={fiches} theme={theme} societes={societes} onAddSociete={ajouterSociete} techniciens={techniciens} onAddTechnicien={ajouterTechnicien} logos={logos} onSaveLogo={(nom,d)=>saveLogo(nom,d)} onRemoveLogo={nom=>removeLogo(nom)} clients={clients}/>
        )}

        {view==="rdv"&&editing&&(
          <div style={{maxWidth:800,margin:"0 auto"}}>
            <RdvForm initial={editing} fiches={fiches} onSave={handleSaveRdv} onBack={()=>setView("detail")} theme={theme} techniciens={techniciens} onAddTechnicien={ajouterTechnicien}/>
          </div>
        )}

        {view==="detail"&&selected&&(
          <DetailFiche fiche={selected} theme={theme} techTels={techTels} onSaveTechTel={saveTechTel}
            sousTraitants={sousTraitants} onSaveSousTraitants={arr=>{setSousTraitants(arr);saveSousTraitants(arr);}}
            onBack={()=>setView("accueil")}
            onEdit={()=>{setEditing(selected);setView(selected.type==="rdv"?"rdv":"form");}}
            onDelete={()=>{if(confirm("Supprimer définitivement cette fiche ?"))handleDelete(selected.id);}}
            onDemarrer={()=>demarrerIntervention(selected)} onCreateDevis={handleCreateDevis} onToggleFacturation={handleToggleFacturation} onDuplicate={()=>handleDuplicate(selected)}/>
        )}

        {view==="accueil"&&(
          <>
            {/* Navigation */}
            <div style={{display:"flex",gap:3,marginBottom:20,background:T.surface,borderRadius:10,padding:4,border:`1px solid ${T.border}`}}>
              {NAV.map(n=>(
                <button key={n.id} onClick={()=>{setNav(n.id);setMenuOpen(false);}} style={{flex:1,padding:"9px 6px",border:"none",borderRadius:7,fontWeight:700,fontSize:12.5,cursor:"pointer",transition:"all .2s",fontFamily:"inherit",
                  background:nav===n.id?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",
                  color:nav===n.id?"#fff":T.textMuted}}>{n.label}</button>
              ))}
              {/* Bouton menu ☰ */}
              <div style={{position:"relative",flex:1}}>
                <button onClick={()=>setMenuOpen(!menuOpen)} style={{width:"100%",padding:"9px 6px",border:"none",borderRadius:7,fontWeight:700,fontSize:12.5,cursor:"pointer",fontFamily:"inherit",
                  background:NAV_MENU.some(n=>n.id===nav)?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",
                  color:NAV_MENU.some(n=>n.id===nav)?"#fff":T.textMuted}}>
                  ☰ {NAV_MENU.find(n=>n.id===nav)?.label.split(" ")[0]||"Menu"} {menuOpen?"▲":"▼"}
                </button>
                {menuOpen&&(
                  <>
                    <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:390}}/>
                    <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:400,background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:12,padding:8,minWidth:230,boxShadow:"0 16px 48px rgba(0,0,0,0.35)"}}>
                      {NAV_MENU.map(n=>(
                        <button key={n.id} onClick={()=>{setNav(n.id);setMenuOpen(false);}}
                          style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",
                            background:nav===n.id?"rgba(14,165,233,0.14)":"transparent",
                            color:nav===n.id?"#0EA5E9":T.text}}>
                          {n.label}
                        </button>
                      ))}
                      <button onClick={()=>{exporterExcel();setMenuOpen(false);}}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",background:"transparent",color:"#10B981"}}>
                        📊 Exporter en Excel
                      </button>
                      <div style={{borderTop:`1px solid ${T.border}`,margin:"8px 4px",paddingTop:10}}>
                        <div style={{fontSize:9.5,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7,paddingLeft:8}}>🎨 Couleur de l'écran</div>
                        <div style={{display:"flex",gap:6,paddingLeft:8,paddingBottom:4}}>
                          {Object.values(THEMES).map(t=>(
                            <button key={t.id} onClick={()=>setTheme(t.id)} title={t.label}
                              style={{flex:1,padding:"8px 4px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,
                                border:`1.5px solid ${theme===t.id?"#0EA5E9":T.border}`,
                                background:theme===t.id?"rgba(14,165,233,0.14)":"transparent",
                                color:theme===t.id?"#0EA5E9":T.textMuted}}>
                              {t.id==="dark"?"🌙":t.id==="light"?"☀️":"🌫️"} {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{borderTop:`1px solid ${T.border}`,margin:"8px 4px",paddingTop:10}}>
                        <div style={{fontSize:11,color:T.textMuted,paddingLeft:8,marginBottom:7,wordBreak:"break-all"}}>👤 {currentUser?.email}</div>
                        <button onClick={()=>{ if(confirm("Se déconnecter ?")){ signOut(auth); setMenuOpen(false); } }}
                          style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",background:"rgba(239,68,68,0.1)",color:"#EF4444"}}>
                          🚪 Se déconnecter
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Barre recherche */}
            {nav!=="dashboard"&&(
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{flex:1,minWidth:160,padding:"10px 14px",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                  style={{padding:"10px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"}}>
                  <option value="">Tous statuts</option>
                  <option value="__aprogrammer">📌 À planifier</option>
                  {Object.entries(STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  <option value="__signees">✍️ Signées</option>
                  <option value="__afacturer">💶 À facturer</option>
                  <option value="__facture">✅ Facturé</option>
                </select>
                <span style={{fontSize:12,color:T.textMuted}}>{filtered.length}/{fiches.length}</span>
              </div>
            )}

            {/* Bandeau filtre actif */}
            {nav==="liste"&&filterStatus&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 14px",background:"rgba(14,165,233,0.1)",border:"1px solid rgba(14,165,233,0.35)",borderRadius:8}}>
                <span style={{fontSize:12,fontWeight:700,color:"#0EA5E9"}}>
                  Filtre : {filterStatus==="__signees" ? "✍️ Signées" : filterStatus==="__afacturer" ? "💶 À facturer" : filterStatus==="__facture" ? "✅ Facturé" : STATUTS[filterStatus]?.label} — {filtered.length} fiche(s)
                </span>
                <button onClick={()=>setFilterStatus("")} style={{marginLeft:"auto",background:"none",border:"1px solid rgba(14,165,233,0.4)",borderRadius:6,color:"#0EA5E9",fontSize:11,fontWeight:700,cursor:"pointer",padding:"3px 10px",fontFamily:"inherit"}}>✕ Tout afficher</button>
              </div>
            )}

            {nav==="dashboard"&&<TableauDeBord fiches={fiches} theme={theme} onNew={()=>{setEditing(null);setView("form");}} onNewRdv={()=>setShowRdvForm(true)} onDemarrer={demarrerIntervention} onSelect={f=>{setSelected(f);setView("detail");}} onFilterStatus={s=>{setFilterStatus(s);setNav("liste");}} taches={taches} onAjouterTache={ajouterTache} onToggleTache={toggleTache} onSupprimerTache={supprimerTache}/>}
            {nav==="champs"&&<ChampsEditor champs={champsCustom} onSave={saveChamps} onSavePrestationLabel={savePrestationLabel} theme={theme}/>}
            {nav==="admin"&&<AdminView societes={societes} techniciens={techniciens} techTels={techTels} techColors={techColors} logos={logos} champs={champsCustom}
              sousTraitants={sousTraitants} onSaveSousTraitants={arr=>{setSousTraitants(arr);saveSousTraitants(arr);}}
              onSaveSocietes={arr=>{setSocietes(arr);saveSocietes(arr);}}
              onSaveTechniciens={arr=>{setTechniciens(arr);saveTechniciens(arr);}}
              onSaveTechTel={saveTechTel} onSaveTechColor={saveTechColor} onSaveLogo={saveLogo} onRemoveLogo={removeLogo}
              onSaveChamps={saveChamps} onGoChamps={()=>setNav("champs")} theme={theme}/>}
            {nav==="agenda"&&(
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                <button onClick={()=>setShowMailImport(true)} style={{background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 18px rgba(124,58,237,0.3)"}}>🪄 RDV depuis un mail</button>
              </div>
            )}
            {nav==="agenda"&&search.trim()&&(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",borderRadius:10,padding:"7px 15px",fontWeight:800,fontSize:13}}>🔍 Résultats — toutes dates</div>
                  <div style={{flex:1,height:1,background:T.border}}/>
                  <span style={{fontSize:12,color:T.textMuted}}>{filtered.length} fiche(s)</span>
                </div>
                {filtered.length===0
                  ? <div style={{textAlign:"center",padding:"24px",color:T.textMuted,fontSize:13,background:T.surface,border:`1px dashed ${T.border}`,borderRadius:12}}>Aucune intervention ne correspond à « {search} »</div>
                  : [...filtered].sort((a,b)=>(b.dateRdv||"").localeCompare(a.dateRdv||"")).map(f=>(
                      <AgendaCarte key={f.id} fiche={f} etat={(f.type==="rdv"||(f.status==="planifie"&&!f.prestations?.length))?"rdv":"complete"} onSelect={x=>{setSelected(x);setView("detail");}} onDemarrer={demarrerIntervention} T={T} techniciens={techniciens} techColors={techColors}/>
                    ))}
              </div>
            )}
            {nav==="agenda"&&!search.trim()&&<Agenda fiches={filtered} theme={theme} techniciens={techniciens} techColors={techColors} onSelect={f=>{setSelected(f);setView("detail");}} onDemarrer={demarrerIntervention} onProgrammer={(fiche,date)=>{const nf={...fiche,dateRdv:date};saveFiche(nf);showToast("📅 Programmé le "+dateFr(date));}} onNewRdv={d=>{setRdvPrefill({technicien:"",status:"planifie",type:"rdv",dateRdv:d});setShowRdvForm(true);}}/>}
            {nav==="clients"&&<ClientsView clients={clients} fiches={fiches} onSaveClient={handleSaveClient} onDeleteClient={deleteClient} onSelectFiche={f=>{setSelected(f);setView("detail");}} theme={theme}/>}
            {nav==="contrats"&&<ContratsView contrats={contrats} clients={clients} techniciens={techniciens} onSaveContrat={saveContrat} onDeleteContrat={deleteContrat} theme={theme}/>}
            {nav==="devis"&&<DevisList devisList={devisList} theme={theme} onCreate={()=>{setEditingDevis({id:nextDevisNum(devisList),date:today(),client:"",site:"",adresse:"",tva:10,statut:"brouillon",lignes:[{label:"",qte:1,pu:""}],photos:[],notes:"",createdAt:ts(),_photosDispo:[]});setView("devisform");}} onOpen={dv=>{setEditingDevis(dv);setView("devisform");}} onChangeStatut={(dv,s)=>saveDevisFb({...dv,statut:s})} onDelete={dv=>{if(window.confirm("Supprimer le devis "+dv.id+" ?"))deleteDevisFb(dv.id);}}/>}
            {nav==="liste"&&<ListeCartes fiches={filtered} theme={theme} onSelect={f=>{setSelected(f);setView("detail");}} onDelete={f=>{if(window.confirm("Supprimer definitivement l\u2019intervention "+f.id+" ("+(f.client||"sans client")+") ?")){deleteFiche(f.id);showToast("\ud83d\uddd1\ufe0f Supprime");}}}/>}
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
}
