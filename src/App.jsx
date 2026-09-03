import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove, push, query, orderByChild, limitToLast, get } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getMessaging, getToken, onMessage, isSupported as fcmIsSupported } from "firebase/messaging";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
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
const storage = getStorage(app);
// ── Stockage des photos hors de la base de données ──
// Chaque photo est envoyée à part dans Firebase Storage, et seul un lien léger est gardé
// dans la fiche — l'affichage ne change rien (<img src=...> fonctionne pareil avec un lien
// qu'avec une image encodée), mais ça évite d'alourdir la base à chaque photo ajoutée.
async function uploadPhotoToStorage(dataUrl, pathPrefix) {
  const path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  const r = storageRef(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return await getDownloadURL(r);
}
// Persistance locale explicite : évite que Safari/iOS ne redemande une connexion
// à chaque ouverture de la PWA (comportement par défaut moins fiable sur Safari).
setPersistence(auth, browserLocalPersistence).catch(e => console.error("setPersistence error", e));
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
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    // Important : attendre que le service worker soit VRAIMENT actif avant de demander le
    // jeton — sinon, sur iPhone en particulier, getToken() peut réussir avec un jeton qui ne
    // fonctionne pas vraiment, donnant ce comportement "une fois ça marche, une fois pas".
    const reg = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return { ok:false, reason:"no-token" };
    await saveNotifToken(nom, token);
    try { localStorage.setItem("fcmToken", token); } catch(e) {}
    return { ok:true, token };
  } catch (e) {
    console.error("initNotifications error", e);
    return { ok:false, reason:"error", error:String(e) };
  }
}
async function envoyerNotification(technicien, titre, corps, ficheId) {
  try {
    const r = await fetch("/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ technicien, titre, corps, ficheId }),
    });
    const d = await r.json().catch(()=>({}));
    const resume = d.ok
      ? (d.sent===false ? `Non envoyé (${d.reason||"?"})` : `Envoyé — ${d.envoyes ?? "?"} appareil(s), ${d.echecs ?? 0} échec(s)`)
      : `ERREUR SERVEUR : ${d.error||"inconnue"}`;
    logActivite("notification_envoyee", technicien, `${titre} — ${resume}`);
  } catch (e) {
    console.error("envoyerNotification error", e);
    logActivite("notification_envoyee", technicien, `${titre} — ERREUR RÉSEAU : ${e.message}`);
  }
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
const watchMemosVocaux = (cb) => onValue(ref(db, "memosVocaux"), snap => { const d=snap.val(); cb(d?Object.values(d).sort((a,b)=>(b.ts||0)-(a.ts||0)):[]); });
const saveMemoVocal = (memo) => set(ref(db, `memosVocaux/${memo.id}`), memo);
// ── File d'attente hors-ligne pour les mémos vocaux ──
// Si un technicien enregistre un mémo sans réseau (cave, sous-sol...), l'audio est gardé
// localement sur l'appareil (IndexedDB — contrairement à localStorage, peut stocker de
// l'audio) plutôt que d'être perdu. Dès que la connexion revient, chaque mémo en attente
// est transcrit automatiquement et apparaît dans l'historique "Mémos vocaux" avec le badge
// "⏳ En attente d'analyse" — comme un mémo dicté normalement, prêt à être repris.
const IDB_NAME = "interventionpro_offline";
const IDB_STORE = "memosEnAttente";
function idbOuvrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbAjouterMemo(blob, mimeType, mode) {
  const db = await idbOuvrir();
  const id = "memo_" + Date.now() + "_" + Math.random().toString(36).slice(2,8);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ id, blob, mimeType, mode, ts: Date.now() });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbListerMemos() {
  const db = await idbOuvrir();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function idbSupprimerMemo(id) {
  const db = await idbOuvrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
const emailKey = (email) => (email||"").toLowerCase().replace(/[.#$/\[\]]/g,"_");
// ── Journal d'activité (connexions, actions clés) ──
// Trace qui a fait quoi et quand : connexions à l'app, ajout de photo... Visible dans
// Administration → Journal d'activité. Sert aussi de "vu" implicite pour les alertes :
// si la dernière connexion d'un technicien est APRÈS l'heure d'une alerte, on sait qu'il
// a au moins ouvert l'app depuis (sans garantir qu'il ait lu la notification elle-même).
const logActivite = (type, technicien, detail) => {
  try { push(ref(db, "activiteLog"), sanitize({ type, technicien: technicien||null, detail: detail||"", ts: Date.now() })); }
  catch(e) { console.error("logActivite error", e); }
};
const watchActiviteLog = (cb) => onValue(query(ref(db, "activiteLog"), orderByChild("ts"), limitToLast(300)), snap => { const d=snap.val(); cb(d?Object.values(d).sort((a,b)=>b.ts-a.ts):[]); });
const watchUserRoles = (cb, onErr) => onValue(ref(db, "userRoles"), snap => { const d=snap.val(); cb(d?Object.values(d):[]); }, err => { if(onErr) onErr(err); });
const saveUserRole = (role) => set(ref(db, `userRoles/${emailKey(role.email)}`), role);
const deleteUserRole = (email) => remove(ref(db, `userRoles/${emailKey(email)}`));
// ── Lecture rapide des droits d'accès, en contournant la connexion Firebase principale ──
// Après connexion, l'app doit confirmer "admin ou technicien restreint ?" avant d'afficher
// quoi que ce soit. Ce petit bout d'info passait par le même canal que le téléchargement de
// TOUTES les fiches (avec leurs photos) — donc il attendait derrière ce gros transfert et
// mettait du temps à arriver. Cet appel REST classique (une simple requête web) est
// totalement indépendant de ce canal, et arrive donc immédiatement, sans jamais attendre
// le reste des données.
async function fetchUserRolesFast(user) {
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${firebaseConfig.databaseURL}/userRoles.json?auth=${token}`);
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch(e2) {}
      throw new Error(`HTTP ${res.status}${detail?" — "+detail.slice(0,200):""}`);
    }
    const data = await res.json();
    return { data: data ? Object.values(data) : [], error: null };
  } catch (e) {
    console.error("fetchUserRolesFast error", e);
    return { data: null, error: String(e?.message || e) }; // échec : on laisse l'écoute temps réel (plus lente) prendre le relais
  }
}
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
const watchAbsences = (cb) => onValue(ref(db, "absences"), snap => cb(Object.values(snap.val()||{})));
const saveAbsenceFb = (a) => set(ref(db, `absences/${a.id}`), sanitize(a));
const deleteAbsenceFb = (id) => remove(ref(db, `absences/${id}`));
/* Un technicien est absent le jour d si une période le couvre (bornes incluses). */
const estAbsent = (technicien, jour, absences=[]) =>
  !!technicien && !!jour && absences.some(a => a.technicien===technicien && jour>=a.du && jour<=a.au);
const absenceDe = (technicien, jour, absences=[]) =>
  absences.find(a => a.technicien===technicien && jour>=a.du && jour<=a.au) || null;
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
    id: "degorgement", label: "Débouchage", icon: "🔧", color: "#F97316", groupe: "Assainissement",
    localisations: ["Cuisine","Salle de bain","WC","Sous-sol","Cour","Colonne commune","Gaine technique","Branchement principal","Regard","Siphon de sol","Vide-ordures","Horizontal","Vertical"],
    problemes: ["Bouchon total","Mauvais écoulement","Odeurs","Remontée d'eaux usées","Débordement"],
    causes: ["Corps étranger","Lingettes","Papier épais","Accumulation de graisses","Dépôts calcaires / tartre","Racines / végétation","Effondrement / casse de canalisation","Joint défaillant","Mauvaise pente","Chute de débris (travaux)","Remontée de nappes","Cause indéterminée"],
    actions: ["Par débouchage manuel","Par furet électrique","Par camion hydrocureur","Pompage","Ouverture tampon existant","Remplacement tampon hermétique","Création ouverture sur colonne","Fourniture et pose tampon hermétique neuf","Fermeture colonne","Extraction de corps étranger","Débouchage de vide-ordures","Ramassage des ordures"],
    resultats: ["Écoulement rétabli","Écoulement amélioré","Problème persistant","Colonne refermée — tampon existant reposé","Colonne refermée — tampon neuf posé"],
  },
  {
    id: "inspection", label: "Inspection télévisée", icon: "📷", color: "#06B6D4", groupe: "Assainissement",
    localisations: ["Réseau EU","Réseau EP","Branchement","Collecteur","Colonne","Canalisation enterrée"],
    problemes: ["Diagnostic avant travaux","Recherche obstruction","Contrôle après travaux","Recherche effondrement"],
    constatCamera: ["Cassure de canalisation","Déboîtement","Affaissement","Contre-pente","Corps étranger visible","Infiltration","Racines","Obturation partielle","Obturation totale"],
    actions: ["Passage caméra","Repérage défaut","Localisation obstruction","Enregistrement vidéo","Extraction de corps étranger"],
    resultats: ["Réseau en bon état","Défaut localisé","Effondrement détecté","Rapport vidéo fourni"],
  },
  {
    id: "hydrocurage", label: "Hydrocurage", icon: "💧", color: "#0EA5E9", groupe: "Assainissement",
    localisations: ["Réseau EU","Réseau EP","Regard de visite","Collecteur","Branchement","Colonne"],
    problemes: ["Encrassement","Racines","Dépôts calcaires","Graisses accumulées"],
    actions: ["Hydrocurage HP","Curage mécanique","Extraction corps étranger","Traitement dégraissant"],
    resultats: ["Réseau curé","Débouchage réalisé","Racines extraites","Réseau opérationnel"],
  },
  {
    id: "fosse", label: "Vidange fosse septique", icon: "⚗️", color: "#A78BFA", groupe: "Assainissement",
    localisations: ["Fosse toutes eaux","Bac dégraisseur","Regard","Épandage","Préfiltre","Micro-station"],
    problemes: ["Fosse pleine","Débordement","Odeurs","Entretien annuel"],
    actions: ["Vidange complète","Vidange partielle","Pompage","Nettoyage bac","Contrôle épandage"],
    resultats: ["Fosse vidangée","Bon fonctionnement","Anomalie détectée","Contrôle conforme"],
  },
  {
    id: "plomberie", label: "Plomberie — autre", icon: "🪛", color: "#10B981", groupe: "Plomberie",
    localisations: ["Cuisine","Salle de bain","WC","Buanderie","Cave","Gaine technique","Compteur"],
    problemes: ["Fuite","Canalisation cassée","Joint usé","Robinetterie défaillante","Pression insuffisante"],
    actions: ["Remplacement joint","Remplacement robinet","Réparation fuite","Soudure","Déblocage"],
    resultats: ["Réparation effectuée","Fuite stoppée","Pression rétablie","Remplacement à prévoir"],
  },
  {
    id: "robinetterie", label: "Robinetterie", icon: "🚰", color: "#22C55E", groupe: "Plomberie",
    localisations: ["Lavabo","Évier cuisine","Baignoire","Douche","WC","Bidet","Extérieur/jardin"],
    problemes: ["Fuite au niveau du robinet","Robinet bloqué / dur à manœuvrer","Joint usé","Mitigeur défectueux","Chasse d'eau qui fuit","Siphon percé ou bouché","Flexible endommagé","Débit insuffisant"],
    causes: ["Usure normale","Calcaire / entartrage","Joint détérioré","Mauvaise installation d'origine","Choc / casse accidentelle","Fin de vie du mécanisme"],
    actions: ["Remplacement robinet lavabo","Remplacement robinet évier","Remplacement robinet baignoire/douche","Remplacement mitigeur","Remplacement joint","Remplacement flexible","Remplacement mécanisme chasse d'eau","Remplacement siphon","Détartrage"],
    resultats: ["Robinet fonctionnel","Fuite stoppée","Mécanisme remplacé","Débit rétabli","Remplacement complet à prévoir"],
  },
  {
    id: "chauffe_eau", label: "Ballon d'eau chaude", icon: "🔥", color: "#F97316", groupe: "Plomberie",
    localisations: ["Cuisine","Salle de bain","Cave","Buanderie","Garage","Gaine technique","Extérieur"],
    problemes: ["Absence d'eau chaude","Fuite sur le ballon","Groupe de sécurité qui fuit en continu","Bruit anormal","Corrosion visible","Ballon percé","Résistance / thermoplongeur HS","Eau tiède seulement"],
    causes: ["Fin de vie du ballon (corrosion)","Entartrage important","Groupe de sécurité défectueux","Pression réseau trop élevée","Résistance grillée","Thermostat défaillant","Anode usée"],
    actions: ["Remplacement ballon d'eau chaude","Remplacement groupe de sécurité","Remplacement réducteur de pression","Remplacement résistance / thermoplongeur","Détartrage du ballon","Purge / vidange","Réglage thermostat","Remplacement anode"],
    resultats: ["Ballon remplacé et fonctionnel","Eau chaude rétablie","Groupe de sécurité remplacé","Fuite stoppée","Remplacement complet à prévoir"],
  },
  {
    id: "alimentation_eau", label: "Alimentation générale", icon: "🚿", color: "#0891B2", groupe: "Plomberie",
    localisations: ["Compteur","Gaine technique","Cave","Colonne montante","Descente d'évacuation","Extérieur/voirie","Local technique","Vanne d'arrêt général immeuble","Vanne d'arrêt par étage/logement"],
    problemes: ["Absence totale d'eau","Pression insuffisante générale","Fuite sur colonne montante","Vanne d'arrêt bloquée ou HS","Vanne d'arrêt introuvable / non identifiée","Compteur défectueux","Coupure d'eau générale de l'immeuble nécessaire"],
    causes: ["Vétusté de la canalisation","Corrosion de la colonne montante","Vanne grippée","Gel","Travaux de voirie / intervention tiers","Intervention d'un autre corps de métier"],
    actions: ["Recherche et localisation de la vanne d'arrêt","Remplacement vanne d'arrêt général","Remplacement vanne d'arrêt par étage/logement","Remplacement tronçon de colonne montante","Remplacement réducteur de pression général","Coupure d'eau générale de l'immeuble","Remise en eau de l'immeuble","Purge du réseau après remise en eau","Vérification / contrôle du réseau","Coordination avec le fournisseur d'eau"],
    resultats: ["Vanne d'arrêt localisée et identifiée","Alimentation rétablie","Remise en eau effectuée","Pression normalisée","Remplacement réalisé","Vérification effectuée, réseau conforme","Intervention du fournisseur d'eau nécessaire"],
  },
  {
    id: "sanitaires", label: "Sanitaires (pose & remplacement)", icon: "🚽", color: "#8B5CF6", groupe: "Plomberie",
    localisations: ["Salle de bain","WC","Douche","Cuisine"],
    problemes: ["WC fissuré ou cassé","Baignoire endommagée","Receveur de douche fissuré","Vasque / lavabo cassé","Installation vétuste ou non conforme","Fixation descellée"],
    causes: ["Vétusté","Choc / casse accidentelle","Mauvaise fixation d'origine","Non-conformité de l'installation"],
    actions: ["Remplacement WC complet","Remplacement baignoire","Remplacement receveur de douche","Pose douche à l'italienne","Remplacement vasque / lavabo","Reprise d'étanchéité","Renforcement de fixation"],
    resultats: ["Équipement remplacé et fonctionnel","Étanchéité assurée","Installation conforme","Pose terminée"],
  },
  {
    id: "chauffage", label: "Chauffage", icon: "🌡️", color: "#DC2626", groupe: "Plomberie",
    localisations: ["Salon","Chambre","Salle de bain","Chaufferie / local technique","Cave","Circuit général"],
    problemes: ["Radiateur froid / ne chauffe pas","Fuite sur radiateur","Chaudière en panne","Bruit anormal (coups de bélier, sifflement)","Pression du circuit trop basse ou trop haute","Purge nécessaire"],
    causes: ["Air dans le circuit","Vanne bloquée","Embouage du circuit","Fuite sur raccord","Panne chaudière","Vétusté de l'équipement"],
    actions: ["Purge radiateur","Remplacement radiateur","Remplacement vanne thermostatique","Désembouage du circuit","Remise en pression","Remplacement pièce chaudière","Réglage / mise en service"],
    resultats: ["Chauffage rétabli","Fuite stoppée","Circuit purgé et fonctionnel","Pression normalisée","Intervention chaudiériste à prévoir"],
  },
  {
    id: "traitement_eau", label: "Traitement de l'eau", icon: "🧪", color: "#0D9488", groupe: "Plomberie",
    localisations: ["Compteur","Cuisine","Gaine technique","Cave","Local technique"],
    problemes: ["Eau calcaire / entartrage important","Goût ou odeur anormale","Pression irrégulière","Coups de bélier","Retour d'eau constaté"],
    causes: ["Absence de traitement","Filtre / cartouche usagé","Adoucisseur en panne ou mal réglé","Absence de clapet anti-retour","Absence d'anti-bélier"],
    actions: ["Installation adoucisseur","Entretien / régénération adoucisseur","Installation filtre anticalcaire","Remplacement cartouche filtrante","Installation clapet anti-retour","Installation anti-bélier","Installation suppresseur"],
    resultats: ["Qualité d'eau améliorée","Équipement installé et fonctionnel","Entretien réalisé","Pression stabilisée"],
  },
  {
    id: "tuyauterie", label: "Tuyauterie / Réseau intérieur", icon: "🔧", color: "#7C3AED", groupe: "Plomberie",
    localisations: ["Cuisine","Salle de bain","Cave","Gaine technique","Sous plafond","Sous plancher","Extérieur"],
    problemes: ["Canalisation percée","Corrosion visible (acier galvanisé / plomb)","Raccord qui fuit","Tuyauterie vétuste à remplacer","Passage de réseau à créer"],
    causes: ["Corrosion","Gel","Vétusté du matériau (plomb, acier galvanisé)","Choc accidentel","Mauvais raccordement"],
    actions: ["Remplacement tronçon de canalisation","Reprise de raccord","Soudure","Passage de nouveau réseau (cuivre / PER / multicouche)","Test d'étanchéité","Calorifugeage"],
    resultats: ["Réseau remplacé et étanche","Fuite stoppée","Test de pression concluant","Reprise complète à prévoir"],
  },
  {
    id: "recherche_fuite", label: "Recherche de fuite", icon: "💧", color: "#0EA5E9", groupe: "Plomberie",
    localisations: ["Cuisine","Salle de bain","WC","Sous dallage","Sous carrelage","Dans cloison/mur","Plafond","Terrasse/toiture","Compteur","Canalisation encastrée","Vide sanitaire","Gaine technique","Extérieur/jardin"],
    problemes: ["Tache d'humidité","Compteur qui tourne en continu","Facture d'eau anormale","Moisissure / odeur","Dégât des eaux visible","Baisse de pression","Infiltration signalée par voisin/syndic"],
    causes: ["Corrosion de la canalisation","Joint défectueux","Raccord desserré","Gel / éclatement","Usure de la canalisation","Perçage accidentel","Surpression du réseau","Défaut de raccordement"],
    // Catégorie propre à la recherche de fuite : comment la fuite a été recherchée/localisée.
    methodes: ["Inspection visuelle","Gaz traceur","Caméra thermique","Écoute acoustique / corrélateur","Colorant traceur","Inspection caméra canalisation","Test de mise en pression (tronçon par tronçon)","Humidimètre","Détecteur de réseaux enterrés"],
    actions: ["Mise en pression du réseau testée tronçon par tronçon","Passage caméra thermique","Injection de gaz traceur","Passage caméra endoscopique dans canalisation","Test au colorant","Ouverture ciblée pour confirmation visuelle","Lecture et suivi du compteur"],
    resultats: ["Fuite localisée avec précision","Origine de la fuite confirmée","Fuite réparée sur place","Fuite non localisable sans travaux destructifs","Aucune fuite détectée à ce jour","Rapport transmis pour expertise assurance","Reprise de réseau à prévoir"],
  },
  {
    id: "nettoyage", label: "Nettoyage / Pompage", icon: "🧽", color: "#14B8A6", groupe: "Assainissement",
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

// ── Modules de service personnalisés (créés depuis l'admin) ──
// Stockés dans Firebase sous prestationsCustom/{id}, puis fusionnés dans le tableau
// PRESTATIONS lui-même (par mutation, comme applyPrestationLabels) pour que tout le
// reste du code (formulaires, PDF, listes, agenda…) les traite exactement comme les
// modules d'origine, sans rien modifier ailleurs.
const CHAMPS_CATS_KEYS = ["localisations","problemes","causes","constatCamera","methodes","actions","resultats"];
const watchPrestationsCustom = (cb) => onValue(ref(db, "prestationsCustom"), snap => cb(snap.val()||{}));
const watchParametresIA = (cb) => onValue(ref(db, "parametresIA"), snap => cb(snap.val()||{analysePhotos:true,maxPhotos:0}));
const saveParametresIA = (params) => set(ref(db, "parametresIA"), sanitize(params));
/* Lexique métier plomberie / assainissement.
   La dictée vocale déforme systématiquement le vocabulaire technique ("eaux refoulées"
   transcrit "eaux OS", "hydrocureur" en "hydro cureur"...). Ce bloc est injecté dans les
   prompts pour que le modèle rétablisse le terme métier au lieu de recopier le charabia. */
const LEXIQUE_METIER = `VOCABULAIRE MÉTIER — plomberie et assainissement.
Le texte vient d'une dictée vocale : la transcription déforme très souvent les termes techniques. Rétablis systématiquement le terme métier correct quand le son y correspond, au lieu de recopier une transcription absurde. N'invente jamais un fait qui n'a pas été dicté — tu corriges le mot, pas le contenu.
Termes de référence : eaux refoulées, refoulement, eaux usées (EU), eaux vannes (EV), eaux pluviales (EP), engorgement, obstruction, hydrocurage, camion hydrocureur, furet, débouchage, curage, inspection caméra, passage caméra, canalisation, collecteur, colonne montante, chute, regard, tampon, siphon, avaloir, caniveau, grille, descente, gouttière, bac à graisse, séparateur à graisse, fosse septique, fosse toutes eaux, poste de relevage, pompe de relevage, clapet anti-retour, vanne d'arrêt, robinet d'arrêt, bâti-support, flotteur, robinet flotteur, mécanisme de chasse, réservoir, joint, mitigeur, ballon d'eau chaude, groupe de sécurité, résistance, détartrage, désembouage, purge, mise en pression, gaz traceur, humidimètre, écoute acoustique, colorant, PVC, PER, cuivre, fonte, multicouche, Ø 100, DN 100, partie privative, partie commune, syndic, copropriété, locataire, bailleur.
Exemples de corrections attendues : "eaux OS"/"eau os" → "eaux usées" ou "eaux refoulées" selon le contexte ; "hydro cureur" → "hydrocureur" ; "bâti support" → "bâti-support" ; "bac a graisse" → "bac à graisse" ; "colonne montante" mal découpée doit être rétablie.
Si un mot reste réellement incompréhensible, écris-le tel quel plutôt que d'inventer un terme technique.`;

const MODELES_MESSAGE_DEFAUT = [
  {nom:"Complet", texte:"📋 Rapport d'intervention — {id}\nClient : {client}\nAdresse : {adresse}\nDate : {date} à {heure}\n\nPrestations :\n{prestations}\n\nConclusion :\n{conclusion}\n\nTechnicien : {technicien}"},
  {nom:"Court", texte:"Bonjour {client}, notre intervention du {date} est terminée. Rapport complet transmis séparément. Merci de votre confiance. — {technicien}, A6T Assainissement"},
  {nom:"Suivi", texte:"Bonjour {client}, pour faire suite à notre passage du {date} : {conclusion}\nN'hésitez pas si besoin. — {technicien}"},
];
const watchParametresMessages = (cb) => onValue(ref(db, "parametresMessages"), snap => cb(snap.val()?.modeles?.length ? snap.val() : {modeles:MODELES_MESSAGE_DEFAUT}));
const saveParametresMessages = (params) => set(ref(db, "parametresMessages"), sanitize(params));
function appliquerModeleMessage(texte, fiche) {
  const locStr = formatLoc(fiche.loc);
  const prestationsTxt = (fiche.prestations||[]).map(p=>{
    const meta = PRESTATIONS.find(x=>x.id===p.id);
    return `• ${meta?.label}${p.resultats?.length?" — "+p.resultats.join(", "):""}`;
  }).join("\n");
  return (texte||"")
    .replaceAll("{client}", fiche.client||"—")
    .replaceAll("{adresse}", fiche.adresse||"—")
    .replaceAll("{localisation}", locStr||"")
    .replaceAll("{date}", dateFr(fiche.dateRdv))
    .replaceAll("{heure}", fiche.heureRdv||"")
    .replaceAll("{technicien}", fiche.technicien||"—")
    .replaceAll("{id}", fiche.id||"")
    .replaceAll("{conclusion}", fiche.conclusion||"")
    .replaceAll("{prestations}", prestationsTxt);
}
const savePrestationCustom = (item) => set(ref(db, `prestationsCustom/${item.id}`), sanitize(item));
const deletePrestationCustom = (id) => remove(ref(db, `prestationsCustom/${id}`));
function applyPrestationsCustom(data={}) {
  Object.values(data).forEach(item=>{
    if(!item?.id) return;
    let existant = PRESTATIONS.find(p=>p.id===item.id);
    if(!existant){
      existant = { id:item.id, _custom:true };
      PRESTATIONS.push(existant);
    }
    existant.label = item.label || existant.label || "Nouveau service";
    existant.icon = item.icon || existant.icon || "🧩";
    existant.color = item.color || existant.color || "#8B5CF6";
    existant._origLabel = existant._origLabel || existant.label;
    existant._custom = true;
    CHAMPS_CATS_KEYS.forEach(k=>{ existant[k] = Array.isArray(item[k]) ? item[k] : (existant[k]||[]); });
  });
  // Retire du tableau les modules personnalisés supprimés côté Firebase
  for(let i=PRESTATIONS.length-1;i>=0;i--){
    const p = PRESTATIONS[i];
    if(p._custom && !data[p.id]) PRESTATIONS.splice(i,1);
  }
}

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
/* Une fiche est en retard si sa date est passée et qu'elle n'est ni terminée ni annulée. */
const estEnRetard = (f) => Boolean(f.dateRdv) && f.dateRdv < new Date().toISOString().slice(0,10) && f.status!=="termine" && f.status!=="annule";
const estAProgrammer = (f) => !f.dateRdv && (f.type==="rdv" || (f.status==="planifie" && !(f.prestations&&f.prestations.length)));

// Section repliable — utilisée dans Administration pour que la page reste rapide à
// parcourir malgré le nombre de sections. Fermée par défaut ; se souvient si l'utilisateur
// l'a ouverte (par onglet de session, pas persisté entre visites — volontairement simple).
function Repliable({ T, icone, titre, badge, defaultOpen=false, children }) {
  const [ouvert, setOuvert] = useState(defaultOpen);
  return (
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setOuvert(v=>!v)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"14px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <span style={{fontWeight:800,fontSize:14,color:T.text,flex:1,display:"flex",alignItems:"center",gap:8}}>{icone} {titre}{badge&&<span style={{fontSize:10.5,fontWeight:700,color:T.textMuted,background:T.surface2,padding:"2px 8px",borderRadius:10}}>{badge}</span>}</span>
        <span style={{color:T.textMuted,fontSize:13,transition:"transform .15s",transform:ouvert?"rotate(90deg)":"none"}}>▶</span>
      </button>
      {ouvert && <div style={{padding:"0 16px 16px"}}>{children}</div>}
    </div>
  );
}

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
  r.onload = e => { const img = new Image(); img.onload = async () => {
    const max = 1024; const sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    try {
      const url = await uploadPhotoToStorage(dataUrl, "photos-fiches");
      res({ name: file.name, data: url });
    } catch(err) {
      // Pas de réseau (technicien en sous-sol, cave...) : on garde la photo en local
      // pour ne jamais bloquer la prise de photo sur site.
      res({ name: file.name, data: dataUrl, _uploadFailed: true });
    }
  }; img.src = e.target.result; };
  r.readAsDataURL(file);
});
const CONTRAT_TYPES = ["Bac à graisse","Poste de relevage","Curage annuel","Entretien copropriété","Autre entretien"];
const FREQUENCES = { mensuel:{label:"Mensuel",mois:1}, bimestriel:{label:"Tous les 2 mois",mois:2}, trimestriel:{label:"Trimestriel",mois:3}, semestriel:{label:"Semestriel",mois:6}, annuel:{label:"Annuel",mois:12} };
const FACTURATION = { a_facturer:{label:"À facturer",color:"#F59E0B"}, brouillon:{label:"Brouillon",color:"#8B5CF6"}, facture:{label:"Facturé",color:"#10B981"}, ne_pas_facturer:{label:"Ne pas facturer",color:"#64748B"} };
const addFreq = (dateISO, freq) => { const d = new Date(dateISO+"T12:00:00"); d.setMonth(d.getMonth() + (FREQUENCES[freq]?.mois||12)); return d.toISOString().split("T")[0]; };
const euro = (n) => (isNaN(n)?0:n).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}) + " €";
const uid2   = (p) => p + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(e){ return null; } };
// Recherche insensible aux accents — utile car beaucoup de recherches sont dictées à la voix,
// et un accent manquant ou différent ne doit pas empêcher de retrouver une fiche.
const sansAccents = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
// ── Recherche floue (tolérante aux fautes de frappe/dictée) ──
// Utilisée uniquement en secours quand la recherche exacte ne trouve rien : propose les
// fiches les plus proches du terme tapé, au lieu de "Aucun résultat".
function distanceLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({length:n+1}, (_,j)=>j);
  for (let i=1;i<=m;i++){
    const cur = [i];
    for (let j=1;j<=n;j++){
      cur[j] = a[i-1]===b[j-1] ? prev[j-1] : 1+Math.min(prev[j], cur[j-1], prev[j-1]);
    }
    prev = cur;
  }
  return prev[n];
}
function scoreRessemblance(recherche, texteOriginal) {
  const motsRecherche = sansAccents(recherche).toLowerCase().split(/\s+/).filter(Boolean);
  const motsTexteOriginal = (texteOriginal||"").split(/[\s,.\-]+/).filter(Boolean); // garde la casse d'origine pour l'affichage
  const motsTexte = motsTexteOriginal.map(m=>sansAccents(m).toLowerCase());
  if (!motsRecherche.length || !motsTexte.length) return { score: Infinity, motTrouve: null };
  let total = 0;
  let meilleurGlobal = Infinity, motTrouveGlobal = null;
  motsRecherche.forEach(mr=>{
    let meilleur = Infinity, idxMeilleur = -1;
    motsTexte.forEach((mt,i)=>{ const d = distanceLevenshtein(mr, mt); if (d<meilleur) { meilleur = d; idxMeilleur = i; } });
    total += meilleur / Math.max(mr.length, 3); // normalisé : tolère ~1 lettre d'écart tous les 3 caractères
    if (meilleur < meilleurGlobal) { meilleurGlobal = meilleur; motTrouveGlobal = motsTexteOriginal[idxMeilleur]; }
  });
  return { score: total / motsRecherche.length, motTrouve: motTrouveGlobal };
}
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
const stripLourd = (f) => { const {photos, signature, signatureTech, signaturesSupp, logoSociete, ...rest} = f; return {...rest, _nbPhotos:(photos||[]).length, _signee:!!signature}; };
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
// Certaines fiches ont deux numéros notés dans le même champ (ex: "06 12 34 56 78 / 07 98 76 54 32",
// client + gardien...). Un lien tel: ne peut composer qu'UN seul numéro — sinon l'appel ne
// se déclenche pas directement. On extrait ici uniquement le premier numéro valide pour l'appel,
// tout en laissant le texte complet affiché tel quel.
const telHref = (raw) => {
  if (!raw) return "";
  const m = String(raw).match(/(\+?\d[\d\s.\-]{6,})/);
  const brut = m ? m[1] : raw;
  return `tel:${String(brut).replace(/[^\d+]/g,"")}`;
};

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
async function generateConclusionIA(prestations, locStr, responsabilite, preconisations = [], photos = []) {
  const details = prestations.map(p => {
    const meta = PRESTATIONS.find(x => x.id === p.id);
    return {
      prestation: meta?.label,
      localisation: locStr || (p.localisations?.join(", ") || ""),
      problemes: p.problemes?.join(", ") || "",
      causes: p.causes?.join(", ") || "",
      methodes: p.methodes?.join(", ") || "",
      actions: p.actions?.join(", ") || "",
      resultats: p.resultats?.join(", ") || "",
      note: p.note || "",
    };
  });

  const resp = RESPONSABILITES.find(r => r.id === responsabilite);
  const prompt = `Tu es un rédacteur de rapports d'intervention technique pour une entreprise de plomberie et assainissement française.

${LEXIQUE_METIER}
  
Rédige une conclusion professionnelle, naturelle et bien écrite en français pour un rapport d'intervention avec les informations suivantes :

${details.map(d => `
Prestation : ${d.prestation}
${d.localisation ? `Lieu : ${d.localisation}` : ""}
${d.problemes ? `Problème : ${d.problemes}` : ""}
${d.causes ? `Cause : ${d.causes}` : ""}
${d.methodes ? `Méthode(s) de détection utilisée(s) : ${d.methodes}` : ""}
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
- Rédige un texte coulant. UN seul paragraphe si l'intervention est simple. Si elle comporte des phases distinctes (visites successives, première action puis retour sur site, travaux annexes), sépare-les en paragraphes courts, et mets la formule de politesse finale sur sa propre ligne.
- Commence par "Dans le cadre de notre intervention" (JAMAIS "Suite à notre intervention", tournure jugée trop familière pour un rapport adressé à un syndic)
- REGISTRE : registre technique écrit, pas de langage parlé. Applique ces préférences :
  * "afin d'accéder à" et NON "afin d'avoir accès à"
  * "présentant un défaut d'étanchéité" et NON "semblant non étanche" ; bannis les tournures approximatives ("semblant", "apparemment", "visiblement")
  * "provenant du réservoir DU WC encastré" — articles contractés corrects, pas "de WC"
  * supprime les mots parasites qui n'apportent aucune information ("sur place", "bien entendu", "comme convenu")
  * orthographe des termes métier : bâti-support, siphon, colonne montante, regard, caniveau, hydrocureur
- PRUDENCE : n'affirme jamais plus que ce qui a été réellement constaté. Une cause non confirmée s'introduit par "il s'avère que" ou "après vérification", jamais comme un diagnostic définitif. N'attribue aucune responsabilité qui ne soit pas explicitement fournie.
- Mentionne le lieu seulement s'il est fourni
- Résume simplement les actions et leur résultat
- Ne présente JAMAIS une préconisation comme une action réalisée. Seules les lignes "Actions" ont été effectuées. Les préconisations sont introduites par "nous préconisons" ou "nous recommandons", au futur ou au conditionnel, et seulement si elles sont fournies
- Si des méthodes de détection sont fournies (recherche de fuite), mentionne-les factuellement — ce sont souvent des informations importantes pour un dossier d'assurance
- Si aucune inspection caméra ne figure dans les Actions, n'affirme pas qu'un passage caméra a eu lieu
- Termine par une formule de politesse courte et simple
- Pas de longueur imposée : couvre tout ce qui a été fait, sans remplissage. Une intervention simple donne un texte court, une intervention en plusieurs visites donne un texte plus long. Ne tronque jamais un élément factuel pour rester court.
- NE PAS lister les prestations séparément, faire un texte coulant${photos.length ? `
- Des photos de l'intervention sont jointes ci-dessous. Appuie-toi sur ce que tu observes concrètement dessus (état visible, matériel, avant/après si distinguable) pour enrichir FACTUELLEMENT la conclusion — uniquement ce qui est visible, sans jamais inventer un détail non confirmé par le texte ou l'image` : ""}`;

  // Construction des blocs de contenu : photos d'abord (URL Storage ou base64 selon leur
  // origine), puis le texte du prompt — pour que l'IA s'appuie vraiment sur ce qu'elle voit,
  // pas seulement sur les cases cochées.
  const contentBlocks = [];
  for (const p of photos) {
    if (!p?.data) continue;
    if (p.data.startsWith("http")) {
      contentBlocks.push({ type: "image", source: { type: "url", url: p.data } });
    } else if (p.data.startsWith("data:")) {
      const mediaType = p.data.match(/^data:(.*?);base64/)?.[1] || "image/jpeg";
      contentBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data: p.data.split(",")[1] } });
    }
  }
  contentBlocks.push({ type: "text", text: prompt });

  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || data?.error || "Erreur API");
  return data.content?.[0]?.text || "";
}

async function generateNotePrestation(presta, locStr) {
  const meta = PRESTATIONS.find(x => x.id === presta.id);
  const prompt = `Rédige une courte note technique professionnelle en français (2-3 phrases maximum) pour cette prestation d'intervention :

${LEXIQUE_METIER}

Prestation : ${meta?.label}
${locStr ? `Lieu : ${locStr}` : ""}
${presta.problemes?.length ? `Problème : ${presta.problemes.join(", ")}` : ""}
${presta.causes?.length ? `Cause : ${presta.causes.join(", ")}` : ""}
${presta.methodes?.length ? `Méthode(s) de détection utilisée(s) : ${presta.methodes.join(", ")}` : ""}
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
  if (!w) { dlgInfo("Veuillez autoriser les fenêtres pop-up pour ce site, puis réessayez."); return; }
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

/* Les phrases d'une prestation, utilisées par le rapport HTML et par le PDF :
   une seule source, pour que les deux ne divergent jamais. */
function phrasesPrestation(p, locStr) {
  const sentences = [];
      const pLocStr = locStr || (p.localisations?.length ? `${p.localisations.join(", ")}` : null);
      if (pLocStr) sentences.push(`L'intervention a été réalisée : ${pLocStr}.`);
      if (p.problemes?.length) sentences.push(`Problème constaté : ${p.problemes.map(s=>s.toLowerCase()).join(", ")}.`);
      if (p.causes?.length) sentences.push(`Cause identifiée : ${p.causes.map(s=>s.toLowerCase()).join(", ")}.`);
      if (p.constatCamera?.length) sentences.push(`Constat caméra : ${p.constatCamera.map(s=>s.toLowerCase()).join(", ")}.`);
      if (p.methodes?.length) sentences.push(`Méthode${p.methodes.length>1?"s":""} de détection utilisée${p.methodes.length>1?"s":""} : ${p.methodes.map(s=>s.toLowerCase()).join(", ")}.`);
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
  return sentences;
}

function buildReportHTML(fiche, hideInternal = false) {
  const resp = RESPONSABILITES.find(r => r.id === fiche.responsabilite);
  const presta = (fiche.prestations||[]).map(p => ({ ...p, meta: PRESTATIONS.find(x => x.id === p.id) }));
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

  /* On garde TOUTES les prestations de la fiche, même celles sans case cochée : elles sont
     alors affichées avec leur seul intitulé. Avant, elles étaient filtrées, ce qui donnait
     un rapport annonçant "1 prestation(s)" suivi de "Aucune prestation enregistrée." */
  const prestaAffichees = presta;
  const nbPrestaAffichees = prestaAffichees.length;
  const prestaHTML = prestaAffichees
    .map(p => {
      const sentences = phrasesPrestation(p, locStr);
      return `
      <div class="presta-card" style="border-left-color:${p.meta?.color||'#0ea5e9'}">
        <div class="presta-header">
          <span class="presta-puce" style="background:${p.meta?.color||'#0ea5e9'}"></span>
          <span class="presta-title" style="color:${p.meta?.color}">${p.meta?.label}${p.diametre?` — Ø ${p.diametre} mm`:""}</span>
        </div>
        <div class="presta-body">
          ${sentences.map(s=>`<p class="phrase">${s}</p>`).join("")}
        </div>
      </div>`;
    }).join("");

  /* Le texte saisi contient des retours à la ligne ; en HTML ils disparaissent et tout
     se retrouve collé. On rétablit les paragraphes et on échappe le HTML au passage. */
  const enParagraphes = (txt) => (txt||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean)
    .map(b=>`<p class="para">${b.replace(/\n/g,"<br/>")}</p>`).join("") || "—";

  const photoItem = p => `<div class="photo-item"><img src="${p.data}" alt="" class="photo-zoomable" style="cursor:zoom-in" onclick="zoomPhoto(this.src)"/></div>`;
  /* Le titre de section ("Après travaux") est collé à sa première rangée de photos dans un
     bloc insécable : Chrome ignore break-after:avoid, d'où les titres restés seuls en bas
     de page. Le reste des photos s'écoule librement, pour ne pas créer de page blanche. */
  const photoSection = (titre, liste) => liste.length
    ? `<div class="photo-section">`
      + `<div class="photo-tete"><div class="photo-subtitle">${titre} (${liste.length})</div>`
      + `<div class="photo-grid">${liste.slice(0,2).map(photoItem).join("")}</div></div>`
      + (liste.length>2 ? `<div class="photo-grid photo-suite">${liste.slice(2).map(photoItem).join("")}</div>` : "")
      + `</div>` : "";
  const photosOntTag = fiche.photos?.some(p=>p.tag);
  const photoGrid = fiche.photos?.length
    ? `<div class="section-block"><div class="section-title">Photos (${fiche.photos.length})</div>
       ${photosOntTag
         ? photoSection("Avant travaux", fiche.photos.filter(p=>p.tag==="avant")) + photoSection("Pendant intervention", fiche.photos.filter(p=>p.tag==="pendant")) + photoSection("Après travaux", fiche.photos.filter(p=>p.tag==="apres")) + photoSection("Autres photos", fiche.photos.filter(p=>!p.tag))
         : `<div class="photo-grid">${fiche.photos.map(p=>`<div class="photo-item"><img src="${p.data}" alt="" class="photo-zoomable" style="cursor:zoom-in" onclick="zoomPhoto(this.src)"/></div>`).join("")}</div>`}
       </div>` : "";

  const sigBoxes = [];
  if (fiche.signatureTech) sigBoxes.push(`<div class="sig-box"><div class="sig-box-label">Signature technicien</div><img src="${fiche.signatureTech}" class="sig-img"/><div class="sig-name">${fiche.technicien||"Technicien"}</div></div>`);
  (fiche.signaturesSupp||[]).forEach(s => {
    sigBoxes.push(`<div class="sig-box"><div class="sig-box-label">Signature — co-intervenant</div><img src="${s.data}" class="sig-img"/><div class="sig-name">${s.nom}</div></div>`);
  });
  if (fiche.signature) sigBoxes.push(`<div class="sig-box"><div class="sig-box-label">Signature client — Bon pour accord</div><img src="${fiche.signature}" class="sig-img"/>${fiche.nomSignataire?`<div class="sig-name">${fiche.nomSignataire}</div>`:""}</div>`);
  const sigZone = sigBoxes.length ? `<div class="sig-zone" style="grid-template-columns:repeat(${Math.min(sigBoxes.length,2)},1fr)">${sigBoxes.join("")}</div>` : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Rapport ${fiche.id}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700;900&family=DM+Sans:wght@400;500;600;700&display=swap');
/* Marges de page à zéro : sans espace de marge, le navigateur n'imprime plus ses
   propres en-têtes/pieds de page (URL du site, date, "Page X sur Y").
   Les marges visuelles sont restituées en padding interne dans le bloc @media print. */
@page{size:A4;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;color:#1e293b;background:#fff;font-size:12px;line-height:1.7;-webkit-font-smoothing:antialiased}
.header{position:relative;background:linear-gradient(135deg,#0c1e3d 0%,#132d54 100%);padding:32px 36px;border-radius:0 0 20px 20px;overflow:hidden}
.header::after{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#38bdf8,#818cf8,#38bdf8);opacity:.7}

.header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;position:relative;z-index:1}
.brand{display:flex;align-items:center;gap:13px}
.brand-logo{background:#fff;border-radius:10px;padding:6px;width:52px;height:52px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.2)}
.brand-logo img{max-width:100%;max-height:100%;display:block}
.brand-name{font-family:'Fraunces',serif;font-size:15.5px;font-weight:700;color:#cfe0f5;letter-spacing:.02em}
.report-title{font-family:'Fraunces',serif;font-size:26px;font-weight:900;color:#fff;margin-top:16px;position:relative;z-index:1;line-height:1.15;letter-spacing:-.01em}
.report-subtitle{font-size:11.5px;color:#8fb3dd;margin-top:5px;position:relative;z-index:1;font-weight:500}
.result-pill{display:inline-flex;align-items:center;gap:9px;margin-top:18px;background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.35);border-radius:10px;padding:8px 16px;position:relative;z-index:1}
.result-pill .dot{width:17px;height:17px;border-radius:50%;background:#34d399;color:#0c1e3d;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;flex-shrink:0}
.result-pill .txt{font-size:12px;font-weight:600;color:#a7f3d0}
.result-pill .txt b{color:#fff;font-weight:700}
.ref-card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:16px 19px;min-width:190px;backdrop-filter:blur(2px)}
.ref-label{font-size:8px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#8fb3dd;margin-bottom:9px}
.ref-id{font-family:'Fraunces',serif;font-size:19px;font-weight:700;color:#fff;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:12px;margin-bottom:12px;letter-spacing:.01em}
.ref-row{display:flex;align-items:center;gap:9px;margin-bottom:9px}
.ref-row .ic{font-size:12px;opacity:.75}
.ref-row .rl{font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7fa3cc;line-height:1.3}
.ref-row .rv{font-size:12px;font-weight:600;color:#f1f5f9;line-height:1.3}
.ref-status{display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.12);padding-top:12px;margin-top:3px}
.ref-status .sl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7fa3cc}
.status-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:7px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;background:${status.bg};color:${status.color};border:1px solid ${status.color}44}
.urgent-badge{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:7px;font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(239,68,68,0.16);color:#fca5a5;border:1px solid #EF444444}
.body{padding:30px 34px}
.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}
.info-card{background:#f8fafc;border-radius:9px;padding:11px 15px;border:1.5px solid #b8c2cf}
.info-card.full{grid-column:1/-1}
.info-label{font-size:8px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:#8896a8;margin-bottom:4px}
.info-value{font-size:12.5px;font-weight:600;color:#1e293b}
.loc-banner{background:#f0f7fd;border:1.5px solid #7fb0d9;border-radius:9px;padding:11px 16px;margin-bottom:22px;font-size:12px;font-weight:600;color:#1d5686}
.section-block{margin-bottom:22px}
.section-title{font-size:8.5px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#111;padding-left:9px;padding-bottom:6px;border-bottom:2px solid #111;margin-bottom:13px;line-height:1.5}
.presta-card{background:#fbfcfd;border-radius:9px;margin-bottom:11px;border:1.5px solid #b8c2cf;border-left:4px solid #0ea5e9;overflow:hidden}
.presta-header{padding:11px 15px;background:linear-gradient(90deg,rgba(0,0,0,0.025),transparent);display:flex;align-items:center;gap:9px;border-bottom:1.5px solid #d5dae1}
.presta-puce{width:9px;height:9px;border-radius:50%;display:inline-block;flex-shrink:0}
.presta-title{font-family:'Fraunces',serif;font-size:13px;font-weight:700;letter-spacing:.01em}
.presta-body{padding:13px 17px}
.phrase{font-size:12px;color:#3d4a5c;line-height:1.85;margin-bottom:4px}
.resp-badge{display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:8px;font-size:11px;font-weight:600;background:${resp?.color||'#64748b'}12;color:${resp?.color||'#64748b'};border:1.5px solid ${resp?.color||'#64748b'}}
.conclusion-box{background:#f6fbf8;border:1.5px solid #7fb896;border-radius:9px;padding:15px 19px;color:#20553a;font-size:12px;line-height:1.85}
.conclusion-box .para{margin:0 0 9px}
.conclusion-box .para:last-child{margin-bottom:0}
.conclusion-box::before{content:"";display:block;width:24px;height:3px;background:#3ba873;border-radius:2px;margin-bottom:11px}
.preco-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px}
.preco-list li{font-size:11px;font-weight:600;color:#5b4b9e;background:#f7f6fc;border:1.5px solid #b7a9e0;border-radius:7px;padding:7px 11px}
.preco-list li::before{content:"▸ ";opacity:.55}
.photo-subtitle{font-size:10.5px;font-weight:700;color:#5c6b80;text-transform:uppercase;letter-spacing:0.06em;margin:11px 0 7px;break-after:avoid;page-break-after:avoid}
.photo-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}
.photo-suite{margin-top:11px}
.photo-tete{break-inside:avoid;page-break-inside:avoid}
.photo-item{border-radius:9px;overflow:hidden;aspect-ratio:4/3;border:1.5px solid #9aa5b1;max-height:240px;background:#f4f6f8;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(15,23,42,0.06)}
.photo-item img{width:100%;height:100%;object-fit:cover;display:block;max-height:240px}
.sig-zone{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px}
.sig-box{border:1.5px solid #b8c2cf;border-radius:9px;padding:15px 17px;min-height:100px;background:#fbfcfd}
.sig-box-label{font-size:8.5px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#8896a8;margin-bottom:13px}
.sig-img{max-height:64px;max-width:100%;display:block}
.sig-line{border-bottom:1.5px solid #d6dde5;height:48px}
.sig-name{font-size:11px;font-weight:600;color:#3d4a5c;margin-top:9px;border-top:1px solid #e8edf3;padding-top:8px}
.internal{margin-top:22px;background:#fdf8f2;border-radius:9px;padding:15px 19px;border:1.5px dashed #ecc491}
.internal-title{font-size:8px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#a8631f;margin-bottom:11px}
.internal-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.int-card{background:#fff;border:1px solid #f0d9b5;border-radius:7px;padding:9px 12px}
@media print{.internal{display:none!important}}
.footer{margin-top:22px;padding-top:11px;border-top:1px solid #e8edf3;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
.footer-logo{font-family:'Fraunces',serif;font-size:11px;font-weight:700;color:#94a3b8}
.footer-logo em{color:#0ea5e9;font-style:normal}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}

/* Pagination à l'impression : chaque bloc reste toujours entier — soit il tient sur la
   page, soit il bascule intégralement à la page suivante, jamais coupé en plein milieu.
   L'en-tête est aussi resserré pour l'impression afin de libérer de la place pour le
   contenu, quelle que soit la longueur du rapport. */
@media print{
  .info-card,.presta-card,.sig-box,.photo-item,.resp-badge,.loc-banner,.preco-list li,.int-card,.photo-tete{
    break-inside:avoid;page-break-inside:avoid;
  }
  /* Photos resserrées : un bloc titre + rangée qui tient plus facilement en bas de page,
     donc moins de demi-pages blanches. */
  .photo-item,.photo-item img{max-height:150px}
  .photo-subtitle{margin:8px 0 5px}
  .photo-grid{gap:8px}
  /* Le cadre de signature ne doit jamais être coupé en deux pages : soit il tient à la
     suite des photos, soit il part entier. On le resserre pour qu'il tienne le plus
     souvent possible et n'entraîne pas une page supplémentaire presque vide. */
  .sig-zone{break-inside:avoid;page-break-inside:avoid;margin-top:14px;gap:14px}
  .sig-box{min-height:74px;padding:11px 13px}
  .sig-box-label{margin-bottom:9px}
  .sig-line{height:34px}
  .sig-img{max-height:52px}
  .sig-name{margin-top:7px;padding-top:6px}
  .footer{margin-top:14px;padding-top:8px}
  .section-title{break-after:avoid;page-break-after:avoid}
  .presta-header{break-after:avoid;page-break-after:avoid}
  .conclusion-box,.phrase,.para{orphans:3;widows:3}
  .conclusion-box .para{break-inside:avoid;page-break-inside:avoid}
  .header{padding:18px 30px}
  .report-title{font-size:21px;margin-top:10px}
  .report-subtitle{margin-top:3px}
  .result-pill{margin-top:10px;padding:6px 13px}
  .ref-card{padding:11px 15px;min-width:150px}
  .ref-id{font-size:15px;padding-bottom:8px;margin-bottom:8px}
  .ref-row{margin-bottom:6px}
  .body{padding:18px 30px}
  .section-block{margin-bottom:11px}
  .client-grid{margin-bottom:11px}
  .presta-card{margin-bottom:8px}
  .presta-body{padding:10px 14px}
  .phrase{margin-bottom:2px}
  .photo-grid{gap:8px}
  .photo-item{max-height:190px}
  .photo-item img{max-height:190px}
  .sig-zone{margin-top:14px;gap:14px}
  /* Compensation des marges de page mises à zéro (@page) : le contenu ne doit pas
     coller aux bords de la feuille. */
  .header{padding:24px 30px 20px}
  .body{padding:13mm 12mm 16mm}
  .photo-grid{padding-top:2mm}
}
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
      <div class="ref-row"><div><div class="rl">Date</div><div class="rv">${dateFr(fiche.dateRdv)}</div></div></div>
      ${fiche.heureRdv?`<div class="ref-row"><div><div class="rl">Heure</div><div class="rv">${fiche.heureRdv}</div></div></div>`:""}
      <div class="ref-status"><span class="sl">Statut</span><span class="status-badge">${status.label}</span></div>
      ${isUrgent?'<span class="urgent-badge">Intervention urgente</span>':""}
    </div>
  </div>
</div>
<div class="body">
  <div class="client-grid">
    ${fiche.client?`<div class="info-card"><div class="info-label">Client / Société</div><div class="info-value">${fiche.client}</div></div>`:""}
    ${[fiche.technicien, ...(fiche.techniciensSupp||[])].filter(Boolean).length?`<div class="info-card"><div class="info-label">Technicien${fiche.techniciensSupp?.length?"s":""}</div><div class="info-value">${[fiche.technicien, ...(fiche.techniciensSupp||[])].filter(Boolean).join(" + ")}</div></div>`:""}
    ${fiche.adresse?`<div class="info-card full"><div class="info-label">Adresse d'intervention</div><div class="info-value">${fiche.adresse}${fiche.diametreCanalisation?" — DN "+fiche.diametreCanalisation:""}</div></div>`:""}
    ${fiche.tel?`<div class="info-card"><div class="info-label">Téléphone</div><div class="info-value">${fiche.tel}</div></div>`:""}
    ${fiche.email?`<div class="info-card"><div class="info-label">Email</div><div class="info-value">${fiche.email}</div></div>`:""}
  </div>
  ${locStr?`<div class="loc-banner">${locStr}</div>`:""}
  <div class="section-block">
    <div class="section-title">Compte-rendu d'intervention${nbPrestaAffichees?` — ${nbPrestaAffichees} prestation(s)`:""}</div>
    ${prestaHTML||'<p style="color:#94a3b8;font-style:italic">Aucune prestation enregistrée.</p>'}
  </div>
  ${fiche.responsabilite&&fiche.responsabilite!=="na"?`<div class="section-block"><div class="section-title">Responsabilité</div><div class="resp-badge">● ${resp?.label} — ${resp?.desc}</div></div>`:""}
  ${fiche.preconisations?.length?`<div class="section-block"><div class="section-title">Préconisations</div><ul class="preco-list">${fiche.preconisations.map(p=>`<li>${p}</li>`).join("")}</ul></div>`:""}
  <div class="section-block"><div class="section-title">Conclusion</div><div class="conclusion-box">${enParagraphes(fiche.conclusion)}</div></div>
  ${majorationsTexte(fiche).length?`<div class="section-block"><div class="section-title">Conditions d'intervention</div><ul class="preco-list">${majorationsTexte(fiche).map(t=>`<li>${t}</li>`).join("")}</ul></div>`:""}
  ${photoGrid}
  ${sigZone}
  ${!hideInternal ? `<div class="internal">
    <div class="internal-title">Usage interne — non transmis au client</div>
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
</div>
<div id="lightbox" onclick="this.style.display='none'" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;">
  <img id="lightbox-img" src="" style="max-width:94%;max-height:94%;border-radius:6px;box-shadow:0 10px 50px rgba(0,0,0,0.6);"/>
</div>
<style>@media print{ .photo-zoomable{cursor:default!important;} #lightbox{display:none!important;} }</style>
<script>
function zoomPhoto(src){
  var lb=document.getElementById('lightbox'), img=document.getElementById('lightbox-img');
  if(!lb||!img) return;
  img.src=src; lb.style.display='flex';
}
</script>
</body></html>`;
}

function calculerMontant(temps, tarif) {
  if (!temps || !tarif) return "—";
  const match = temps.match(/(\d+)h(\d+)?/);
  if (!match) return "—";
  const heures = parseInt(match[1]) + (match[2] ? parseInt(match[2])/60 : 0);
  return (heures * parseFloat(tarif)).toFixed(2);
}

function parseTempsMinutes(temps) {
  if (!temps) return 0;
  const match = temps.match(/(\d+)h(\d+)?/);
  if (!match) return 0;
  return parseInt(match[1])*60 + (match[2] ? parseInt(match[2]) : 0);
}

function ExportMensuelModal({ fiches, theme, onClose }) {
  const T = THEMES[theme] || THEMES.dark;
  const [mois, setMois] = useState(() => today().slice(0,7)); // YYYY-MM
  const [copie, setCopie] = useState(false);

  const fichesDuMois = fiches.filter(f => {
    const d = f.dateRdv || (f.createdAt ? new Date(f.createdAt).toISOString().slice(0,10) : null);
    return d && d.slice(0,7)===mois && f.status==="termine";
  });

  let caTotal = 0, minutesTotal = 0;
  const parTechnicien = {};
  fichesDuMois.forEach(f => {
    const base = f.tempsInterne && f.tarifHoraire ? parseFloat(calculerMontant(f.tempsInterne, f.tarifHoraire)) : 0;
    let coef = 1; (f.majorations||[]).forEach(m=>{ if(m==="soir50")coef+=0.5; if(m==="weekend100")coef+=1; });
    const montant = (base && !isNaN(base)) ? base*coef : 0;
    caTotal += montant;
    minutesTotal += parseTempsMinutes(f.tempsInterne);
    const t = f.technicien || "Non attribué";
    if(!parTechnicien[t]) parTechnicien[t] = { nb:0, minutes:0, ca:0 };
    parTechnicien[t].nb++;
    parTechnicien[t].minutes += parseTempsMinutes(f.tempsInterne);
    parTechnicien[t].ca += montant;
  });
  const heuresTotal = (minutesTotal/60).toFixed(1);
  const nomMois = new Date(mois+"-01").toLocaleDateString("fr-FR",{month:"long",year:"numeric"});

  const texte = `📊 RÉCAPITULATIF — ${nomMois}

Interventions terminées : ${fichesDuMois.length}
Temps total : ${heuresTotal} h
CA estimé : ${caTotal.toFixed(2)} €

Par technicien :
${Object.entries(parTechnicien).map(([nom,d])=>`- ${nom} : ${d.nb} intervention(s), ${(d.minutes/60).toFixed(1)} h, ${d.ca.toFixed(2)} € estimés`).join("\n")||"— aucune donnée —"}`;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:480,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:14}}>📊 Export mensuel</div>
        <input type="month" value={mois} onChange={e=>setMois(e.target.value)}
          style={{width:"100%",padding:"10px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13.5,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:14,colorScheme:theme==="dark"?"dark":"light"}}/>
        <pre style={{whiteSpace:"pre-wrap",fontFamily:"inherit",fontSize:12.5,color:T.text,background:T.surface2,borderRadius:8,padding:14,lineHeight:1.6,marginBottom:14}}>{texte}</pre>
        <div style={{fontSize:11,color:T.textFaint,marginBottom:14}}>⚠️ Le CA est une estimation à partir du temps saisi et du tarif horaire renseignés sur chaque fiche — à recouper avec Pennylane pour la facturation réelle.</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
          <button onClick={()=>{navigator.clipboard.writeText(texte);setCopie(true);setTimeout(()=>setCopie(false),1800);}} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>{copie?"✓ Copié !":"📋 Copier"}</button>
        </div>
      </div>
    </div>
  );
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
  if(fiche.numeroOS) L.push(`N° d'ordre de service : ${fiche.numeroOS}`);
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
    catch(e) { dlgInfo("Impossible de copier automatiquement — sélectionnez le texte manuellement."); }
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
  /* Diagnostic : dire pourquoi les notifications n'arrivent pas, plutôt que de laisser
     croire qu'elles sont actives alors qu'un autre appareil a pris le même nom. */
  const [diag, setDiag] = useState(null);
  const verifier = useCallback(async (n) => {
    const out = { perm: typeof Notification!=="undefined" ? Notification.permission : "unsupported" };
    out.ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    out.installee = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
    if(n){
      try {
        const snap = await get(ref(db, `fcmTokens/${logoKey(n)}`));
        const enBase = snap.val();
        const local = localStorage.getItem("fcmToken");
        out.enregistre = Boolean(enBase);
        out.cetAppareil = Boolean(enBase && local && enBase === local);
      } catch(e) { out.erreurLecture = true; }
    }
    setDiag(out);
  },[]);
  useEffect(()=>{ verifier(techNom); },[techNom, verifier]);
  const activer = async () => {
    if(!nom.trim()){ dlgInfo("Choisissez d'abord votre nom."); return; }
    onSaveTechNom(nom.trim());
    setStatut("loading");
    const res = await initNotifications(nom.trim());
    if(res.ok) setStatut("ok");
    else if(res.reason==="denied") setStatut("denied");
    else if(res.reason==="unsupported") setStatut("unsupported");
    else setStatut("error");
    verifier(nom.trim());
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

        {diag&&(
          <div style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 13px",marginBottom:14,fontSize:12,lineHeight:1.55,color:T.textMuted}}>
            <div style={{fontWeight:800,color:T.text,marginBottom:6}}>État des notifications sur cet appareil</div>
            {diag.ios&&!diag.installee&&(
              <div style={{color:"#EF4444",fontWeight:700}}>Sur iPhone, les notifications ne fonctionnent que si l'application est installée sur l'écran d'accueil. Ouvrez le menu Partager de Safari puis « Sur l'écran d'accueil », et rouvrez l'app depuis cette icône.</div>
            )}
            {diag.perm==="denied"&&<div style={{color:"#EF4444",fontWeight:700}}>Les notifications sont refusées pour ce site. Il faut les réautoriser dans les réglages du téléphone — le bouton ci-dessous ne pourra rien y changer.</div>}
            {diag.perm==="default"&&<div style={{color:"#F59E0B",fontWeight:700}}>Les notifications n'ont jamais été autorisées sur cet appareil. Appuyez sur « Activer ».</div>}
            {diag.perm==="granted"&&!techNom&&<div style={{color:"#F59E0B",fontWeight:700}}>Aucun nom n'est associé à ce téléphone : rien ne peut vous être envoyé. Choisissez votre nom puis appuyez sur « Activer ».</div>}
            {diag.perm==="granted"&&techNom&&!diag.enregistre&&<div style={{color:"#EF4444",fontWeight:700}}>Aucun appareil n'est enregistré pour {techNom}. Appuyez sur « Activer » pour enregistrer celui-ci.</div>}
            {diag.perm==="granted"&&techNom&&diag.enregistre&&!diag.cetAppareil&&(
              <div style={{color:"#F59E0B",fontWeight:700}}>Les notifications de {techNom} partent vers un autre appareil. Un seul téléphone à la fois peut recevoir les notifications d'un nom donné — appuyez sur « Activer » pour que ce soit celui-ci.</div>
            )}
            {diag.perm==="granted"&&techNom&&diag.cetAppareil&&<div style={{color:"#10B981",fontWeight:700}}>Cet appareil est bien celui qui reçoit les notifications de {techNom}.</div>}
          </div>
        )}

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
    if(!tel.trim()){ dlgInfo("Entrez au moins un numéro."); return; }
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

        {/* Sans numéro : WhatsApp s'ouvre sur la liste des discussions, groupes compris. */}
        <button onClick={()=>envoyer("")}
          style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,width:"100%",padding:"11px 14px",background:"rgba(37,211,102,0.1)",border:"1.5px solid rgba(37,211,102,0.5)",borderRadius:9,color:"#0F9D58",cursor:"pointer",fontFamily:"inherit",marginBottom:14,textAlign:"left"}}>
          <span style={{fontWeight:800,fontSize:13.5}}>Choisir dans WhatsApp</span>
          <span style={{fontSize:11.5,fontWeight:600,opacity:.85}}>Ouvre WhatsApp avec le message prêt : vous choisissez le groupe ou le contact.</span>
        </button>

        <button onClick={async()=>{try{await navigator.clipboard.writeText(msg);dlgInfo("Le message est copié. Collez-le où vous voulez.","Copié");}catch(e){dlgInfo("La copie a échoué sur cet appareil.","Copie impossible");}}}
          style={{width:"100%",padding:"10px 14px",background:"none",border:`1px solid ${T.border}`,borderRadius:9,color:T.textMuted,fontWeight:700,fontSize:12.5,cursor:"pointer",fontFamily:"inherit",marginBottom:16}}>
          Copier le message
        </button>

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

async function relancerTechnicien(fiche, techTels = {}, onSaveTel = null) {
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
    const saisie = await dlgPrompt(`Numéro WhatsApp de ${fiche.technicien}\nFormat conseillé : 33612345678. Il sera mémorisé pour les prochaines relances. Laissez vide pour choisir le contact à la main.`, "", {titre:"Numéro du technicien",valider:"Enregistrer"});
    if(saisie&&saisie.trim()){ num = saisie.replace(/[^0-9+]/g,""); onSaveTel(fiche.technicien, num); }
  }
  window.open(num?`https://wa.me/${num.replace(/[^0-9]/g,"")}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");
}

function composerRapportWhatsApp(fiche) {
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
  return msg;
}
/* Normalise un numéro français saisi sous n'importe quelle forme
   ("+33 (0) 6 98 10 14 42", "06.98.10.14.42", "0033698101442")
   vers le format attendu par wa.me : 33698101442 (sans + ni espaces).
   Renvoie "" si le numéro est vide ou inexploitable. */
function normaliserTel(tel) {
  let n = (tel||"").replace(/[^0-9]/g,"");
  if(!n) return "";
  if(n.startsWith("00")) n = n.slice(2);          // 0033... -> 33...
  if(n.startsWith("330")) n = "33" + n.slice(3);  // +33 (0)6... -> 336...
  if(n.startsWith("0")) n = "33" + n.slice(1);    // 06...      -> 336...
  if(!n.startsWith("33") && n.length === 9) n = "33" + n; // 698101442 -> 336...
  return n;
}

function envoyerRapportWhatsApp(fiche, texteModifie) {
  const num = normaliserTel(fiche.tel);
  if(!num){ dlgInfo("Aucun numéro de téléphone sur cette fiche — renseigne-le avant d'envoyer."); return; }
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(texteModifie ?? composerRapportWhatsApp(fiche))}`,"_blank");
}

function composerRapportSMS(fiche) {
  return `Rapport ${fiche.id} — ${fiche.client||"Client"}. Intervention du ${dateFr(fiche.dateRdv)}. Rapport PDF transmis séparément.`;
}
function envoyerRapportSMS(fiche, texteModifie) {
  const num = "+" + normaliserTel(fiche.tel);
  window.location.href = `sms:${num}?&body=${encodeURIComponent(texteModifie ?? composerRapportSMS(fiche))}`;
}

// Adresse interne A6T pour l'archivage/vérification des rapports (pas d'envoi au client).
// L'envoi au client reste strictement manuel (boutons WhatsApp/SMS ci-dessus) — aucun envoi
// automatique n'est déclenché nulle part dans l'app.
const EMAIL_ARCHIVAGE_INTERNE = "contact@a6t-assainissement.fr";
function envoyerRapportArchivageInterne(fiche, pdfDejaTelecharge) {
  const sujet = `[Archivage] Rapport ${fiche.id} — ${fiche.client||"Client"}`;
  const corps = [
    `Rapport d'intervention pour archivage interne.`,
    ``,
    `Référence : ${fiche.id}`,
    `Client : ${fiche.client||"—"}`,
    `Adresse : ${fiche.adresse||"—"}`,
    `Date : ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}`,
    `Technicien : ${fiche.technicien||"—"}`,
    ``,
    pdfDejaTelecharge ? `⚠️ Le PDF du rapport vient d'être téléchargé — pensez à le joindre manuellement à cet email avant envoi.` : ``,
  ].filter(Boolean).join("\n");
  window.location.href = `mailto:${EMAIL_ARCHIVAGE_INTERNE}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
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
    ? `<div class="section-title">Photos</div><div class="pgrid">${devis.photos.map(p=>`<div class="pitem"><img src="${p.data||p}"/></div>`).join("")}</div>` : "";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>Devis ${devis.id}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap');
/* Idem rapport : marges de page à zéro pour supprimer l'en-tête/pied automatique
   du navigateur (URL, date, pagination). */
@page{size:A4;margin:0}
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
@media print{
  tr,.pitem,.notes,.totaux{break-inside:avoid;page-break-inside:avoid}
  thead{display:table-header-group}
  /* Compensation des marges de page mises à zéro (@page) */
  .hl{padding:24px 32px}
  .hr{padding:24px 32px}
  .body{padding:13mm 12mm 16mm}
}
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
   ANNOTATION PHOTO — cercles / flèches / texte
═══════════════════════════════════════════ */
function PhotoAnnotator({ photo, onSave, onClose, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState("circle"); // circle | arrow | texte
  const [color, setColor] = useState("#EF4444");
  const [shapes, setShapes] = useState([]); // liste d'opérations pour pouvoir annuler
  const drawingRef = useRef(null); // { type, x1,y1, x2,y2 } en cours de tracé
  const [, forceRender] = useState(0);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const cv = canvasRef.current;
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      redraw([]);
      setReady(true);
    };
    img.src = photo.data;
  }, [photo.data]);

  const redraw = (list) => {
    const cv = canvasRef.current, img = imgRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const lw = Math.max(3, cv.width * 0.006);
    list.forEach(s => {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = lw;
      if (s.type === "circle") {
        const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
        const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, lw), Math.max(ry, lw), 0, 0, Math.PI * 2); ctx.stroke();
      } else if (s.type === "arrow") {
        const { x1, y1, x2, y2 } = s;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1); const head = lw * 4.5;
        ctx.beginPath(); ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      } else if (s.type === "texte") {
        const fs = Math.max(20, cv.width * 0.035);
        ctx.font = `800 ${fs}px 'DM Sans', sans-serif`;
        const w = ctx.measureText(s.texte).width;
        ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(s.x1 - 6, s.y1 - fs, w + 12, fs + 12);
        ctx.fillStyle = s.color; ctx.fillText(s.texte, s.x1, s.y1);
      }
    });
  };

  const coordsFromEvent = (e) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onDown = async (e) => {
    if (!ready) return;
    e.preventDefault();
    const { x, y } = coordsFromEvent(e);
    if (tool === "texte") {
      const v = await dlgPrompt("Texte à ajouter sur la photo","",{titre:"Annoter la photo",valider:"Ajouter"});
      if (v && v.trim()) {
        const next = [...shapes, { type: "texte", x1: x, y1: y, texte: v.trim(), color }];
        setShapes(next); redraw(next);
      }
      return;
    }
    drawingRef.current = { type: tool, x1: x, y1: y, x2: x, y2: y, color };
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const { x, y } = coordsFromEvent(e);
    drawingRef.current = { ...drawingRef.current, x2: x, y2: y };
    redraw([...shapes, drawingRef.current]);
  };
  const onUp = () => {
    if (!drawingRef.current) return;
    const s = drawingRef.current;
    const moved = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 4;
    drawingRef.current = null;
    if (moved) { const next = [...shapes, s]; setShapes(next); redraw(next); }
    else redraw(shapes);
  };

  const undo = () => { const next = shapes.slice(0, -1); setShapes(next); redraw(next); };
  const effacerTout = () => { setShapes([]); redraw([]); };
  const [enregistrement, setEnregistrement] = useState(false);
  const enregistrer = async () => {
    const cv = canvasRef.current;
    const dataUrl = cv.toDataURL("image/jpeg", 0.92);
    setEnregistrement(true);
    try {
      const url = await uploadPhotoToStorage(dataUrl, "photos-fiches");
      onSave(url);
    } catch(err) {
      onSave(dataUrl); // hors-ligne : on garde l'annotation en local plutôt que de la perdre
    }
    setEnregistrement(false);
  };

  const toolBtn = (id, label, icon) => (
    <button onClick={() => setTool(id)} style={{ flex: 1, padding: "10px 6px", borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${tool === id ? color : "#1E3A5F"}`, background: tool === id ? color + "22" : "#0B1829", color: tool === id ? color : "#94A3B8" }}>
      {icon} {label}
    </button>
  );
  const COULEURS = ["#EF4444", "#F59E0B", "#10B981", "#0EA5E9", "#FFFFFF"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 900, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#0A1525", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "1px solid #1a3050", color: "#94A3B8", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Annuler</button>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#fff", flex: 1, textAlign: "center" }}>✏️ Annoter la photo</div>
        <button onClick={enregistrer} disabled={!ready||enregistrement} style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: enregistrement?0.7:1 }}>{enregistrement?"⏳ Envoi…":"✓ Enregistrer"}</button>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", padding: 12, touchAction: "none" }}>
        {!ready && <div style={{ color: "#64748B", fontSize: 13 }}>Chargement…</div>}
        <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          style={{ maxWidth: "100%", maxHeight: "100%", touchAction: "none", borderRadius: 8, background: "#000", display: ready ? "block" : "none", cursor: "crosshair" }} />
      </div>
      <div style={{ padding: "10px 12px", background: "#0A1525", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {toolBtn("circle", "Cercle", "⭕")}
          {toolBtn("arrow", "Flèche", "➡️")}
          {toolBtn("texte", "Texte", "🔤")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {COULEURS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "3px solid #fff" : "1px solid #334155", cursor: "pointer" }} />
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={undo} disabled={!shapes.length} style={{ padding: "8px 12px", background: "#070F1C", border: "1px solid #1E3A5F", borderRadius: 8, color: shapes.length ? "#E2E8F0" : "#334155", fontWeight: 700, fontSize: 12, cursor: shapes.length ? "pointer" : "default", fontFamily: "inherit" }}>↩ Annuler</button>
            <button onClick={effacerTout} disabled={!shapes.length} style={{ padding: "8px 12px", background: "#070F1C", border: "1px solid #1E3A5F", borderRadius: 8, color: shapes.length ? "#EF4444" : "#334155", fontWeight: 700, fontSize: 12, cursor: shapes.length ? "pointer" : "default", fontFamily: "inherit" }}>🗑 Tout effacer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   VISIONNEUSE PHOTO — plein écran + zoom
═══════════════════════════════════════════ */
function PhotoViewer({ photos, index, onClose, onIndexChange }) {
  const [zoom, setZoom] = useState(1);
  const photo = photos[index];
  useEffect(() => { setZoom(1); }, [index]);
  if (!photo) return null;
  const go = (d) => { const n = index + d; if (n >= 0 && n < photos.length) onIndexChange(n); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 900, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "1px solid #334155", color: "#94A3B8", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✕ Fermer</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} style={{ width: 34, height: 34, borderRadius: 8, background: "#0B1829", border: "1px solid #334155", color: "#fff", fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>−</button>
          <div style={{ display: "flex", alignItems: "center", color: "#94A3B8", fontSize: 12, fontWeight: 700, minWidth: 40, justifyContent: "center" }}>{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.min(4, z + 0.5))} style={{ width: 34, height: 34, borderRadius: 8, background: "#0B1829", border: "1px solid #334155", color: "#fff", fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>+</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: zoom === 1 ? "center" : "flex-start", justifyContent: zoom === 1 ? "center" : "flex-start" }}>
        <img src={photo.data} alt="" style={{ transform: `scale(${zoom})`, transformOrigin: "top left", maxWidth: zoom === 1 ? "100%" : "none", maxHeight: zoom === 1 ? "100%" : "none", margin: "auto" }} />
      </div>
      {photos.length > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: 12, flexShrink: 0 }}>
          <button onClick={() => go(-1)} disabled={index === 0} style={{ padding: "10px 18px", borderRadius: 8, background: "#0B1829", border: "1px solid #334155", color: index === 0 ? "#334155" : "#fff", fontWeight: 700, cursor: index === 0 ? "default" : "pointer", fontFamily: "inherit" }}>‹ Précédente</button>
          <div style={{ color: "#64748B", fontSize: 12, alignSelf: "center" }}>{index + 1} / {photos.length}</div>
          <button onClick={() => go(1)} disabled={index === photos.length - 1} style={{ padding: "10px 18px", borderRadius: 8, background: "#0B1829", border: "1px solid #334155", color: index === photos.length - 1 ? "#334155" : "#fff", fontWeight: 700, cursor: index === photos.length - 1 ? "default" : "pointer", fontFamily: "inherit" }}>Suivante ›</button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORMULAIRE FICHE — SCROLL UNIQUE
═══════════════════════════════════════════ */
function FicheForm({ initial, onSave, onBack, fiches = [], theme, societes = ["A6T Services"], onAddSociete, techniciens = [], onAddTechnicien, logos = {}, onSaveLogo, onRemoveLogo, clients = [], champsCustom = {}, parametresIA = {analysePhotos:true,maxPhotos:0} }) {
  const co = (meta, cat) => (champsCustom?.[meta.id]?.[cat]?.length ? champsCustom[meta.id][cat] : meta[cat]);
  const T = THEMES[theme] || THEMES.dark;
  const isDark = theme === "dark";

  const [f, setF] = useState(() => ({
    client:"", adresse:"", adresseFacturation:"", contact:"", tel:"", email:"", technicien:"", clientId:null, siteId:null, facturation:"",
    dateRdv:today(), heureRdv:"", diametreCanalisation:"",
    societe:"A6T Services",
    prestations:[], responsabilite:"na", preconisations:[],
    conclusion:"", photos:[], signature:null, signatureTech:null,
    nomSignataire:"", materiels:[], difficulte:"", techniciensSupp:[], signaturesSupp:[],
    tempsInterne:"", majorations:[], tarifHoraire:"", notesInternes:"", numeroOS:"",
    status:"planifie", loc:{...EMPTY_LOC}, urgent:false,
    ...(initial||{}),
  }));

  const DRAFT_KEY = "interventionpro_brouillon_fiche";
  const [brouillon, setBrouillon] = useState(null);
  const brouillonIgnoreRef = useRef(false);
  useEffect(()=>{
    try{
      const raw = localStorage.getItem(DRAFT_KEY);
      if(raw){
        const d = JSON.parse(raw);
        if((d.id||null) === (initial?.id||null)) setBrouillon(d);
      }
    }catch(e){}
  },[]);
  useEffect(()=>{
    if(brouillonIgnoreRef.current) return;
    const t = setTimeout(()=>{
      try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: initial?.id||null, data: f, savedAt: new Date().toISOString() })); }catch(e){}
    }, 1200);
    return ()=>clearTimeout(t);
  },[f]);
  const restaurerBrouillon = () => { setF(brouillon.data); setBrouillon(null); };
  const ignorerBrouillon = () => { setBrouillon(null); try{ localStorage.removeItem(DRAFT_KEY); }catch(e){} };

  const [showSig, setShowSig] = useState(false);
  const [showSigTech, setShowSigTech] = useState(false);
  const [signingSuppNom, setSigningSuppNom] = useState(null);
  const [showTemps, setShowTemps] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [groupeOuvert, setGroupeOuvert] = useState(()=>{
    // Si la fiche a déjà des prestations cochées (édition), on ouvre directement le bon
    // groupe au lieu de forcer un clic pour le retrouver.
    const dejaActif = (initial?.prestations||[]).map(p=>p.id);
    const presta = PRESTATIONS.find(p=>dejaActif.includes(p.id));
    return presta?.groupe || null;
  });
  const [precoOpen, setPrecoOpen] = useState(false);
  const [interneOpen, setInterneOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [annotatingIndex, setAnnotatingIndex] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(null);
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
  /* Collage d'un message entier dans l'adresse : proposer de le trier. */
  const collerAdresse = async (e) => {
    const t = e.clipboardData?.getData("text") || "";
    if (t.trim().length < 80) return;                    // collage court : comportement normal
    e.preventDefault();
    const brut = t.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    const ok = await dlgConfirm("Ce texte contient visiblement plus qu'une adresse. Je peux en extraire l'adresse et le téléphone, et mettre le reste dans les notes. Annuler collera le texte tel quel.",{titre:"Texte collé",valider:"Trier"});
    if (!ok) { set("adresse", brut); return; }
    try {
      const j = await decouperCollage(brut);
      set("adresse", j.adresse || brut);
      if (j.tel) setF(p=>({...p, tel: p.tel || j.tel}));
      if (j.note) setF(p=>({...p, notesInternes: [p.notesInternes, j.note].filter(Boolean).join(" — ")}));
    } catch (err) {
      set("adresse", brut);
      dlgInfo("Le tri automatique n'a pas fonctionné ("+(err?.message||err)+"). Le texte a été collé tel quel.","Tri impossible");
    }
  };
  const toggleArr = (k,v) => setF(p=>({...p,[k]:p[k].includes(v)?p[k].filter(x=>x!==v):[...p[k],v]}));

  // Autocomplétion clients
  /* Un syndic a plusieurs immeubles : on retient toutes les adresses vues pour un même
     client, la plus récente en tête, au lieu d'écraser la précédente. */
  const clientsConnus = useMemo(()=>{
    const map={};
    fiches.forEach(f=>{
      if(!f.client)return;
      const k=f.client.toLowerCase();
      if(!map[k])map[k]={client:f.client,tel:"",email:"",adresses:[]};
      const e=map[k];
      e.tel=e.tel||f.tel||""; e.email=e.email||f.email||"";
      if(f.adresse&&!e.adresses.some(a=>a.toLowerCase()===f.adresse.toLowerCase()))e.adresses.push(f.adresse);
    });
    return Object.values(map).map(c=>({...c,adresse:c.adresses[0]||""}));
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

  /* Les adresses du client saisi passent devant, et s'affichent même champ vide :
     c'est ce qui permet de choisir le bon immeuble d'un syndic. */
  const adressesDuClient = useMemo(()=>{
    const c=clientsConnus.find(x=>x.client.toLowerCase()===(f.client||"").trim().toLowerCase());
    return c?c.adresses:[];
  },[f.client,clientsConnus]);

  const adresseSuggestions = useMemo(()=>{
    const saisie=(f.adresse||"").trim().toLowerCase();
    const filtre=a=>!saisie||a.toLowerCase().includes(saisie);
    const propres=adressesDuClient.filter(filtre);
    if(!saisie)return propres.slice(0,6);
    if(saisie.length<3)return propres.slice(0,6);
    const autres=adressesConnues.filter(a=>filtre(a)&&!propres.some(x=>x.toLowerCase()===a.toLowerCase()));
    return [...propres,...autres].slice(0,6);
  },[f.adresse,adressesConnues,adressesDuClient]);

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
    return{...p,prestations:[...p.prestations,{id,localisations:[],problemes:[],causes:[],constatCamera:[],methodes:[],actions:[],resultats:[],note:"",...(PRESTA_DIAMETRE.includes(id)?{diametre:"100"}:{})}]};
  });
  const updatePresta = (id,key,val) => setF(p=>({...p,prestations:p.prestations.map(x=>x.id===id?{...x,[key]:val}:x)}));
  const togglePrestaItem = (id,key,val) => setF(p=>({...p,prestations:p.prestations.map(x=>{
    if(x.id!==id)return x;
    const arr=x[key]||[]; return{...x,[key]:arr.includes(val)?arr.filter(y=>y!==val):[...arr,val]};
  })}));

  const addPhotos = async files => {
    const all = [...files];
    const videos = all.filter(x=>x.type.startsWith("video/"));
    if(videos.length) dlgInfo("Les vidéos ne sont pas encore prises en charge (limite de stockage). Seules les photos ont été ajoutées.");
    const imgs = await Promise.all(all.filter(x=>x.type.startsWith("image/")).map(resizePhoto));
    setF(p=>({...p,photos:[...p.photos,...imgs]}));
    if(imgs.length) logActivite("photo_ajoutee", f.technicien||null, `${imgs.length} photo(s) — ${f.client||f.id||"fiche"}`);
  };

  const handleGenererConclusion = async () => {
    if(f.prestations.length===0)return;
    setGeneratingConclusion(true);
    try {
      const locStr = formatLoc(f.loc);
      const photosPourIA = parametresIA.analysePhotos
        ? (parametresIA.maxPhotos>0 ? (f.photos||[]).slice(0,parametresIA.maxPhotos) : (f.photos||[]))
        : [];
      const text = await generateConclusionIA(f.prestations, locStr, f.responsabilite, f.preconisations, photosPourIA);
      set("conclusion", text);
    } catch(e) { dlgInfo("Erreur lors de la génération : " + (e?.message || e)); }
    finally { setGeneratingConclusion(false); }
  };

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const ouvrirChatIA = async () => {
    setChatOpen(true);
    if(chatMessages.length) return; // déjà initialisé, on continue la conversation en cours
    const locStr = formatLoc(f.loc);
    const contexte = f.prestations.map(p=>{
      const meta = PRESTATIONS.find(x=>x.id===p.id);
      const bouts = [p.problemes?.join(", "),p.causes?.join(", "),p.actions?.join(", "),p.resultats?.join(", ")].filter(Boolean).join(" / ");
      return `${meta?.label}${bouts?` : ${bouts}`:""}`;
    }).join("\n");
    const premierMessage = `Voici le contexte de cette intervention de plomberie/assainissement, pour m'aider à rédiger ou améliorer la conclusion de son rapport :
${locStr?`Lieu : ${locStr}\n`:""}${contexte}
Conclusion actuelle du rapport : "${f.conclusion||"(vide, à rédiger)"}"

Je vais te donner des instructions pour ajuster ce texte (le raccourcir, changer le ton, ajouter un détail…). À chaque fois que je te demande une modification du texte, réponds UNIQUEMENT avec le nouveau texte de la conclusion, sans commentaire ni guillemets autour — sauf si je te pose une question directe, auquel cas réponds normalement en une phrase ou deux. Confirme d'abord que tu as bien comrpis en une courte phrase, sans répéter tout le contexte.`;
    setChatLoading(true);
    try {
      const r = await fetch("/api/claude", {method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:800,messages:[{role:"user",content:premierMessage}]})});
      const d = await r.json();
      if(!r.ok) throw new Error(d?.error?.message||d?.error||"Erreur API");
      const reponse = d.content?.[0]?.text || "Prêt, dis-moi ce que tu veux ajuster.";
      setChatMessages([{role:"user",content:premierMessage,hidden:true},{role:"assistant",content:reponse}]);
    } catch(e) {
      setChatMessages([{role:"assistant",content:"❌ Erreur de connexion : "+(e?.message||e)}]);
    }
    setChatLoading(false);
  };

  const envoyerMessageChat = async () => {
    if(!chatInput.trim()||chatLoading) return;
    const nouveaux = [...chatMessages, {role:"user",content:chatInput.trim()}];
    setChatMessages(nouveaux);
    setChatInput("");
    setChatLoading(true);
    try {
      const r = await fetch("/api/claude", {method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:800,messages:nouveaux.map(m=>({role:m.role,content:m.content}))})});
      const d = await r.json();
      if(!r.ok) throw new Error(d?.error?.message||d?.error||"Erreur API");
      const reponse = d.content?.[0]?.text || "…";
      setChatMessages([...nouveaux, {role:"assistant",content:reponse}]);
    } catch(e) {
      setChatMessages([...nouveaux, {role:"assistant",content:"❌ Erreur de connexion : "+(e?.message||e)}]);
    }
    setChatLoading(false);
  };

  const handleGenererNote = async (prestaId) => {
    const presta = f.prestations.find(p=>p.id===prestaId);
    if(!presta)return;
    setGeneratingNote(prestaId);
    try {
      const locStr = formatLoc(f.loc);
      const text = await generateNotePrestation(presta, locStr);
      updatePresta(prestaId, "note", text);
    } catch(e) { dlgInfo("Erreur lors de la génération : " + (e?.message || e)); }
    finally { setGeneratingNote(null); }
  };

  const [errors, setErrors] = useState({});
  const handleSave = () => {
    const errs = {};
    if(!f.client?.trim()) errs.client = true;
    if(!f.adresse?.trim()) errs.adresse = true;
    if(Object.keys(errs).length){
      setErrors(errs);
      dlgInfo("⚠️ Le nom du client et l'adresse sont obligatoires pour enregistrer la fiche.");
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
      brouillonIgnoreRef.current = true;
      try{ localStorage.removeItem(DRAFT_KEY); }catch(e){}
    } catch(e) {
      dlgInfo("Erreur lors de l'enregistrement : " + (e?.message||e));
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
      {signingSuppNom && <SignatureCanvas title={`Signature — ${signingSuppNom}`} onSave={d=>{
        const autres=(f.signaturesSupp||[]).filter(s=>s.nom!==signingSuppNom);
        set("signaturesSupp",[...autres,{nom:signingSuppNom,data:d}]);
        setSigningSuppNom(null);
      }} onCancel={()=>setSigningSuppNom(null)}/>}
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

      {brouillon && (
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"rgba(245,158,11,0.1)",border:"1.5px solid #F59E0B",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
          <div style={{fontSize:18}}>💾</div>
          <div style={{flex:1,minWidth:200,fontSize:12.5,color:T.text}}>Un brouillon non enregistré a été retrouvé ({new Date(brouillon.savedAt).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}). Le restaurer ?</div>
          <button onClick={ignorerBrouillon} style={{padding:"7px 12px",background:"none",border:`1px solid ${T.border}`,borderRadius:7,color:T.textMuted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Ignorer</button>
          <button onClick={restaurerBrouillon} style={{padding:"7px 14px",background:"#F59E0B",border:"none",borderRadius:7,color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Restaurer</button>
        </div>
      )}

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
                  <div key={i} onMouseDown={()=>{setF(p=>({...p,client:c.client,tel:c.tel||p.tel,email:c.email||p.email,adresse:p.adresse||(c.adresses.length===1?c.adresses[0]:"")}));setAcOpen(false);if(c.adresses.length>1)setTimeout(()=>setAcAdresseOpen(true),80);}}
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
            <textarea value={f.adresse} onChange={e=>{set("adresse",e.target.value.replace(/\n/g," "));setAcAdresseOpen(true);if(errors.adresse)setErrors(p=>({...p,adresse:false}));}} onFocus={()=>setAcAdresseOpen(true)} onPaste={collerAdresse}
              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.target.blur();}}} rows={2}
              placeholder="Adresse complète (obligatoire)" style={{...inpStyle(),resize:"none",minHeight:62,lineHeight:1.4,fontFamily:"inherit",...(errors.adresse?{border:"1.5px solid #EF4444",background:"rgba(239,68,68,0.06)"}:{})}} autoComplete="off"/>
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

          <div style={{gridColumn:"1/-1"}}>
            <div style={lblStyle}>🧾 Adresse de facturation <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(optionnel)</span></div>
            <input value={f.adresseFacturation} onChange={e=>set("adresseFacturation",e.target.value)} placeholder="Laisser vide si identique à l'adresse d'intervention" style={inpStyle()}/>
            <div style={{fontSize:11,color:T.textMuted,marginTop:5,fontWeight:500}}>Utile pour les syndics : l'intervention a lieu dans l'immeuble, mais la facture part au siège du syndic. Utilisée en priorité pour Pennylane si renseignée.</div>
          </div>

          <div><div style={lblStyle}>Téléphone</div><input value={f.tel} onChange={e=>set("tel",e.target.value)} placeholder="06 00 00 00 00" style={inpStyle()}/></div>
          <div><div style={lblStyle}>Email</div><input value={f.email} onChange={e=>set("email",e.target.value)} placeholder="email@exemple.fr" style={inpStyle()}/></div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={lblStyle}>📋 N° d'ordre de service</div>
            <input value={f.numeroOS} onChange={e=>set("numeroOS",e.target.value)} placeholder="Ex : OS-2026-1234" style={inpStyle()}/>
            <div style={{fontSize:11,color:T.textMuted,marginTop:5,fontWeight:500}}>Référence de la demande client, pour la retrouver facilement à la facturation.</div>
          </div>
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

        <div style={{marginTop:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {(f.techniciensSupp||[]).map((nom,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:20,padding:"5px 6px 5px 12px",fontSize:12.5,fontWeight:700,color:T.text}}>
                👤 {nom}
                <button onClick={()=>{
                  set("techniciensSupp",(f.techniciensSupp||[]).filter((_,j)=>j!==i));
                  set("signaturesSupp",(f.signaturesSupp||[]).filter(s=>s.nom!==nom));
                }} style={{width:18,height:18,borderRadius:"50%",border:"none",background:"rgba(239,68,68,0.15)",color:"#EF4444",cursor:"pointer",fontSize:11,fontFamily:"inherit",lineHeight:1}}>✕</button>
              </div>
            ))}
            <button onClick={()=>{
              const nom=prompt("Nom du co-intervenant (deuxième technicien sur cette intervention) :");
              if(nom?.trim() && nom.trim()!==f.technicien && !(f.techniciensSupp||[]).includes(nom.trim())){
                set("techniciensSupp",[...(f.techniciensSupp||[]),nom.trim()]);
              }
            }} style={{padding:"6px 14px",borderRadius:20,border:`1.5px dashed ${T.border}`,background:"none",color:T.textMuted,cursor:"pointer",fontSize:12.5,fontWeight:700,fontFamily:"inherit"}}>➕ Ajouter un co-intervenant</button>
          </div>
          {(f.techniciensSupp||[]).length>0 && <div style={{fontSize:11,color:T.textMuted,marginTop:6}}>💡 Chaque co-intervenant pourra signer séparément plus bas, et apparaîtra dans le rapport PDF.</div>}
        </div>
        {/* Localisation précise (repliable) */}
        <div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:12}}>
          <div onClick={()=>setLocOpen(!locOpen)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:800,fontSize:13,color:T.text}}>
            📍 Localisation précise
            {formatLoc(f.loc)&&<span style={{fontSize:11,fontWeight:700,color:"#38BDF8",background:"rgba(14,165,233,0.13)",padding:"2px 9px",borderRadius:12,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{formatLoc(f.loc)}</span>}
            <span style={{marginLeft:"auto",fontSize:12,color:"#38BDF8",fontWeight:700}}>{locOpen?"Réduire ▲":"Ouvrir ▼"}</span>
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
          {(()=>{
            const ordreGroupes = ["Assainissement","Plomberie"];
            const iconesGroupes = {Assainissement:"🚛",Plomberie:"🪛"};
            const parGroupe = {};
            PRESTATIONS.forEach(p=>{ (parGroupe[p.groupe||"Autre"] = parGroupe[p.groupe||"Autre"]||[]).push(p); });
            const groupesAffiches = [...ordreGroupes, ...Object.keys(parGroupe).filter(g=>!ordreGroupes.includes(g))];
            return groupesAffiches.filter(g=>parGroupe[g]?.length).map(groupe=>{
              const items = parGroupe[groupe];
              const nbActifs = items.filter(p=>hasPresta(p.id)).length;
              const ouvert = groupeOuvert===groupe;
              return (
                <div key={groupe}>
                  <div onClick={()=>setGroupeOuvert(ouvert?null:groupe)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderRadius:10,cursor:"pointer",background:ouvert?T.surface2:T.surface,border:`1.5px solid ${nbActifs>0?"#0EA5E9":T.border}`,marginBottom:ouvert?8:0}}>
                    <span style={{fontSize:20}}>{iconesGroupes[groupe]||"🔧"}</span>
                    <span style={{flex:1,fontWeight:800,fontSize:14,color:T.text}}>{groupe}</span>
                    {nbActifs>0&&<span style={{fontSize:11,fontWeight:800,color:"#0EA5E9",background:"rgba(14,165,233,0.14)",padding:"2px 9px",borderRadius:12}}>{nbActifs} sélectionnée{nbActifs>1?"s":""}</span>}
                    <span style={{color:T.textMuted,fontSize:13,transition:"transform .15s",transform:ouvert?"rotate(90deg)":"none"}}>▶</span>
                  </div>
                  {ouvert && (
                    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8,paddingLeft:8,borderLeft:`2px solid ${T.border}`}}>
                      {items.map(presta=>{
            const active = hasPresta(presta.id);
            const data = f.prestations.find(p=>p.id===presta.id);
            const isOpen = expanded===presta.id;
            const count = data ? (data.localisations?.length||0)+(data.problemes?.length||0)+(data.causes?.length||0)+(data.constatCamera?.length||0)+(data.methodes?.length||0)+(data.actions?.length||0)+(data.resultats?.length||0) : 0;

            return (
              <React.Fragment key={presta.id}>
              <div style={{border:`1.5px solid ${active?presta.color:T.border}`,borderRadius:10,overflow:"hidden",background:active?presta.color+"0D":T.surface2,transition:"all .2s",cursor:"pointer"}}
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
                      ...(presta.causes?[{key:"causes",icon:"🔍",label:presta.groupe==="Assainissement"?"Cause du bouchon":"Cause identifiée",opts:co(presta,"causes")}]:[]),
                      ...(presta.constatCamera?[{key:"constatCamera",icon:"📹",label:"Constat caméra",opts:co(presta,"constatCamera")}]:[]),
                      ...(presta.methodes?[{key:"methodes",icon:"🔬",label:"Méthode de détection",opts:co(presta,"methodes")}]:[]),
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
              </React.Fragment>
            );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
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
          <span style={{marginLeft:"auto",fontSize:12,color:"#A78BFA",fontWeight:700}}>{precoOpen?"Réduire ▲":"Ouvrir ▼"}</span>
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
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8}}>
          <button onClick={ouvrirChatIA} disabled={f.prestations.length===0}
            style={{fontSize:12,fontWeight:700,color:"#0EA5E9",background:"rgba(14,165,233,0.1)",border:"1px solid rgba(14,165,233,0.3)",borderRadius:8,padding:"7px 14px",cursor:f.prestations.length===0?"not-allowed":"pointer",fontFamily:"inherit",opacity:f.prestations.length===0?0.5:1}}>
            💬 Discuter avec l'IA
          </button>
          <button onClick={handleGenererConclusion} disabled={generatingConclusion||f.prestations.length===0}
            style={{fontSize:12,fontWeight:800,color:f.prestations.length===0?"#A78BFA":"#fff",background:f.prestations.length===0?"rgba(167,139,250,0.1)":"linear-gradient(135deg,#8B5CF6,#6366F1)",border:f.prestations.length===0?"1px solid rgba(167,139,250,0.3)":"none",borderRadius:8,padding:"7px 14px",cursor:f.prestations.length===0?"not-allowed":"pointer",fontFamily:"inherit",opacity:f.prestations.length===0?0.5:1}}>
            {generatingConclusion?"⏳ Génération en cours…":"✨ Générer la conclusion"}
          </button>
        </div>
        <textarea value={f.conclusion} onChange={e=>set("conclusion",e.target.value)} rows={5}
          placeholder="Rédigez ou cliquez ✨ pour générer automatiquement une conclusion professionnelle…"
          style={{width:"100%",padding:"12px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,resize:"vertical",lineHeight:1.7,outline:"none",fontFamily:"inherit"}}/>
        {f.conclusion&&<div style={{fontSize:11,color:T.textMuted,marginTop:4}}>💡 Vous pouvez modifier le texte librement.</div>}
      </div>

      {chatOpen && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:900,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setChatOpen(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:560,height:"78vh",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontWeight:800,fontSize:15,color:T.text}}>💬 Discuter du rapport avec l'IA</div>
              <button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>
              {chatMessages.filter(m=>!m.hidden).map((m,i)=>(
                <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"85%"}}>
                  <div style={{padding:"10px 14px",borderRadius:12,fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap",
                    background:m.role==="user"?"linear-gradient(135deg,#0EA5E9,#6366F1)":T.surface2,
                    color:m.role==="user"?"#fff":T.text}}>
                    {m.content}
                  </div>
                  {m.role==="assistant"&&(
                    <button onClick={()=>{set("conclusion",m.content);setChatOpen(false);}}
                      style={{marginTop:4,fontSize:11,fontWeight:700,color:"#10B981",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                      ✅ Utiliser comme conclusion
                    </button>
                  )}
                </div>
              ))}
              {chatLoading&&<div style={{alignSelf:"flex-start",fontSize:12,color:T.textMuted}}>⏳ L'IA réfléchit…</div>}
            </div>
            <div style={{display:"flex",gap:8,padding:"12px 16px",borderTop:`1px solid ${T.border}`}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!chatLoading)envoyerMessageChat();}}
                placeholder="Ex : raccourcis-le, ajoute que le syndic était présent…"
                style={{flex:1,padding:"11px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:20,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={envoyerMessageChat} disabled={chatLoading||!chatInput.trim()}
                style={{width:42,height:42,borderRadius:"50%",border:"none",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",fontSize:16,cursor:chatLoading?"default":"pointer",fontFamily:"inherit",opacity:chatLoading||!chatInput.trim()?0.5:1,flexShrink:0}}>➤</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PHOTOS ── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>📷 Photos</div>
        <div onClick={()=>fileRef.current?.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);addPhotos(e.dataTransfer.files);}}
          style={{border:`2px dashed ${dragOver?"#0EA5E9":T.border}`,borderRadius:10,padding:18,textAlign:"center",cursor:"pointer",marginBottom:f.photos.length?10:0}}>
          <div style={{fontSize:26,marginBottom:4}}>📸</div>
          <div style={{fontSize:13,fontWeight:600,color:T.textMuted}}>Prendre une photo ou choisir dans la galerie</div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addPhotos(e.target.files)}/>
        </div>
        {f.photos.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
            {f.photos.map((p,i)=>(
              <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",aspectRatio:"4/3",background:T.surface2}}>
                <img src={p.data} onClick={()=>setViewingIndex(i)} style={{width:"100%",height:"100%",objectFit:"cover",cursor:"zoom-in"}} alt=""/>
                <button onClick={()=>setAnnotatingIndex(i)} title="Annoter (cercle, flèche, texte)"
                  style={{position:"absolute",top:4,right:28,background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>✏️</button>
                <button onClick={()=>set("photos",f.photos.filter((_,j)=>j!==i))} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.75)",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>×</button>
                <button onClick={()=>{const np=[...f.photos];np[i]={...np[i],tag:np[i].tag==="avant"?"pendant":np[i].tag==="pendant"?"apres":np[i].tag==="apres"?null:"avant"};set("photos",np);}}
                  title="Cliquez pour marquer Avant / Pendant / Après"
                  style={{position:"absolute",top:4,left:4,background:p.tag==="avant"?"#F59E0B":p.tag==="pendant"?"#0EA5E9":p.tag==="apres"?"#10B981":"rgba(0,0,0,0.6)",color:"#fff",border:"none",borderRadius:6,padding:"2px 7px",fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:0.3}}>
                  {p.tag==="avant"?"AVANT":p.tag==="pendant"?"PENDANT":p.tag==="apres"?"APRÈS":"Tag"}
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

      {annotatingIndex!==null && f.photos[annotatingIndex] && (
        <PhotoAnnotator photo={f.photos[annotatingIndex]} theme={theme}
          onClose={()=>setAnnotatingIndex(null)}
          onSave={(dataUrl)=>{
            const np=[...f.photos];
            const orig = np[annotatingIndex].dataOriginal || np[annotatingIndex].data;
            np[annotatingIndex] = {...np[annotatingIndex], data:dataUrl, dataOriginal:orig};
            set("photos",np);
            setAnnotatingIndex(null);
          }}/>
      )}
      {viewingIndex!==null && (
        <PhotoViewer photos={f.photos} index={viewingIndex} onClose={()=>setViewingIndex(null)} onIndexChange={setViewingIndex}/>
      )}

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
          {(f.techniciensSupp||[]).map(nom=>{
            const sig=(f.signaturesSupp||[]).find(s=>s.nom===nom);
            return (
              <div key={nom}>
                <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>{nom} <span style={{textTransform:"none",fontWeight:500}}>(co-intervenant)</span></div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {sig
                    ?<div style={{background:"#fff",borderRadius:8,padding:8,border:"1px solid #e2e8f0"}}><img src={sig.data} style={{height:56,display:"block",maxWidth:"100%"}} alt={`sig-${nom}`}/></div>
                    :<div onClick={()=>setSigningSuppNom(nom)} style={{border:`2px dashed ${T.border}`,borderRadius:8,padding:"14px",color:T.textMuted,fontSize:12,textAlign:"center",cursor:"pointer"}}>✍️ Touchez ici pour signer</div>}
                  <button onClick={()=>setSigningSuppNom(nom)} style={{padding:"8px",background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✍️ {sig?"Modifier":"Signer"}</button>
                  {sig&&<button onClick={()=>set("signaturesSupp",(f.signaturesSupp||[]).filter(s=>s.nom!==nom))} style={{padding:"7px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:"#EF4444",fontWeight:700,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Effacer</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── INTERNE (repliable) ── */}
      <div style={{...sectionStyle,background:isDark?"rgba(249,115,22,0.06)":theme==="light"?"#FFF7ED":"#FDF2E9",border:`1px dashed rgba(249,115,22,0.4)`,cursor:interneOpen?"default":"pointer"}} onClick={()=>!interneOpen&&setInterneOpen(true)}>
        <div style={{...sectionTitleStyle,color:"#F97316",cursor:"pointer",borderBottom:interneOpen?"1px solid rgba(249,115,22,0.2)":"none",paddingBottom:interneOpen?10:0,marginBottom:interneOpen?14:0}} onClick={e=>{e.stopPropagation();setInterneOpen(!interneOpen);}}>
          🔒 Usage interne
          {Boolean(f.materiels.length>0||f.difficulte||f.tarifHoraire||f.notesInternes||f.tempsInterne||f.majorations?.length)&&<span style={{fontSize:11,fontWeight:700,color:"#F97316",background:"rgba(249,115,22,0.15)",padding:"2px 9px",borderRadius:12}}>renseigné</span>}
          <span style={{marginLeft:"auto",fontSize:12,color:"#F97316",fontWeight:700}}>{interneOpen?"Réduire ▲":"Ouvrir ▼"}</span>
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
function AdminView({ societes, techniciens, techTels, techColors={}, logos, champs, sousTraitants=[], onSaveSousTraitants, onSaveSocietes, onSaveTechniciens, onSaveTechTel, onSaveTechColor, onSaveLogo, onRemoveLogo, onSaveChamps, onGoChamps, onOpenExport, userRoles=[], onSaveUserRole, onDeleteUserRole, theme, activiteLog=[], fiches=[], parametresIA={analysePhotos:true,maxPhotos:0}, onSaveParametresIA, parametresMessages={modeles:MODELES_MESSAGE_DEFAUT}, onSaveParametresMessages, absences=[], onSaveAbsence, onDeleteAbsence }) {
  const T = THEMES[theme] || THEMES.dark;
  const logoRef = useRef();
  const [logoTarget, setLogoTarget] = useState(null);
  const [statsOuvertes, setStatsOuvertes] = useState(null); // nom du technicien dont on affiche les stats
  const card = {background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14};
  const head = {fontWeight:800,fontSize:14,color:T.text,marginBottom:10,display:"flex",alignItems:"center",gap:8};
  const btn = {border:`1px solid ${T.border}`,background:T.surface2,color:T.textMuted,borderRadius:6,width:28,height:28,cursor:"pointer",fontFamily:"inherit",fontSize:12};
  const addBtn = {border:"1px solid rgba(16,185,129,0.4)",background:T.surface2,color:"#10B981",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700};
  const row = (last)=>({display:"flex",alignItems:"center",gap:8,padding:"8px 4px",borderBottom:last?"none":`1px solid ${T.border}`});
  const [nouvelEmail, setNouvelEmail] = useState("");
  const [nouveauRoleTech, setNouveauRoleTech] = useState("");
  const [nouveauEstSousTraitant, setNouveauEstSousTraitant] = useState(false);

  /* Listes simples éditables via champs/_global */
  const simpleList = (key, def) => (champs?._global?.[key]?.length ? champs._global[key] : def);
  const writeList = (key, l) => onSaveChamps("_global", key, l);
  const SimpleEditor = ({title, icon, k, def, addLabel}) => {
    const liste = simpleList(k, def);
    return (
      <Repliable T={T} icone={icon} titre={title}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
          <button onClick={async ()=>{const v=await dlgPrompt(addLabel||"Nouvel élément",""  ,{titre:title,valider:"Ajouter"});if(v&&v.trim())writeList(k,[...liste,v.trim()]);}} style={addBtn}>➕ Ajouter</button>
        </div>
        {liste.map((item,i)=>(
          <div key={i} style={row(i===liste.length-1)}>
            <span style={{flex:1,fontSize:13,color:T.text}}>{item}</span>
            <button onClick={()=>{if(i>0){const l=[...liste];[l[i-1],l[i]]=[l[i],l[i-1]];writeList(k,l);}}} disabled={i===0} style={{...btn,opacity:i===0?.3:1}}>↑</button>
            <button onClick={()=>{if(i<liste.length-1){const l=[...liste];[l[i+1],l[i]]=[l[i],l[i+1]];writeList(k,l);}}} disabled={i===liste.length-1} style={{...btn,opacity:i===liste.length-1?.3:1}}>↓</button>
            <button onClick={async ()=>{const v=await dlgPrompt("Nouveau libellé",item,{titre:"Renommer",valider:"Enregistrer"});if(v&&v.trim()){const l=[...liste];l[i]=v.trim();writeList(k,l);}}} style={btn}>✏️</button>
            <button onClick={async ()=>{if(await dlgConfirm(`« ${item} » sera retiré de la liste.`,{titre:"Supprimer",danger:true})){const l=[...liste];l.splice(i,1);writeList(k,l);}}} style={{...btn,color:"#EF4444"}}>✕</button>
          </div>
        ))}
      </Repliable>
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

      {/* Journal d'activité — connexions, ajouts de photo... */}
      {onSaveAbsence&&<Repliable T={T} icone="🌴" titre="Absences des techniciens" badge={absences.length||null}>
        <AbsencesAdmin T={T} theme={theme} techniciens={techniciens} fiches={fiches} absences={absences} onSaveAbsence={onSaveAbsence} onDeleteAbsence={onDeleteAbsence}/>
      </Repliable>}
      <Repliable T={T} icone="🤖" titre="Intelligence artificielle" defaultOpen={false}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.border}`,marginBottom:12}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:T.text}}>📷 Analyser les photos dans la conclusion</div>
            <div style={{fontSize:11.5,color:T.textMuted,marginTop:2,maxWidth:400}}>Quand activé, l'IA regarde les photos jointes à la fiche pour enrichir la conclusion rédigée. Plus lent si beaucoup de photos.</div>
          </div>
          <button onClick={()=>onSaveParametresIA({...parametresIA,analysePhotos:!parametresIA.analysePhotos})}
            style={{width:44,height:26,borderRadius:13,border:"none",cursor:"pointer",flexShrink:0,background:parametresIA.analysePhotos?"#0EA5E9":T.surface2,position:"relative",transition:"background .15s"}}>
            <span style={{position:"absolute",top:3,left:parametresIA.analysePhotos?21:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
          </button>
        </div>
        {parametresIA.analysePhotos && (
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:T.text}}>Nombre maximum de photos analysées</div>
              <div style={{fontSize:11.5,color:T.textMuted,marginTop:2}}>Laisser à 0 pour envoyer toutes les photos, peu importe leur nombre.</div>
            </div>
            <input type="number" min="0" value={parametresIA.maxPhotos||0} onChange={e=>onSaveParametresIA({...parametresIA,maxPhotos:parseInt(e.target.value)||0})}
              style={{width:70,padding:"8px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,textAlign:"center",outline:"none",fontFamily:"inherit"}}/>
          </div>
        )}
      </Repliable>

      <Repliable T={T} icone="✉️" titre="Modèles de message (WhatsApp/SMS)" defaultOpen={false}>
        <div style={{fontSize:11.5,color:T.textMuted,marginBottom:14,lineHeight:1.5}}>Ces 3 modèles sont proposés au choix quand vous envoyez un rapport au client. Utilisez ces variables, remplacées automatiquement : <code>{"{client} {adresse} {localisation} {date} {heure} {technicien} {id} {conclusion} {prestations}"}</code></div>
        {parametresMessages.modeles.map((m,i)=>(
          <div key={i} style={{marginBottom:14,paddingBottom:14,borderBottom:i<parametresMessages.modeles.length-1?`1px solid ${T.border}`:"none"}}>
            <input value={m.nom} onChange={e=>{
              const modeles=[...parametresMessages.modeles]; modeles[i]={...modeles[i],nom:e.target.value};
              onSaveParametresMessages({...parametresMessages,modeles});
            }} placeholder="Nom du modèle" style={{width:"100%",padding:"7px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12.5,fontWeight:700,outline:"none",fontFamily:"inherit",marginBottom:6}}/>
            <textarea value={m.texte} onChange={e=>{
              const modeles=[...parametresMessages.modeles]; modeles[i]={...modeles[i],texte:e.target.value};
              onSaveParametresMessages({...parametresMessages,modeles});
            }} rows={4} style={{width:"100%",padding:"9px 11px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12.5,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.5}}/>
          </div>
        ))}
      </Repliable>

      <Repliable T={T} icone="🕵️" titre="Journal d'activité">
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:12,lineHeight:1.6}}>
          Qui a ouvert l'application, quand, et quelques actions clés (ajout de photo…). Sert aussi de "vu" implicite pour les alertes : si la dernière connexion d'une personne est après l'heure d'une alerte, elle a au moins rouvert l'app depuis.
        </div>
        {(()=>{
          const dernieresConnexions = {};
          activiteLog.filter(a=>a.type==="connexion").forEach(a=>{ if(!dernieresConnexions[a.detail]||a.ts>dernieresConnexions[a.detail]) dernieresConnexions[a.detail]=a.ts; });
          const noms = Object.keys(dernieresConnexions);
          return noms.length>0 && (
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {noms.map(email=>{
                const ilYA = Date.now()-dernieresConnexions[email];
                const recent = ilYA < 3*3600*1000; // vu il y a moins de 3h
                return (
                  <span key={email} title={new Date(dernieresConnexions[email]).toLocaleString("fr-FR")}
                    style={{fontSize:11,fontWeight:700,padding:"5px 11px",borderRadius:20,background:recent?"rgba(16,185,129,0.14)":T.surface2,color:recent?"#10B981":T.textMuted,border:`1px solid ${recent?"#10B98155":T.border}`}}>
                    {recent?"🟢":"⚪"} {email} — {ilYA<3600000?`${Math.round(ilYA/60000)} min`:ilYA<86400000?`${Math.round(ilYA/3600000)} h`:`${Math.round(ilYA/86400000)} j`}
                  </span>
                );
              })}
            </div>
          );
        })()}
        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:280,overflowY:"auto"}}>
          {activiteLog.length===0 && <div style={{fontSize:12,color:T.textFaint,padding:"6px 4px"}}>Aucune activité enregistrée pour l'instant.</div>}
          {activiteLog.slice(0,80).map((a,i)=>{
            const meta = {
              connexion:{icon:"🔓",label:"Connexion",color:"#0EA5E9"},
              photo_ajoutee:{icon:"📸",label:"Photo ajoutée",color:"#A78BFA"},
              notification_envoyee:{icon:a.detail?.includes("ERREUR")?"🔴":a.detail?.includes("Non envoyé")?"🟡":"🔔",label:"Notification",color:a.detail?.includes("ERREUR")?"#EF4444":a.detail?.includes("Non envoyé")?"#F59E0B":"#10B981"},
              erreur_app:{icon:"🐞",label:"Erreur technique",color:"#EF4444"},
            }[a.type]||{icon:"•",label:a.type,color:T.textMuted};
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,padding:"5px 8px",background:T.surface2,borderRadius:7}}>
                <span>{meta.icon}</span>
                <span style={{fontWeight:700,color:meta.color,flexShrink:0}}>{meta.label}</span>
                <span style={{color:T.textMuted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.technicien||a.detail||""}</span>
                <span style={{color:T.textFaint,fontSize:10.5,flexShrink:0}}>{new Date(a.ts).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
              </div>
            );
          })}
        </div>
      </Repliable>

      {/* Bilan hebdomadaire */}
      <Repliable T={T} icone="📋" titre="Bilan hebdomadaire">
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:12,lineHeight:1.6}}>
          Une notification automatique chaque dimanche en fin d'après-midi, récapitulant en un coup d'œil : les interventions non clôturées, les devis en attente de réponse client, et les rapports terminés jamais envoyés. Envoyée à toute l'équipe (hors sous-traitants).
        </div>
        <button onClick={async()=>{
          try{
            const r = await fetch("/api/weekly-digest",{method:"POST"});
            const d = await r.json();
            if(d.ok && d.sent) dlgInfo(`✅ Bilan envoyé (${d.envoyes} appareil(s)).\n${d.counts.nonCloturees} non clôturées · ${d.counts.devisEnAttente} devis en attente · ${d.counts.rapportsNonEnvoyes} rapports non envoyés`);
            else if(d.ok && !d.sent && d.reason==="rien-a-signaler") dlgInfo("✅ Rien à signaler cette semaine — aucune notification envoyée.");
            else if(d.ok && !d.sent && d.reason==="no-token") dlgInfo("⚠️ Rien n'a pu être envoyé : aucun appareil avec les notifications activées.");
            else dlgInfo("❌ Erreur : "+(d.error||"inconnue"));
          } catch(e){ dlgInfo("❌ Erreur réseau : "+e.message); }
        }} style={{padding:"9px 16px",background:"linear-gradient(135deg,#8B5CF6,#7C3AED)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>📋 Tester le bilan maintenant</button>
      </Repliable>

      {/* Export mensuel */}
      <Repliable T={T} icone="📊" titre="Export mensuel">
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:10,lineHeight:1.5}}>Récapitulatif du chiffre d'affaires estimé et du temps travaillé, par technicien, pour un mois donné.</div>
        <button onClick={onOpenExport} style={{padding:"9px 16px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>📊 Générer l'export</button>
      </Repliable>

      {/* Comptes techniciens restreints */}
      <Repliable T={T} icone="🔐" titre="Comptes & accès restreints">
        <div style={{fontSize:12.5,color:T.textMuted,marginBottom:12,lineHeight:1.6}}>
          Pour donner un accès personnel à un technicien : créez d'abord son compte (email + mot de passe) dans <b>Firebase Console → Authentication</b>, puis liez cet email à son nom ci-dessous. Un email lié à un technicien ne verra plus que ses propres interventions. Un compte non listé ici garde un accès complet.
        </div>
        {userRoles.filter(r=>r.role==="technicien").map(r=>(
          <div key={r.email} style={row(false)}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12.5,fontWeight:700,color:T.text,wordBreak:"break-all"}}>{r.email}</div>
              <div style={{fontSize:11,color:"#0EA5E9"}}>👤 {r.technicien}{r.sousTraitant?<span style={{color:"#F59E0B",marginLeft:6}}>· 🧰 sous-traitant (pas de notif. fiches libres)</span>:""}</div>
            </div>
            <button onClick={()=>onSaveUserRole({...r, sousTraitant: !r.sousTraitant})} style={{...btn,width:"auto",padding:"0 8px",fontSize:11,color:r.sousTraitant?"#F59E0B":T.textMuted}} title="Basculer sous-traitant">🧰</button>
            <button onClick={()=>onDeleteUserRole(r.email)} style={btn}>🗑️</button>
          </div>
        ))}
        {userRoles.filter(r=>r.role==="technicien").length===0 && <div style={{fontSize:12,color:T.textFaint,padding:"6px 4px"}}>Aucun compte restreint pour l'instant — tout le monde voit tout.</div>}
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
          <input value={nouvelEmail} onChange={e=>setNouvelEmail(e.target.value)} placeholder="email du compte" type="email"
            style={{flex:2,minWidth:160,padding:"8px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          <select value={nouveauRoleTech} onChange={e=>setNouveauRoleTech(e.target.value)}
            style={{flex:1,minWidth:120,padding:"8px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"}}>
            <option value="">— technicien —</option>
            {techniciens.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={()=>{ if(!nouvelEmail.trim()||!nouveauRoleTech) return; onSaveUserRole({email:nouvelEmail.trim().toLowerCase(),role:"technicien",technicien:nouveauRoleTech,sousTraitant:nouveauEstSousTraitant}); setNouvelEmail("");setNouveauRoleTech("");setNouveauEstSousTraitant(false); }} style={addBtn}>+ Lier ce compte</button>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11.5,color:T.textMuted,cursor:"pointer",width:"100%",marginTop:2}}>
            <input type="checkbox" checked={nouveauEstSousTraitant} onChange={e=>setNouveauEstSousTraitant(e.target.checked)} style={{width:14,height:14,cursor:"pointer"}}/>
            🧰 Sous-traitant externe — ne recevra jamais les notifications "fiche libre" de l'équipe, uniquement ce qui lui est assigné directement
          </label>
        </div>
      </Repliable>

      {/* Sociétés + logos */}
      <Repliable T={T} icone="🏢" titre="Sociétés intervenantes">
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
          <button onClick={async ()=>{const v=await dlgPrompt("Nom de la société","",{titre:"Nouvelle société",valider:"Ajouter"});if(v&&v.trim()&&!societes.includes(v.trim()))onSaveSocietes([...societes,v.trim()]);}} style={addBtn}>➕ Ajouter</button>
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
              {hasLogo&&<button onClick={async ()=>{if(await dlgConfirm(`Le logo de ${s} sera retiré des prochains rapports.`,{titre:"Retirer le logo",danger:true}))onRemoveLogo(s);}} style={btn}>🚫</button>}
              <button onClick={async ()=>{if(await dlgConfirm(`« ${s} » sera retirée de la liste. Les fiches existantes la conservent.`,{titre:"Supprimer la société",danger:true}))onSaveSocietes(societes.filter(x=>x!==s));}} style={{...btn,color:"#EF4444"}}>✕</button>
            </div>
          );
        })}
        <input ref={logoRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0];if(file&&logoTarget){const d=await resizeLogo(file);onSaveLogo(logoTarget,d);}e.target.value="";}}/>
      </Repliable>

      {/* Techniciens + numéros */}
      <Repliable T={T} icone="👤" titre="Techniciens, couleurs & numéros WhatsApp">
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
          <button onClick={async ()=>{const v=await dlgPrompt("Prénom ou nom du technicien","",{titre:"Nouveau technicien",valider:"Ajouter"});if(v&&v.trim()&&!techniciens.includes(v.trim()))onSaveTechniciens([...techniciens,v.trim()]);}} style={addBtn}>➕ Ajouter</button>
        </div>
        {techniciens.length===0&&<div style={{fontSize:12,color:T.textMuted,padding:"6px 0"}}>Aucun technicien — ils s'ajoutent aussi automatiquement à la 1ʳᵉ fiche.</div>}
        {techniciens.map((t,i)=>{
          const moisActuel = today().slice(0,7);
          const fichesDuMoisT = fiches.filter(f=>f.technicien===t && f.status==="termine" && (f.dateRdv||"").slice(0,7)===moisActuel);
          const minutesT = fichesDuMoisT.reduce((s,f)=>s+parseTempsMinutes(f.tempsInterne),0);
          const caT = fichesDuMoisT.reduce((s,f)=>{
            const base = f.tempsInterne && f.tarifHoraire ? parseFloat(calculerMontant(f.tempsInterne, f.tarifHoraire)) : 0;
            let coef=1; (f.majorations||[]).forEach(m=>{ if(m==="soir50")coef+=0.5; if(m==="weekend100")coef+=1; });
            return s + ((base&&!isNaN(base))?base*coef:0);
          },0);
          return (
          <div key={t}>
            <div style={row(false)}>
              <span style={{flex:1,fontSize:13,fontWeight:700,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{t}</span>
              <button onClick={()=>setStatsOuvertes(statsOuvertes===t?null:t)} title="Statistiques du mois" style={{...btn,width:"auto",padding:"0 9px",color:statsOuvertes===t?"#0EA5E9":T.textMuted}}>📊</button>
              <input type="color" title="Couleur de l'agenda" value={techColor(t,techniciens,techColors)}
                onChange={e=>onSaveTechColor(t,e.target.value)}
                style={{width:34,height:30,padding:0,border:`1px solid ${T.border}`,borderRadius:6,background:"none",cursor:"pointer"}}/>
              <input key={t+(techTels[logoKey(t)]||"")} defaultValue={techTels[logoKey(t)]||""} onBlur={e=>{if(e.target.value!==(techTels[logoKey(t)]||""))onSaveTechTel(t,e.target.value);}} placeholder="N° WhatsApp (33612345678)"
                style={{width:170,padding:"7px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={async ()=>{if(await dlgConfirm(`${t} sera retiré de la liste, avec son numéro et sa couleur d'agenda.`,{titre:"Supprimer le technicien",danger:true})){onSaveTechniciens(techniciens.filter(x=>x!==t));onSaveTechTel(t,"");onSaveTechColor(t,null);}}} style={{...btn,color:"#EF4444"}}>✕</button>
            </div>
            {statsOuvertes===t&&(
              <div style={{display:"flex",gap:8,padding:"10px 4px 14px",flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:100,background:T.surface2,borderRadius:8,padding:"9px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:800,color:T.text}}>{fichesDuMoisT.length}</div>
                  <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:".04em"}}>Interventions</div>
                </div>
                <div style={{flex:1,minWidth:100,background:T.surface2,borderRadius:8,padding:"9px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:800,color:T.text}}>{(minutesT/60).toFixed(1)} h</div>
                  <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:".04em"}}>Temps total</div>
                </div>
                <div style={{flex:1,minWidth:100,background:T.surface2,borderRadius:8,padding:"9px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:800,color:"#10B981"}}>{caT.toFixed(0)} €</div>
                  <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:".04em"}}>CA estimé (mois)</div>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </Repliable>

      {/* Sous-traitants */}
      <Repliable T={T} icone="📤" titre="Sous-traitants">
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
          <button onClick={async ()=>{const nom=await dlgPrompt("Nom du sous-traitant","",{titre:"Nouveau sous-traitant",valider:"Suivant"});if(!nom||!nom.trim())return;const tel=await dlgPrompt("Numéro WhatsApp, au format 33612345678","",{titre:`Numéro de ${nom.trim()}`,valider:"Ajouter"});if(!tel||!tel.trim())return;onSaveSousTraitants([...sousTraitants,{nom:nom.trim(),tel:tel.trim()}]);}} style={addBtn}>➕ Ajouter</button>
        </div>
        {sousTraitants.length===0&&<div style={{fontSize:12,color:T.textMuted,padding:"6px 0"}}>Aucun sous-traitant enregistré — ils s'ajoutent aussi automatiquement depuis le bouton "Envoyer au sous-traitant" sur une fiche.</div>}
        {sousTraitants.map((s,i)=>(
          <div key={i} style={row(i===sousTraitants.length-1)}>
            <span style={{flex:1,fontSize:13,fontWeight:700,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{s.nom}</span>
            <input key={s.nom+s.tel} defaultValue={s.tel} onBlur={e=>{if(e.target.value!==s.tel){const next=[...sousTraitants];next[i]={...next[i],tel:e.target.value};onSaveSousTraitants(next);}}} placeholder="N° WhatsApp (33612345678)"
              style={{width:170,padding:"7px 10px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={async ()=>{if(await dlgConfirm(`${s.nom} sera retiré de la liste des sous-traitants.`,{titre:"Supprimer le sous-traitant",danger:true}))onSaveSousTraitants(sousTraitants.filter((_,j)=>j!==i));}} style={{...btn,color:"#EF4444"}}>✕</button>
          </div>
        ))}
      </Repliable>

      {/* Catalogue devis */}
      <Repliable T={T} icone="⚡" titre="Prestations types des devis">
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
          <button onClick={async ()=>{const lab=await dlgPrompt("Libellé de la prestation","",{titre:"Nouvelle prestation",valider:"Suivant"});if(!lab||!lab.trim())return;const u=await dlgPrompt("Unité de facturation : u, ml, colonne…","u",{titre:"Unité",valider:"Ajouter"})||"u";writeCat([...cat,{label:lab.trim(),unite:u.trim()||"u"}]);}} style={addBtn}>➕ Ajouter</button>
        </div>
        {cat.map((c2,i)=>(
          <div key={i} style={row(i===cat.length-1)}>
            <span style={{flex:1,fontSize:13,color:T.text,minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}}>{c2.label} <span style={{color:T.textMuted,fontSize:11}}>({c2.unite})</span></span>
            <button onClick={()=>{if(i>0){const l=[...cat];[l[i-1],l[i]]=[l[i],l[i-1]];writeCat(l);}}} disabled={i===0} style={{...btn,opacity:i===0?.3:1}}>↑</button>
            <button onClick={()=>{if(i<cat.length-1){const l=[...cat];[l[i+1],l[i]]=[l[i],l[i+1]];writeCat(l);}}} disabled={i===cat.length-1} style={{...btn,opacity:i===cat.length-1?.3:1}}>↓</button>
            <button onClick={async ()=>{const lab=await dlgPrompt("Libellé de la prestation",c2.label,{titre:"Modifier",valider:"Suivant"});if(!lab||!lab.trim())return;const u=await dlgPrompt("Unité de facturation",c2.unite,{titre:"Unité",valider:"Enregistrer"})||c2.unite;const l=[...cat];l[i]={label:lab.trim(),unite:u.trim()||c2.unite};writeCat(l);}} style={btn}>✏️</button>
            <button onClick={async ()=>{if(await dlgConfirm(`« ${c2.label} » sera retirée des prestations types.`,{titre:"Supprimer la prestation",danger:true})){const l=[...cat];l.splice(i,1);writeCat(l);}}} style={{...btn,color:"#EF4444"}}>✕</button>
          </div>
        ))}
      </Repliable>

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
  {key:"methodes",icon:"🔬",label:"Méthode de détection"},
  {key:"actions",icon:"🔨",label:"Action réalisée"},
  {key:"resultats",icon:"✅",label:"Résultat"},
];
function ChampsEditor({ champs, onSave, onSavePrestationLabel, theme, onCreateModule, onDeleteModule, prefill=null, onPrefillConsumed }) {
  const T = THEMES[theme] || THEMES.dark;
  const [prestaId, setPrestaId] = useState(PRESTATIONS[0].id);
  const [iaTexte, setIaTexte] = useState("");
  const [iaPhotos, setIaPhotos] = useState([]); // dataURLs des photos jointes, optionnelles, plusieurs possibles

  useEffect(()=>{
    if(!prefill) return;
    if(prefill.texte) setIaTexte(prefill.texte);
    if(prefill.photo) setIaPhotos(p=>[...p, prefill.photo]);
    onPrefillConsumed && onPrefillConsumed();
  }, [prefill]);

  const [iaPropositions, setIaPropositions] = useState(null); // [{prestationId,categorie,item,selected}]
  const [iaLoading, setIaLoading] = useState(false);

  const analyserAvecIA = async () => {
    if(!iaTexte.trim() && !iaPhotos.length) return;
    setIaLoading(true);
    try {
      const structureTexte = PRESTATIONS.map(p=>{
        const catsDispo = CHAMPS_CATS.filter(c=>Array.isArray(p[c.key]));
        return `- ${p.id} ("${p.label}") — catégories disponibles : ${catsDispo.map(c=>c.key).join(", ")}`;
      }).join("\n");
      const prompt = `Tu configures les cases à cocher d'une application terrain pour une entreprise de plomberie/assainissement.
Voici les types de prestations disponibles et leurs catégories de cases actives :
${structureTexte}
${iaPhotos.length ? `\n${iaPhotos.length>1?`${iaPhotos.length} photos sont jointes`:"Une photo est jointe"} ci-dessous. Identifie d'abord précisément ce qu'elle${iaPhotos.length>1?"s":""} montre${iaPhotos.length>1?"nt":""} (élément, matériau, état constaté...), même si le vocabulaire technique exact n'est pas donné par l'utilisateur — c'est justement à toi de le trouver. Ensuite, propose la ou les cases à ajouter en te basant sur ce que tu vois.` : ""}
${iaTexte.trim() ? `\nCe que l'utilisateur a précisé en plus, en langage naturel — la demande peut concerner plusieurs cases, plusieurs catégories et plusieurs prestations à la fois :\n"${iaTexte.trim()}"` : ""}

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte autour, sans backticks, de cette forme exacte :
[{"prestationId":"id_exact_de_la_liste_ci-dessus","categorie":"cle_exacte_parmi_celles_listees_pour_cette_prestation","item":"Libellé de la nouvelle case, avec le bon vocabulaire technique du métier"}]
Une entrée par case à ajouter. Si l'endroit n'est pas clairement précisé, choisis la catégorie la plus logique (problemes pour un souci constaté, actions pour un geste technique réalisé, resultats pour un aboutissement, localisations pour un lieu, causes pour une origine identifiée). N'invente jamais un prestationId ou une categorie qui n'existe pas dans la liste fournie.
IMPÉRATIF : ta réponse complète doit être UNIQUEMENT le tableau JSON, rien d'autre — aucune phrase d'introduction, aucune explication, aucune question, même si tu n'es pas sûr à 100% de ce que montre la photo. Réponds toujours en français dans les libellés. Si tu ne peux vraiment rien proposer, réponds avec un tableau vide : []`;
      const contentBlocks = [];
      iaPhotos.forEach(photo=>{
        const mediaType = photo.match(/^data:(.*?);base64/)?.[1] || "image/jpeg";
        contentBlocks.push({type:"image", source:{type:"base64", media_type:mediaType, data:photo.split(",")[1]}});
      });
      contentBlocks.push({type:"text", text:prompt});
      const r = await fetch("/api/claude", {method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1200,messages:[{role:"user",content:contentBlocks}]})});
      const d = await r.json();
      if(!r.ok) throw new Error(d?.error?.message||d?.error||"Erreur API");
      const raw = (d.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      let props;
      try {
        props = JSON.parse(raw);
      } catch {
        // L'IA a peut-être ajouté une phrase avant/après le tableau malgré la consigne —
        // on tente de récupérer juste la partie entre le premier [ et le dernier ].
        const m = raw.match(/\[[\s\S]*\]/);
        if(m){ props = JSON.parse(m[0]); }
        else throw new Error(`Réponse inattendue de l'IA : "${raw.slice(0,200)}"`);
      }
      if(!Array.isArray(props)||!props.length){ dlgInfo("L'IA n'a proposé aucune case à ajouter — reformulez peut-être plus précisément, ou la photo n'est pas assez claire pour elle."); setIaLoading(false); return; }
      setIaPropositions(props.map(p=>({...p,selected:true})));
    } catch(e) {
      const msg = e?.message||String(e);
      const hint = iaPhotos.length>3 ? "\n\n💡 Essayez avec moins de photos à la fois (2-3)." : "";
      dlgInfo("Erreur lors de l'analyse : "+msg+hint);
    }
    setIaLoading(false);
  };

  const appliquerPropositionsIA = () => {
    const retenues = iaPropositions.filter(p=>p.selected);
    const groupes = {};
    retenues.forEach(p=>{
      const cle = `${p.prestationId}|${p.categorie}`;
      if(!groupes[cle]) groupes[cle] = {prestationId:p.prestationId, categorie:p.categorie, items:[]};
      groupes[cle].items.push(p.item);
    });
    Object.values(groupes).forEach(g=>{
      const meta = PRESTATIONS.find(p=>p.id===g.prestationId);
      if(!meta) return;
      const listeActuelle = champs?.[g.prestationId]?.[g.categorie]?.length ? champs[g.prestationId][g.categorie] : (meta[g.categorie]||[]);
      const nouvelleListe = [...listeActuelle, ...g.items.filter(it=>!listeActuelle.includes(it))];
      onSave(g.prestationId, g.categorie, nouvelleListe);
    });
    setIaPropositions(null);
    setIaTexte("");
    setIaPhotos([]);
  };

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
  const renameIt = async (cat,i) => { const l=[...listOf(cat)]; const v=await dlgPrompt("Nouveau libellé",l[i],{titre:"Renommer la case",valider:"Enregistrer"}); if(v&&v.trim()){l[i]=v.trim(); write(cat,l);} };
  const removeIt = async (cat,i) => { const l=[...listOf(cat)]; if(!(await dlgConfirm(`La case « ${l[i]} » sera retirée de cette rubrique.`,{titre:"Supprimer la case",danger:true})))return; l.splice(i,1); write(cat,l); };
  const addIt = async (cat) => { const v=await dlgPrompt("Libellé de la nouvelle case","",{titre:"Ajouter une case",valider:"Ajouter"}); if(v&&v.trim()) write(cat,[...listOf(cat),v.trim()]); };
  const resetIt = async (cat) => { if(await dlgConfirm("La rubrique reviendra à la liste d'origine. Vos personnalisations seront effacées.",{titre:"Revenir à l'origine",danger:true,valider:"Réinitialiser"})) write(cat,null); };

  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("🧩");
  const [newColor, setNewColor] = useState("#8B5CF6");
  const slugify = (s) => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  const creerModule = () => {
    const label = newLabel.trim();
    if(!label){ dlgInfo("Donnez un nom à ce nouveau module (ex : Curage)."); return; }
    let id = slugify(label) || "module";
    if(PRESTATIONS.some(p=>p.id===id)) id = id + "_" + Date.now().toString(36).slice(-4);
    const item = { id, label, icon: newIcon.trim()||"🧩", color: newColor, localisations:[], problemes:[], causes:[], constatCamera:[], actions:[], resultats:[] };
    onCreateModule(item);
    setNewLabel(""); setNewIcon("🧩"); setNewColor("#8B5CF6"); setShowCreate(false);
    setPrestaId(id);
  };
  const supprimerModule = async () => {
    if(!(await dlgConfirm(`Le module « ${meta.label} » sera supprimé, avec ses cases et personnalisations. Les fiches déjà enregistrées ne sont pas touchées.`,{titre:"Supprimer le module",danger:true}))) return;
    onDeleteModule(meta.id);
    setPrestaId(PRESTATIONS[0].id);
  };

  const btn = {border:`1px solid ${T.border}`,background:T.surface2,color:T.textMuted,borderRadius:6,width:28,height:28,cursor:"pointer",fontFamily:"inherit",fontSize:12};
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{background:"rgba(14,165,233,0.07)",border:"1px solid rgba(14,165,233,0.25)",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:12.5,color:T.text,lineHeight:1.6}}>
        ⚙️ Ici vous gérez vous-même les cases proposées dans les fiches : <b>ajoutez</b> ➕, <b>renommez</b> ✏️, <b>supprimez</b> ✕ ou <b>déplacez</b> ↑↓ les cases. Les modifications s'appliquent immédiatement pour toute l'équipe. Les fiches déjà enregistrées ne sont pas touchées.
      </div>

      <div style={{background:"rgba(139,92,246,0.07)",border:"1px solid rgba(139,92,246,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:14}}>
        <div style={{fontWeight:800,fontSize:13,color:"#A78BFA",marginBottom:6}}>🤖 Ajouter des cases en langage naturel ou par photo</div>
        <div style={{fontSize:11.5,color:T.textMuted,marginBottom:10,lineHeight:1.5}}>Décrivez ce que vous voulez ajouter (même sur plusieurs prestations à la fois), ou joignez simplement une photo — l'IA identifie ce qu'elle voit et propose la bonne case, même si vous ne connaissez pas le terme technique exact.</div>
        <textarea value={iaTexte} onChange={e=>setIaTexte(e.target.value)} rows={3}
          placeholder="Décrivez les cases à ajouter, ou laissez vide et joignez juste une photo…"
          style={{width:"100%",padding:"10px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,resize:"vertical",outline:"none",fontFamily:"inherit",marginBottom:8}}/>
        {iaPhotos.length>0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
            {iaPhotos.map((photo,i)=>(
              <div key={i} style={{position:"relative",display:"inline-block"}}>
                <img src={photo} alt="" style={{height:90,borderRadius:8,display:"block"}}/>
                <button onClick={()=>setIaPhotos(ps=>ps.filter((_,j)=>j!==i))} style={{position:"absolute",top:-6,right:-6,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.8)",color:"#fff",border:"none",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>✕</button>
              </div>
            ))}
          </div>
        )}
        <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:T.surface2,border:`1.5px dashed ${T.border}`,borderRadius:8,color:T.textMuted,fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:10}}>
          📷 {iaPhotos.length?"Ajouter une/des photo(s) de plus":"Joindre une ou plusieurs photos"}
          <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{
            const files = Array.from(e.target.files||[]); if(!files.length) return;
            files.forEach(file=>{
              const reader = new FileReader();
              reader.onload = ev => {
                const img = new Image();
                img.onload = () => {
                  // Compression volontairement plus forte ici que pour les photos de fiche :
                  // avec plusieurs photos envoyées d'un coup, le total doit rester bien en
                  // dessous de la limite de taille de requête de Vercel (~4,5 Mo) — l'IA n'a de
                  // toute façon pas besoin d'une résolution très élevée pour identifier un objet.
                  const max = 700; const sc = Math.min(1, max/Math.max(img.width,img.height));
                  const c = document.createElement("canvas"); c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
                  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
                  setIaPhotos(ps=>[...ps, c.toDataURL("image/jpeg",0.6)]);
                };
                img.src = ev.target.result;
              };
              reader.readAsDataURL(file);
            });
            e.target.value = "";
          }}/>
        </label>
        <div>
          <button onClick={analyserAvecIA} disabled={iaLoading||(!iaTexte.trim()&&!iaPhotos.length)}
            style={{padding:"9px 16px",background:iaLoading?T.surface2:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:iaLoading?T.textMuted:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:13,cursor:iaLoading?"default":"pointer",fontFamily:"inherit",opacity:(!iaTexte.trim()&&!iaPhotos.length)?0.5:1}}>
            {iaLoading?"⏳ Analyse…":"✨ Analyser"}
          </button>
        </div>
      </div>

      {iaPropositions && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setIaPropositions(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:480,maxWidth:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>🤖 Cases proposées</div>
            <div style={{fontSize:11.5,color:T.textMuted,marginBottom:16}}>Décochez ce que vous ne voulez pas ajouter, puis confirmez.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
              {iaPropositions.map((p,i)=>{
                const meta = PRESTATIONS.find(x=>x.id===p.prestationId);
                const catInfo = CHAMPS_CATS.find(c=>c.key===p.categorie);
                return (
                  <div key={i} onClick={()=>setIaPropositions(props=>props.map((x,j)=>j===i?{...x,selected:!x.selected}:x))}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,cursor:"pointer",background:p.selected?"rgba(139,92,246,0.08)":T.surface2,border:`1.5px solid ${p.selected?"#A78BFA":T.border}`}}>
                    <span style={{width:18,height:18,borderRadius:5,flexShrink:0,background:p.selected?"#A78BFA":"transparent",border:`2px solid ${p.selected?"#A78BFA":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:800}}>{p.selected?"✓":""}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>{p.item}</div>
                      <div style={{fontSize:11,color:T.textMuted}}>{meta?.icon} {meta?.label||p.prestationId} — {catInfo?.icon} {catInfo?.label||p.categorie}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setIaPropositions(null)} style={{flex:1,padding:"11px",borderRadius:9,border:`1px solid ${T.border}`,background:"none",color:T.textMuted,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
              <button onClick={appliquerPropositionsIA} disabled={!iaPropositions.some(p=>p.selected)} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",opacity:iaPropositions.some(p=>p.selected)?1:0.5}}>
                ✅ Ajouter {iaPropositions.filter(p=>p.selected).length} case{iaPropositions.filter(p=>p.selected).length>1?"s":""}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{background:showCreate?"rgba(139,92,246,0.08)":T.surface,border:`1.5px solid ${showCreate?"#8B5CF6":T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
        {!showCreate ? (
          <button onClick={()=>setShowCreate(true)} style={{width:"100%",padding:"10px 14px",background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:9,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🧩 Créer un nouveau module de service</button>
        ) : (
          <>
            <div style={{fontWeight:800,fontSize:13.5,color:T.text,marginBottom:10}}>🧩 Nouveau module de service</div>
            <div style={{display:"grid",gridTemplateColumns:"56px 70px 1fr",gap:8,marginBottom:10}}>
              <input value={newIcon} onChange={e=>setNewIcon(e.target.value)} placeholder="🧩" maxLength={2}
                style={{padding:"9px",textAlign:"center",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:16,outline:"none",fontFamily:"inherit"}}/>
              <input type="color" value={newColor} onChange={e=>setNewColor(e.target.value)}
                style={{padding:2,background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,cursor:"pointer",height:38}}/>
              <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="Nom du service (ex : Curage)"
                style={{padding:"9px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <div style={{fontSize:11.5,color:T.textMuted,marginBottom:10}}>Une fois créé, vous pourrez ajouter ses cases (localisations, problèmes, causes, actions, résultats…) juste en dessous, exactement comme pour les services existants.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={creerModule} style={{flex:1,padding:"9px 14px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✓ Créer</button>
              <button onClick={()=>{setShowCreate(false);setNewLabel("");}} style={{padding:"9px 14px",background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
            </div>
          </>
        )}
      </div>

      <select value={prestaId} onChange={e=>setPrestaId(e.target.value)}
        style={{width:"100%",padding:"12px 14px",background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,fontWeight:700,outline:"none",fontFamily:"inherit",cursor:"pointer",marginBottom:16,boxSizing:"border-box"}}>
        {PRESTATIONS.map(p=><option key={p.id} value={p.id}>{p.icon} {p.label}{p._custom?" (personnalisé)":""}</option>)}
        <option value="_global">💡 Préconisations (toutes fiches)</option>
      </select>
      {!isPreco&&meta&&(
        <div style={{display:"flex",alignItems:"center",gap:10,background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 16px",marginBottom:12,flexWrap:"wrap"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".05em"}}>Titre de cette catégorie</div>
          <div style={{fontWeight:800,fontSize:14,color:T.text,flex:1}}>{meta.icon} {meta.label}</div>
          {meta.label!==meta._origLabel&&<span style={{fontSize:10,fontWeight:700,color:"#A78BFA",background:"rgba(167,139,250,0.14)",padding:"2px 8px",borderRadius:10}}>personnalisé</span>}
          <button onClick={async ()=>{const v=await dlgPrompt("Nouveau titre de la catégorie",meta.label,{titre:"Renommer la catégorie",valider:"Enregistrer"});if(v&&v.trim())onSavePrestationLabel(prestaId,v.trim());}} style={{...btn,width:"auto",padding:"0 10px",fontSize:11}}>✏️ Renommer</button>
          {meta.label!==meta._origLabel&&<button onClick={async ()=>{if(await dlgConfirm(`La catégorie reprendra son titre d'origine : « ${meta._origLabel} ».`,{titre:"Revenir au titre d'origine",valider:"Rétablir"}))onSavePrestationLabel(prestaId,null);}} style={{...btn,width:"auto",padding:"0 10px",fontSize:11}}>↺ Origine</button>}
          {meta._custom&&<button onClick={supprimerModule} style={{...btn,width:"auto",padding:"0 10px",fontSize:11,color:"#EF4444",borderColor:"rgba(239,68,68,0.4)"}}>🗑️ Supprimer ce module</button>}
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
const normFR = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g,"").trim();

function VoiceImport({ onExtracted, onCancel, theme, techniciens, clients, onLog, initialTexte, initialMode }) {
  const T = THEMES[theme] || THEMES.dark;
  const [mode, setMode] = useState(initialMode||"rdv"); // "rdv" | "fiche"
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [texte, setTexte] = useState(initialTexte||"");
  const [seconds, setSeconds] = useState(0);
  const [erreur, setErreur] = useState("");
  const [apercu, setApercu] = useState(null); // {mode, data}
  const [editKey, setEditKey] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const dernierBlobRef = useRef(null);
  const dernierMimeRef = useRef("audio/webm");

  const demarrer = async () => {
    setErreur("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/mp4","audio/webm","audio/webm;codecs=opus"].find(t=>window.MediaRecorder?.isTypeSupported?.(t)) || "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t=>t.stop());
        clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        dernierBlobRef.current = blob;
        dernierMimeRef.current = rec.mimeType || "audio/webm";
        transcrire(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(()=>setSeconds(s=>s+1), 1000);
    } catch (e) {
      setErreur("Impossible d'accéder au micro — vérifiez que vous avez autorisé l'accès au micro pour ce site.");
    }
  };
  const arreter = () => { recorderRef.current?.stop(); setRecording(false); };

  const transcrire = async (blob) => {
    setTranscribing(true);
    try {
      const r = await fetch("/api/transcribe", { method:"POST", headers:{"Content-Type": blob.type||"audio/webm"}, body: blob });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data?.error || ("API "+r.status));
      setTexte(p => (p ? p+" " : "") + (data.text||"").trim());
    } catch(e) {
      if(!navigator.onLine){
        try {
          await idbAjouterMemo(blob, blob.type||dernierMimeRef.current||"audio/webm", mode);
          setErreur("📴 Pas de réseau — mémo vocal sauvegardé sur l'appareil, il sera transcrit automatiquement dès le retour de la connexion (visible ensuite dans « Mémos vocaux »).");
        } catch(e2) {
          setErreur("Impossible de sauvegarder le mémo hors-ligne : "+(e2?.message||e2));
        }
      } else {
        setErreur("Erreur de transcription : "+(e?.message||e));
      }
    }
    setTranscribing(false);
  };

  const analyser = async () => {
    if(!texte.trim()){ setErreur("Rien à analyser — dictez d'abord un message."); return; }
    setBusy(true); setErreur("");
    try {
      let prompt, content;
      const listeTechniciens = (techniciens||[]).join(", ");
      const consigneLexique = LEXIQUE_METIER;
      const consigneTechnicien = listeTechniciens
        ? `Techniciens connus (fais correspondre le prénom dicté à l'un d'eux, même approximatif ou mal transcrit — ex. "Ramzi" ou "Ramzy" doivent correspondre au même nom si présent dans la liste ; utilise EXACTEMENT l'orthographe de la liste ; laisse vide si aucun nom de la liste ne correspond) : ${listeTechniciens}.`
        : "";
      if (mode === "rdv") {
        prompt = `Tu extrais les informations d'un message dicté à l'oral par un technicien de plomberie/assainissement, pour créer un rendez-vous. Date du jour : ${today()}.
${consigneLexique}
${consigneTechnicien}
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks, avec exactement ces clés (chaîne vide ou false si l'info est absente) :
{"client":"nom du client ou de la société","tel":"téléphone","adresse":"adresse complète de l'intervention","dateRdv":"date au format YYYY-MM-DD (interprète 'demain', 'lundi prochain'... par rapport à la date du jour ; vide si aucune date)","heureRdv":"heure au format HH:MM (vide si absente)","technicien":"nom exact du technicien parmi la liste connue si mentionné, sinon vide","urgent":true ou false selon que le rendez-vous est présenté comme urgent/prioritaire,"note":"résumé en 1-2 phrases du problème ou de la demande (n'y répète pas le nom du technicien s'il a déjà été mis dans le champ technicien)"}`;
      } else {
        const listePrestations = PRESTATIONS.map(p=>`${p.id} = ${p.label}`).join(" / ");
        const listeMateriels = MATERIELS.join(", ");
        const listePreconisations = PRECONISATIONS.join(" / ");
        const listeResponsabilites = RESPONSABILITES.map(r=>`${r.id} = ${r.label} (${r.desc})`).join(" / ");
        prompt = `Tu extrais les informations d'un compte-rendu d'intervention dicté à l'oral par un technicien de plomberie/assainissement, juste après (ou pendant) une intervention chez un client, pour remplir une fiche d'intervention.
${consigneLexique}
Catégories de prestations disponibles (utilise uniquement leur "id" exact, une ou plusieurs si mentionnées) : ${listePrestations}
Matériels disponibles (utilise UNIQUEMENT le texte exact de cette liste, un ou plusieurs si mentionnés) : ${listeMateriels}
Préconisations disponibles (utilise UNIQUEMENT le texte exact de cette liste, une ou plusieurs si mentionnées) : ${listePreconisations}
Responsabilité (utilise l'id exact) : ${listeResponsabilites}
${consigneTechnicien}
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks, avec exactement ces clés (chaîne vide, tableau vide ou false si l'info est absente) :
{"client":"nom du client ou de la société","tel":"téléphone","adresse":"adresse complète de l'intervention","prestations":["id des catégories concernées, ex: debouchage"],"statut":"a_prevoir UNIQUEMENT si le technicien doit physiquement repasser sur place pour finir ou réparer quelque chose de précis — typiquement une pièce ou un matériel qui manquait sur place (ex: une vanne à remplacer non disponible dans le camion). Ne JAMAIS mettre a_prevoir pour une simple recommandation que le client est libre d'accepter ou de refuser (ex: curage conseillé, passage caméra conseillé, détartrage conseillé) — cela va uniquement dans le champ preconisations, avec statut termine. Dans le doute, mettre termine.","technicien":"nom exact du technicien parmi la liste connue si mentionné, sinon vide","tempsPasse":"temps passé sur l'intervention si mentionné, au format Xh ou XhYY (ex: 2h, 1h30) ; vide si absent","majorationSoir":true ou false selon que l'intervention dicte s'être déroulée en soirée / de nuit (majoration +50%),"majorationWeekend":true ou false selon que l'intervention dicte s'être déroulée un week-end (majoration +100%),"tarifHoraire":"tarif horaire en euros si un montant/tarif horaire est explicitement mentionné, sinon vide","materiels":["texte exact du matériel utilisé mentionné, parmi la liste donnée"],"difficulte":"Facile, Normale, Difficile ou Très difficile si le niveau de difficulté est mentionné ou clairement déductible, sinon vide","responsabilite":"id exact parmi la liste si la responsabilité (privative/commune/indéterminée) est mentionnée, sinon vide","preconisations":["texte exact parmi la liste des préconisations, si des recommandations pour la suite sont mentionnées"],"diametreCanalisation":"diamètre de la canalisation si mentionné, ex: 100mm ; vide sinon","urgent":true ou false selon que l'intervention ou la situation est présentée comme urgente,"notesInternes":"remarques destinées en interne uniquement (non visibles du client), ex. difficulté d'accès, comportement du client, points de vigilance pour la prochaine visite — vide si rien de tel n'est dicté","conclusion":"résumé rédigé et complet du constat, du travail réalisé et du résultat, en 2 à 4 phrases, à partir de ce qui a été dicté (n'y répète pas les informations déjà placées dans un champ dédié : technicien, temps passé, majorations, matériel, difficulté, responsabilité, préconisations, notes internes)","note":"la même idée que conclusion mais en 1 phrase courte"}`;
      }
      content = prompt + `\n\nMessage dicté :\n${texte.trim()}`;
      const r = await fetch("/api/claude", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1400, messages:[{role:"user",content}] })
      });
      if(!r.ok) throw new Error("API "+r.status);
      const data = await r.json();
      const raw = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
      const j = JSON.parse(raw);
      if (mode === "rdv") {
        const techValide = (techniciens||[]).find(t=>t===j.technicien) || "";
        const matchClient = (clients||[]).find(c => j.client && normFR(c.client)===normFR(j.client));
        const data = { client:j.client||"", tel:j.tel||matchClient?.tel||"", adresse:j.adresse||"",
          dateRdv:j.dateRdv||today(), heureRdv:j.heureRdv||"", noteRdv:j.note||"", technicien:techValide, urgent:!!j.urgent,
          clientId: matchClient?.id||null };
        const audio = await audioEnBase64();
        if(audio) data.audioMemo = audio;
        setApercu({ mode:"rdv", data });
      } else {
        const idsValides = (j.prestations||[]).filter(id=>PRESTATIONS.some(p=>p.id===id));
        const techValide = (techniciens||[]).find(t=>t===j.technicien) || "";
        const majorations = [];
        if (j.majorationSoir) majorations.push("soir50");
        if (j.majorationWeekend) majorations.push("weekend100");
        const materielsValides = (j.materiels||[]).filter(m=>MATERIELS.includes(m));
        const preconisationsValides = (j.preconisations||[]).filter(p=>PRECONISATIONS.includes(p));
        const difficulteValide = ["Facile","Normale","Difficile","Très difficile"].includes(j.difficulte) ? j.difficulte : "";
        const responsabiliteValide = RESPONSABILITES.some(r=>r.id===j.responsabilite) ? j.responsabilite : "na";
        const matchClient = (clients||[]).find(c => j.client && normFR(c.client)===normFR(j.client));
        const data = {
          client:j.client||"", tel:j.tel||matchClient?.tel||"", adresse:j.adresse||"",
          status: j.statut==="a_prevoir" ? "a_prevoir" : "termine",
          conclusion: j.conclusion||"",
          technicien: techValide,
          tempsInterne: j.tempsPasse||"",
          majorations,
          tarifHoraire: j.tarifHoraire||"",
          materiels: materielsValides,
          difficulte: difficulteValide,
          responsabilite: responsabiliteValide,
          preconisations: preconisationsValides,
          diametreCanalisation: j.diametreCanalisation||"",
          urgent: !!j.urgent,
          notesInternes: j.notesInternes||"",
          prestations: idsValides.map(id=>({id,localisations:[],problemes:[],causes:[],constatCamera:[],methodes:[],actions:[],resultats:[],note:j.note||""})),
          clientId: matchClient?.id||null,
        };
        const audio = await audioEnBase64();
        if(audio) data.audioMemo = audio;
        setApercu({ mode:"fiche", data });
      }
    } catch(e) { setErreur("Erreur lors de l'analyse : "+(e?.message||e)); }
    setBusy(false);
  };

  const audioEnBase64 = () => new Promise(resolve => {
    const blob = dernierBlobRef.current;
    if(!blob || blob.size > 4*1024*1024){ resolve(null); return; } // >4Mo : on n'attache pas
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });

  const updateChamp = (key, value) => setApercu(p => ({ ...p, data: { ...p.data, [key]: value } }));

  const toggleDansListe = (key, id) => setApercu(p => {
    const arr = p.data[key] || [];
    const next = arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id];
    return { ...p, data: { ...p.data, [key]: next } };
  });

  const togglePrestation = (id) => setApercu(p => {
    const arr = p.data.prestations || [];
    const existe = arr.some(x=>x.id===id);
    const next = existe ? arr.filter(x=>x.id!==id) : [...arr, {id,localisations:[],problemes:[],causes:[],constatCamera:[],methodes:[],actions:[],resultats:[],note:""}];
    return { ...p, data: { ...p.data, prestations: next } };
  });

  const champsConfig = () => {
    if (!apercu) return [];
    if (apercu.mode === "rdv") {
      return [
        {key:"client", label:"Client", type:"text"},
        {key:"_clientMatch", label:"→ relié à un client existant", type:"info"},
        {key:"tel", label:"Téléphone", type:"text"},
        {key:"adresse", label:"Adresse", type:"text"},
        {key:"dateRdv", label:"Date", type:"date"},
        {key:"heureRdv", label:"Heure", type:"time"},
        {key:"technicien", label:"Technicien", type:"select", options:(techniciens||[]).map(t=>({id:t,label:t}))},
        {key:"urgent", label:"Urgent", type:"toggle"},
        {key:"noteRdv", label:"Note", type:"textarea"},
      ];
    }
    return [
      {key:"client", label:"Client", type:"text"},
      {key:"_clientMatch", label:"→ relié à un client existant", type:"info"},
      {key:"tel", label:"Téléphone", type:"text"},
      {key:"adresse", label:"Adresse", type:"text"},
      {key:"prestations", label:"Prestations", type:"prestations"},
      {key:"status", label:"Statut", type:"select", options:[{id:"termine",label:"Terminé"},{id:"a_prevoir",label:"Retour à prévoir"}]},
      {key:"technicien", label:"Technicien", type:"select", options:(techniciens||[]).map(t=>({id:t,label:t}))},
      {key:"tempsInterne", label:"Temps passé", type:"text", placeholder:"ex : 1h30"},
      {key:"majorations", label:"Majoration", type:"multiselect", options:[{id:"soir50",label:"🌙 Soirée +50%"},{id:"weekend100",label:"🌃 Nuit / week-end +100%"}]},
      {key:"tarifHoraire", label:"Tarif horaire", type:"text", placeholder:"ex : 85"},
      {key:"materiels", label:"Matériel", type:"multiselect", options:MATERIELS.map(m=>({id:m,label:m}))},
      {key:"difficulte", label:"Difficulté", type:"select", options:["Facile","Normale","Difficile","Très difficile"].map(d=>({id:d,label:d}))},
      {key:"responsabilite", label:"Responsabilité", type:"select", options:RESPONSABILITES.map(r=>({id:r.id,label:r.label}))},
      {key:"preconisations", label:"Préconisations", type:"multiselect", options:PRECONISATIONS.map(p=>({id:p,label:p}))},
      {key:"diametreCanalisation", label:"Diamètre canalisation", type:"text", placeholder:"ex : 100mm"},
      {key:"urgent", label:"Urgent", type:"toggle"},
      {key:"notesInternes", label:"Notes internes", type:"textarea"},
      {key:"conclusion", label:"Conclusion", type:"textarea"},
    ];
  };

  // Calcule l'affichage (valeur texte + ok/optionnel) d'un champ à partir de apercu.data actuel
  const champAffichage = (c) => {
    const d = apercu?.data || {};
    if (c.key === "_clientMatch") return { valeur: d.clientId ? "oui" : null, ok: !!d.clientId, optionnel: !d.clientId };
    if (c.type === "prestations") {
      const labels = (d.prestations||[]).map(p=>PRESTATIONS.find(x=>x.id===p.id)?.label).filter(Boolean).join(", ");
      return { valeur: labels, ok: (d.prestations||[]).length>0 };
    }
    if (c.type === "multiselect") {
      const arr = d[c.key]||[];
      const labels = arr.map(id=>c.options.find(o=>o.id===id)?.label).filter(Boolean).join(", ");
      return { valeur: labels, ok: arr.length>0, optionnel: arr.length===0 };
    }
    if (c.type === "toggle") return { valeur: d[c.key]?"oui":null, ok: !!d[c.key], optionnel: !d[c.key] };
    if (c.key === "status") return { valeur: STATUTS[d.status]?.label, ok: true };
    if (c.key === "responsabilite") return { valeur: d.responsabilite&&d.responsabilite!=="na" ? c.options.find(o=>o.id===d.responsabilite)?.label : null, ok: d.responsabilite&&d.responsabilite!=="na", optionnel: !d.responsabilite||d.responsabilite==="na" };
    return { valeur: d[c.key], ok: !!d[c.key] };
  };


  const appliquer = () => {
    setEditKey(null);
    if(!apercu) return;
    onLog?.({ id:uid2("MEMO"), ts:ts(), mode:apercu.mode, texte, statut:"applique", client:apercu.data?.client||"" });
    onExtracted(apercu.mode, apercu.data);
  };
  const annulerAvecLog = () => {
    if(texte.trim()) onLog?.({ id:uid2("MEMO"), ts:ts(), mode, texte, statut:"abandonne", client:"" });
    onCancel();
  };

  const mmss = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:480,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>

        {apercu ? (
          <>
            <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>✨ Aperçu avant application</div>
            <div style={{fontSize:12.5,color:T.textMuted,marginBottom:14}}>Voici ce que l'IA a compris. Cliquez sur une ligne pour la compléter ou la corriger.</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
              {champsConfig().map((c,i)=>{
                const { valeur, ok, optionnel } = champAffichage(c);
                const enEdition = editKey === c.key;
                const editable = c.type !== "info";
                return (
                  <div key={i} style={{borderRadius:8,background:T.surface2,overflow:"hidden"}}>
                    <div onClick={()=>editable&&setEditKey(enEdition?null:c.key)}
                      style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",cursor:editable?"pointer":"default",...(enEdition?{background:"rgba(14,165,233,0.08)"}:{})}}>
                      <div style={{fontSize:13,flexShrink:0}}>{ok?"✅":optionnel?"⚪":"❌"}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:10.5,color:T.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:".04em"}}>{c.label}</div>
                        <div style={{fontSize:12.5,color:ok?T.text:T.textFaint,fontWeight:ok?600:400,wordBreak:"break-word"}}>{valeur || (optionnel?"—":"non détecté")}</div>
                      </div>
                      {editable&&<div style={{fontSize:11,color:"#0EA5E9",flexShrink:0}}>{enEdition?"▲":"✏️"}</div>}
                    </div>

                    {enEdition && (
                      <div style={{padding:"0 10px 10px"}} onClick={e=>e.stopPropagation()}>
                        {c.type==="text" && (
                          <input autoFocus value={apercu.data[c.key]||""} placeholder={c.placeholder||""} onChange={e=>updateChamp(c.key,e.target.value)}
                            style={{width:"100%",padding:"8px 10px",background:T.surface,border:`1.5px solid #0EA5E9`,borderRadius:6,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                        )}
                        {c.type==="textarea" && (
                          <textarea autoFocus rows={3} value={apercu.data[c.key]||""} onChange={e=>updateChamp(c.key,e.target.value)}
                            style={{width:"100%",padding:"8px 10px",background:T.surface,border:`1.5px solid #0EA5E9`,borderRadius:6,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",resize:"vertical"}}/>
                        )}
                        {c.type==="date" && (
                          <input autoFocus type="date" value={apercu.data[c.key]||""} onChange={e=>updateChamp(c.key,e.target.value)}
                            style={{width:"100%",padding:"8px 10px",background:T.surface,border:`1.5px solid #0EA5E9`,borderRadius:6,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",colorScheme:"dark"}}/>
                        )}
                        {c.type==="time" && (
                          <input autoFocus type="time" value={apercu.data[c.key]||""} onChange={e=>updateChamp(c.key,e.target.value)}
                            style={{width:"100%",padding:"8px 10px",background:T.surface,border:`1.5px solid #0EA5E9`,borderRadius:6,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",colorScheme:"dark"}}/>
                        )}
                        {c.type==="toggle" && (
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>updateChamp(c.key,true)} style={{flex:1,padding:"7px",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:12,border:`1.5px solid ${apercu.data[c.key]?"#EF4444":T.border}`,background:apercu.data[c.key]?"rgba(239,68,68,0.15)":T.surface,color:apercu.data[c.key]?"#EF4444":T.textMuted,fontFamily:"inherit"}}>Oui</button>
                            <button onClick={()=>updateChamp(c.key,false)} style={{flex:1,padding:"7px",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:12,border:`1.5px solid ${!apercu.data[c.key]?"#0EA5E9":T.border}`,background:!apercu.data[c.key]?"rgba(14,165,233,0.15)":T.surface,color:!apercu.data[c.key]?"#0EA5E9":T.textMuted,fontFamily:"inherit"}}>Non</button>
                          </div>
                        )}
                        {c.type==="select" && (
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {c.options.map(o=>(
                              <button key={o.id} onClick={()=>updateChamp(c.key,o.id)}
                                style={{padding:"6px 10px",borderRadius:20,cursor:"pointer",fontWeight:700,fontSize:11.5,border:`1.5px solid ${apercu.data[c.key]===o.id?"#0EA5E9":T.border}`,background:apercu.data[c.key]===o.id?"rgba(14,165,233,0.15)":T.surface,color:apercu.data[c.key]===o.id?"#0EA5E9":T.textMuted,fontFamily:"inherit"}}>{o.label}</button>
                            ))}
                          </div>
                        )}
                        {c.type==="multiselect" && (
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {c.options.map(o=>{
                              const actif = (apercu.data[c.key]||[]).includes(o.id);
                              return <button key={o.id} onClick={()=>toggleDansListe(c.key,o.id)}
                                style={{padding:"6px 10px",borderRadius:20,cursor:"pointer",fontWeight:700,fontSize:11.5,border:`1.5px solid ${actif?"#0EA5E9":T.border}`,background:actif?"rgba(14,165,233,0.15)":T.surface,color:actif?"#0EA5E9":T.textMuted,fontFamily:"inherit"}}>{actif?"✓ ":""}{o.label}</button>;
                            })}
                          </div>
                        )}
                        {c.type==="prestations" && (
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {PRESTATIONS.map(p=>{
                              const actif = (apercu.data.prestations||[]).some(x=>x.id===p.id);
                              return <button key={p.id} onClick={()=>togglePrestation(p.id)}
                                style={{padding:"6px 10px",borderRadius:20,cursor:"pointer",fontWeight:700,fontSize:11.5,border:`1.5px solid ${actif?p.color:T.border}`,background:actif?p.color+"22":T.surface,color:actif?p.color:T.textMuted,fontFamily:"inherit"}}>{actif?"✓ ":""}{p.icon} {p.label}</button>;
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setApercu(null);setEditKey(null);}} style={{flex:1,padding:"12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>← Retour</button>
              <button onClick={appliquer} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#10B981,#059669)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>✓ Appliquer au formulaire</button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>🎙️ Créer depuis un mémo vocal</div>
            <div style={{fontSize:12.5,color:T.textMuted,marginBottom:14}}>Dictez ce qu'il faut retenir — l'IA remplit le formulaire pour vous.</div>

            <div style={{display:"flex",gap:6,marginBottom:14,background:T.surface2,borderRadius:10,padding:4}}>
              <button onClick={()=>setMode("rdv")} disabled={recording||transcribing}
                style={{flex:1,padding:"9px",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:12.5,
                  background:mode==="rdv"?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",color:mode==="rdv"?"#fff":T.textMuted}}>📅 RDV rapide</button>
              <button onClick={()=>setMode("fiche")} disabled={recording||transcribing}
                style={{flex:1,padding:"9px",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:12.5,
                  background:mode==="fiche"?"linear-gradient(135deg,#0EA5E9,#6366F1)":"transparent",color:mode==="fiche"?"#fff":T.textMuted}}>🧾 Fiche complète</button>
            </div>
            <div style={{fontSize:11.5,color:T.textMuted,marginTop:-8,marginBottom:14}}>
              {mode==="rdv" ? "Pour prendre un rendez-vous : client, adresse, date/heure." : "Pour un compte-rendu après intervention : client, prestations concernées, constat et résultat."}
            </div>

            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"18px 0",marginBottom:14,background:T.surface2,borderRadius:12}}>
              <button onClick={recording?arreter:demarrer} disabled={transcribing}
                style={{width:72,height:72,borderRadius:"50%",border:"none",cursor:transcribing?"wait":"pointer",fontSize:28,
                  background: recording ? "linear-gradient(135deg,#EF4444,#DC2626)" : "linear-gradient(135deg,#0EA5E9,#6366F1)",
                  boxShadow: recording ? "0 0 0 8px rgba(239,68,68,0.15)" : "0 4px 14px rgba(14,165,233,0.3)",
                  color:"#fff", transition:"box-shadow .2s"}}>
                {recording ? "⏹️" : "🎙️"}
              </button>
              <div style={{fontSize:12.5,fontWeight:700,color:recording?"#EF4444":T.textMuted}}>
                {transcribing ? "⏳ Transcription en cours…" : recording ? `● Enregistrement — ${mmss(seconds)}` : texte.trim() ? "Appuyez pour compléter la dictée" : "Appuyez pour dicter"}
              </div>
              {dernierBlobRef.current && !recording && !transcribing && <div style={{fontSize:10.5,color:T.textFaint}}>🔊 Note vocale conservée avec la fiche</div>}
            </div>

            {erreur && <div style={{fontSize:12,color:"#EF4444",fontWeight:600,marginBottom:12}}>{erreur}</div>}

            <textarea value={texte} onChange={e=>setTexte(e.target.value)} rows={6} placeholder="Le texte dicté apparaît ici — vous pouvez le corriger avant d'analyser…"
              style={{width:"100%",padding:"10px 14px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",marginBottom:14,lineHeight:1.5}}/>

            <div style={{display:"flex",gap:8}}>
              <button onClick={annulerAvecLog} disabled={busy} style={{flex:1,padding:"12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
              <button onClick={analyser} disabled={busy||transcribing||recording} style={{flex:2,padding:"12px",background:busy?"rgba(14,165,233,0.3)":"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,cursor:busy?"wait":"pointer",fontFamily:"inherit"}}>{busy?"⏳ Analyse en cours…":"✨ Analyser"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Un message entier collé dans le champ adresse : on en extrait l'adresse seule
   et on renvoie le reste (étage, appartement, nature du problème...) pour la note. */
async function decouperCollage(texte) {
  const prompt = `Tu reçois un message concernant une intervention de plomberie/assainissement. Extrais-en les informations.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks, avec exactement ces clés (chaîne vide si absent) :
{"adresse":"l'adresse postale seule : numéro, rue, code postal, ville. Ajoute à la fin le nom de la résidence, le bâtiment, l'escalier et le numéro d'appartement s'ils sont donnés, séparés par une virgule. N'inclus JAMAIS le nom d'une personne, un téléphone, ni la description du problème.","tel":"le numéro de téléphone au format 06 00 00 00 00, vide si absent","note":"tout le reste de l'information utile : nature du problème, personne à contacter, étage, consignes d'accès, code. Phrases courtes. N'y remets pas l'adresse. Ignore les formules de politesse et ce que l'expéditeur dit qu'il va faire."}

Message :
${texte}`;
  const r = await fetch("/api/claude", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:600, messages:[{role:"user",content:prompt}] })
  });
  if(!r.ok) throw new Error("API "+r.status);
  const data = await r.json();
  const raw = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  return JSON.parse(raw);
}

function MailImport({ onExtracted, onCancel, theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [texte, setTexte] = useState("");
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const analyser = async () => {
    if(!texte.trim() && !img){dlgInfo("Collez le texte du mail ou ajoutez une capture d'écran.");return;}
    setBusy(true);
    try {
      const prompt = `Tu extrais les informations d'une demande d'intervention (plomberie/assainissement) reçue par mail ou message, pour créer un rendez-vous. Date du jour : ${today()}.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks, avec exactement ces clés (chaîne vide si l'info est absente) :
{"client":"UNIQUEMENT le nom de la société/syndic/copropriété à qui la facture doit être adressée — JAMAIS le nom d'une personne physique qui a envoyé ou signé le mail. Si un syndic/société est mentionné n'importe où dans le message (même juste en signature ou en-tête), c'est TOUJOURS lui qui va ici, pas l'expéditeur individuel.","contact":"nom de la personne physique qui a envoyé le mail ou du contact sur place, si différent du client (vide sinon)","tel":"téléphone","email":"email","adresse":"adresse complète du lieu où l'intervention doit avoir lieu (l'immeuble/le site concerné)","adresseFacturation":"adresse de facturation du client/syndic, UNIQUEMENT si elle est explicitement différente de l'adresse d'intervention (ex: adresse du siège du syndic dans son en-tête ou sa signature) — vide si non précisée ou identique à l'adresse d'intervention","dateRdv":"date au format YYYY-MM-DD (interprète 'demain', 'lundi prochain'... par rapport à la date du jour ; vide si aucune date)","heureRdv":"heure au format HH:MM (vide si absente)","note":"résumé en 1-2 phrases du problème ou de la demande"}`;
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
      onExtracted({ client:j.client||"", contact:j.contact||"", tel:j.tel||"", email:j.email||"", adresse:j.adresse||"", adresseFacturation:j.adresseFacturation||"",
        dateRdv:j.dateRdv||today(), heureRdv:j.heureRdv||"", noteRdv:j.note||"" });
    } catch(e) { dlgInfo("Erreur lors de l'analyse : "+(e?.message||e)); }
    setBusy(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:480,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>Créer un RDV depuis un mail</div>
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
  const [f, setF] = useState(initial || { client:"", adresse:"", adresseFacturation:"", contact:"", tel:"", technicien:"", dateRdv:today(), heureRdv:"", noteRdv:"", numeroOS:"", status:"planifie", type:"rdv", natureRdv:"intervention" });
  const [errors, setErrors] = useState({});
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  /* Collage d'un message entier dans l'adresse : proposer de le trier. */
  const collerAdresse = async (e) => {
    const t = e.clipboardData?.getData("text") || "";
    if (t.trim().length < 80) return;                    // collage court : comportement normal
    e.preventDefault();
    const brut = t.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    const ok = await dlgConfirm("Ce texte contient visiblement plus qu'une adresse. Je peux en extraire l'adresse et le téléphone, et mettre le reste dans les notes. Annuler collera le texte tel quel.",{titre:"Texte collé",valider:"Trier"});
    if (!ok) { set("adresse", brut); return; }
    try {
      const j = await decouperCollage(brut);
      set("adresse", j.adresse || brut);
      if (j.tel) setF(p=>({...p, tel: p.tel || j.tel}));
      if (j.note) setF(p=>({...p, noteRdv: [p.noteRdv, j.note].filter(Boolean).join(" — ")}));
    } catch (err) {
      set("adresse", brut);
      dlgInfo("Le tri automatique n'a pas fonctionné ("+(err?.message||err)+"). Le texte a été collé tel quel.","Tri impossible");
    }
  };

  const inpStyle = (err) => ({ width:"100%", padding:"10px 14px", background:T.surface2, border:`1.5px solid ${err?"#EF4444":T.border}`, borderRadius:8, color:T.text, fontSize:13.5, outline:"none", boxSizing:"border-box", fontFamily:"inherit" });
  const lblStyle = { display:"block", fontSize:9.5, fontWeight:700, color:T.textMuted, letterSpacing:".08em", textTransform:"uppercase", marginBottom:6 };

  /* Toutes les adresses connues d'un même client (un syndic en a plusieurs). */
  const clients = useMemo(()=>{
    const map={};
    fiches.forEach(f=>{
      if(!f.client)return;
      const k=f.client.toLowerCase();
      if(!map[k])map[k]={client:f.client,tel:"",adresses:[]};
      const e=map[k];
      e.tel=e.tel||f.tel||"";
      if(f.adresse&&!e.adresses.some(a=>a.toLowerCase()===f.adresse.toLowerCase()))e.adresses.push(f.adresse);
    });
    return Object.values(map).map(c=>({...c,adresse:c.adresses[0]||""}));
  },[fiches]);
  const [acOpen, setAcOpen] = useState(false);
  const acRef = useRef();
  const suggestions = useMemo(()=>{if(!f.client||f.client.length<2)return[];return clients.filter(c=>c.client.toLowerCase().includes(f.client.toLowerCase())).slice(0,5);},[f.client,clients]);
  const [adrOpen, setAdrOpen] = useState(false);
  const adressesConnues = useMemo(()=>{const map={};fiches.forEach(x=>{if(x.adresse)map[x.adresse.toLowerCase()]=x.adresse;});return Object.values(map);},[fiches]);
  const adressesDuClient = useMemo(()=>{const c=clients.find(x=>x.client.toLowerCase()===(f.client||"").trim().toLowerCase());return c?c.adresses:[];},[f.client,clients]);
  const adrSuggestions = useMemo(()=>{
    const saisie=(f.adresse||"").trim().toLowerCase();
    const filtre=a=>(!saisie||a.toLowerCase().includes(saisie))&&a.toLowerCase()!==saisie;
    const propres=adressesDuClient.filter(filtre);
    if(saisie.length<3)return propres.slice(0,6);
    const autres=adressesConnues.filter(a=>filtre(a)&&!propres.some(x=>x.toLowerCase()===a.toLowerCase()));
    return [...propres,...autres].slice(0,6);
  },[f.adresse,adressesConnues,adressesDuClient]);
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
    const num = normaliserTel(f.tel);
    if(canal==="whatsapp") window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
    if(canal==="sms") window.location.href=`sms:+${num}?&body=${encodeURIComponent(msg)}`;
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
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>set("natureRdv","intervention")}
            style={{flex:1,padding:"10px 14px",borderRadius:9,cursor:"pointer",fontWeight:800,fontSize:13,fontFamily:"inherit",border:`1.5px solid ${(f.natureRdv||"intervention")==="intervention"?"#3B82F6":T.border}`,background:(f.natureRdv||"intervention")==="intervention"?"rgba(59,130,246,0.12)":T.surface2,color:(f.natureRdv||"intervention")==="intervention"?"#3B82F6":T.textMuted}}>
            🔧 Intervention
          </button>
          <button onClick={()=>set("natureRdv","devis")}
            style={{flex:1,padding:"10px 14px",borderRadius:9,cursor:"pointer",fontWeight:800,fontSize:13,fontFamily:"inherit",border:`1.5px solid ${f.natureRdv==="devis"?"#F59E0B":T.border}`,background:f.natureRdv==="devis"?"rgba(245,158,11,0.12)":T.surface2,color:f.natureRdv==="devis"?"#F59E0B":T.textMuted}}>
            💰 Devis (visite pour chiffrer)
          </button>
        </div>
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
                  <div key={i} onMouseDown={()=>{setF(p=>({...p,client:c.client,tel:c.tel||p.tel,adresse:p.adresse||(c.adresses.length===1?c.adresses[0]:"")}));setAcOpen(false);if(c.adresses.length>1)setTimeout(()=>setAdrOpen(true),80);}}
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
            <textarea value={f.adresse} onChange={e=>{set("adresse",e.target.value.replace(/\n/g," "));setAdrOpen(true);}} onFocus={()=>setAdrOpen(true)} onBlur={()=>setTimeout(()=>setAdrOpen(false),180)} onPaste={collerAdresse}
              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.target.blur();}}} rows={2}
              placeholder="Adresse complète" style={{...inpStyle(),resize:"none",minHeight:62,lineHeight:1.4,fontFamily:"inherit"}} autoComplete="off"/>
            {adrOpen&&adrSuggestions.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:30,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,marginTop:4,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.3)"}}>
                {adrSuggestions.map((a,i)=>(
                  <div key={i} onMouseDown={()=>{set("adresse",a);setAdrOpen(false);}} style={{padding:"9px 12px",fontSize:13,color:T.text,cursor:"pointer",borderBottom:i<adrSuggestions.length-1?`1px solid ${T.border}`:"none"}}>📍 {a}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <div style={lblStyle}>📋 N° d'ordre de service</div>
            <input value={f.numeroOS||""} onChange={e=>set("numeroOS",e.target.value)} placeholder="Ex : OS-2026-1234" style={inpStyle()}/>
            <div style={{fontSize:11,color:T.textMuted,marginTop:5,fontWeight:500}}>Référence de la demande client, pour la retrouver facilement à la facturation.</div>
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
function ReportPreview({ fiche, onClose, parametresMessages = {modeles:MODELES_MESSAGE_DEFAUT}, onMarquerEnvoye = null }) {
  const [versionInterne, setVersionInterne] = useState(false);
  const [dl, setDl] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);
  // Aperçu WhatsApp/SMS : l'état vit ici, dans le composant qui contient les boutons.
  const [apercuEnvoi, setApercuEnvoi] = useState(null);

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
          <button onClick={()=>setApercuEnvoi({type:"whatsapp",modeleIdx:0,texte:appliquerModeleMessage(parametresMessages.modeles[0]?.texte,fiche)})} style={{padding:"8px 16px",background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🟢 WhatsApp</button>
          <button onClick={()=>setApercuEnvoi({type:"sms",modeleIdx:0,texte:appliquerModeleMessage(parametresMessages.modeles[0]?.texte,fiche)})} style={{padding:"8px 16px",background:"#334155",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>💬 SMS</button>
          <button onClick={()=>{download();envoyerRapportArchivageInterne(fiche,true);}} style={{padding:"8px 16px",background:"#1E293B",border:"1px solid #F97316",color:"#F97316",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📧 Archiver (interne A6T)</button>
        </div>
      )}
      <div style={{background:"rgba(16,185,129,0.06)",borderBottom:"1px solid rgba(16,185,129,0.2)",padding:"6px 16px",fontSize:11,color:"#6EE7B7"}}>
        ℹ️ Aucun envoi automatique au client — le rapport n'est transmis que si vous cliquez vous-même sur WhatsApp ou SMS ci-dessus.
      </div>
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
      {apercuEnvoi && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setApercuEnvoi(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0A1525",border:"1px solid #1a3050",borderRadius:16,padding:22,width:460,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontWeight:800,fontSize:16,color:"#E2E8F0",marginBottom:4}}>{apercuEnvoi.type==="whatsapp"?"🟢 Aperçu — message WhatsApp":"💬 Aperçu — message SMS"}</div>
            <div style={{fontSize:11.5,color:"#64748B",marginBottom:10}}>Vérifie et corrige si besoin — rien n'est envoyé tant que tu n'as pas confirmé.</div>
            {parametresMessages.modeles.length>1&&(
              <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                {parametresMessages.modeles.map((m,i)=>(
                  <button key={i} onClick={()=>setApercuEnvoi(a=>({...a,modeleIdx:i,texte:appliquerModeleMessage(m.texte,fiche)}))}
                    style={{fontSize:11.5,fontWeight:700,padding:"5px 12px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
                      background:apercuEnvoi.modeleIdx===i?"#0EA5E9":"#0B1829",color:apercuEnvoi.modeleIdx===i?"#fff":"#64748B",border:`1px solid ${apercuEnvoi.modeleIdx===i?"#0EA5E9":"#1a3050"}`}}>
                    {m.nom||`Modèle ${i+1}`}
                  </button>
                ))}
              </div>
            )}
            <textarea value={apercuEnvoi.texte} onChange={e=>setApercuEnvoi(a=>({...a,texte:e.target.value}))} rows={10} style={{width:"100%",padding:"10px 12px",background:"#0B1829",border:"1px solid #1a3050",borderRadius:8,color:"#E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={()=>setApercuEnvoi(null)} style={{flex:1,padding:"11px",borderRadius:9,border:"1px solid #1a3050",background:"none",color:"#64748B",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
              <button onClick={()=>{
                if(apercuEnvoi.type==="whatsapp") envoyerRapportWhatsApp(fiche, apercuEnvoi.texte);
                else envoyerRapportSMS(fiche, apercuEnvoi.texte);
                onMarquerEnvoye&&onMarquerEnvoye(fiche);
                setApercuEnvoi(null);
              }} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:apercuEnvoi.type==="whatsapp"?"linear-gradient(135deg,#25D366,#128C7E)":"#334155",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                ✅ Confirmer et envoyer
              </button>
            </div>
          </div>
        </div>
      )}
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
          {label:"En retard",val:fiches.filter(estEnRetard).length,icon:"⏰",color:"#EF4444",action:()=>onFilterStatus("__retard")},
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
            <div style={{position:"absolute",top:-8,right:-8,fontSize:42,opacity:.14}}>{k.icon}</div>
            <div style={{fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:6}}>{k.label}</div>
            <div style={{fontSize:30,fontWeight:800,color:k.color,lineHeight:1}}>{k.val}</div>
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
            <input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0];if(file){const r=await resizePhoto(file);setTachePhoto(r.data);}}}/>
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
              {f.tel&&<a href={telHref(f.tel)} style={{fontSize:11,color:"#10B981",fontWeight:600,textDecoration:"none"}}>📞 {f.tel}</a>}
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
function AgendaCarte({ fiche, onSelect, onDemarrer, T, etat, techniciens=[], techColors={}, onReplanifier }) {
  /* La date et l'heure se modifient directement sur la carte : le cas le plus
     fréquent est un simple report, inutile d'ouvrir la fiche pour ça. */
  const [replan, setReplan] = useState(false);
  const [dTmp, setDTmp] = useState(fiche.dateRdv || "");
  const [hTmp, setHTmp] = useState(fiche.heureRdv || "");
  useEffect(()=>{ setDTmp(fiche.dateRdv||""); setHTmp(fiche.heureRdv||""); },[fiche.dateRdv,fiche.heureRdv]);
  const isRdv = fiche.type==="rdv"||(fiche.status==="planifie"&&!fiche.prestations?.length);
  const isDevis = isRdv && fiche.natureRdv==="devis";
  const prestas = fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
  const aProg = estAProgrammer(fiche);
  const e = aProg ? "prog" : (etat || (isRdv?"rdv":"complete"));
  const COUL = { rdv: isDevis?"#F59E0B":"#3B82F6", complete:"#10B981", prog:"#64748B" };
  const BADGE = { rdv: isDevis?{t:"💰 Devis à faire",c:"#F59E0B"}:{t:"📅 RDV à faire",c:"#3B82F6"}, complete:{t:"✅ Terminée",c:"#10B981"}, prog:{t:"📌 À planifier",c:"#64748B"} };
  const badgeInfo = (e==="complete" && fiche.status==="a_prevoir") ? {t:"⚠️ Retour à prévoir",c:"#F97316"}
    : (e==="complete" && fiche.status==="annule") ? {t:"✕ Annulée",c:"#EF4444"}
    : BADGE[e];
  const accent = COUL[e];
  const tColor = fiche.technicien ? techColor(fiche.technicien, techniciens, techColors) : null;
  return(
    <div style={{background:fiche.urgent?"rgba(239,68,68,0.06)":T.surface,border:`1px solid ${fiche.urgent?"rgba(239,68,68,0.35)":T.border}`,borderLeft:`7px solid ${fiche.urgent?"#EF4444":accent}`,borderRadius:12,padding:"12px 14px",marginBottom:9}}>
      {/* Nom du client sur toute la largeur : dans la colonne du milieu il se coupait en deux. */}
      <div onClick={()=>onSelect(fiche)} style={{cursor:"pointer",marginBottom:9}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:5}}>
      <div style={{fontWeight:700,fontSize:16.5,color:T.text,overflowWrap:"anywhere",lineHeight:1.25}}>{fiche.client||"Client non renseigné"}</div>
      <span style={{fontSize:11,fontWeight:800,color:badgeInfo.c,background:badgeInfo.c+"1A",padding:"3px 9px",borderRadius:11,whiteSpace:"nowrap"}}>{badgeInfo.t}</span>
      {fiche.photos?.length>0&&<span title={`${fiche.photos.length} photo(s)`} style={{fontSize:11,fontWeight:800,color:"#A78BFA",whiteSpace:"nowrap"}}>📷 {fiche.photos.length}</span>}
      {(fiche.journalAppels||[]).length>0 && (()=>{
      const dernier = fiche.journalAppels[fiche.journalAppels.length-1];
      const meta = {pas_de_reponse:{label:"❌ Pas de réponse",color:"#EF4444"},reussi:{label:"✅ Contact pris",color:"#10B981"},message_laisse:{label:"📧 Messagerie",color:"#F59E0B"},injoignable:{label:"📵 Injoignable",color:"#64748B"}}[dernier.resultat]||{label:dernier.resultat,color:T.textMuted};
      return <span title={dernier.note||""} style={{fontSize:11,fontWeight:800,color:meta.color,background:meta.color+"1A",padding:"3px 9px",borderRadius:11,whiteSpace:"nowrap"}}>{meta.label}</span>;
      })()}
      </div>
      </div>
    <div style={{display:"flex",alignItems:"center",gap:14}}>
      <div style={{textAlign:"center",minWidth:66,flexShrink:0,cursor:onReplanifier?"pointer":"default"}}
        onClick={e=>{if(onReplanifier){e.stopPropagation();setReplan(v=>!v);}}}>
        {fiche.dateRdv&&<div style={{fontSize:11.5,fontWeight:800,color:T.textMuted,whiteSpace:"nowrap"}}>{new Date(fiche.dateRdv).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"})}</div>}
        <div style={{fontSize:19,fontWeight:800,color:isDevis?"#F59E0B":(isRdv?"#3B82F6":"#0EA5E9")}}>{fiche.heureRdv||"--:--"}</div>
        <div style={{fontSize:10.5,fontWeight:700,marginTop:3,color:aProg?"#64748B":(isDevis?"#F59E0B":(isRdv?"#3B82F6":STATUTS[fiche.status]?.color))}}>{aProg?"📌 À planifier":(isDevis?"💰 Devis":(isRdv?"📅 RDV":`● ${STATUTS[fiche.status]?.label}`))}</div>
        {fiche.urgent&&<div style={{fontSize:10.5,color:"#fff",fontWeight:800,marginTop:4,background:"#EF4444",padding:"2px 8px",borderRadius:10,whiteSpace:"nowrap"}}>🚨 URGENCE</div>}
      </div>
      <div style={{width:1,height:44,background:T.border}}/>
      {replan?(
        <div style={{flex:1,minWidth:0}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:10,fontWeight:800,color:T.textMuted,letterSpacing:".06em",textTransform:"uppercase",marginBottom:6}}>Nouvelle date</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input type="date" value={dTmp} onChange={e=>setDTmp(e.target.value)}
              style={{flex:1,minWidth:0,padding:"9px 10px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
            <input type="time" value={hTmp} onChange={e=>setHTmp(e.target.value)}
              style={{width:104,flexShrink:0,padding:"9px 10px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>{onReplanifier(fiche,dTmp,hTmp);setReplan(false);}}
              style={{flex:1,padding:"9px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>Enregistrer</button>
            <button onClick={()=>{setDTmp(fiche.dateRdv||"");setHTmp(fiche.heureRdv||"");setReplan(false);}}
              style={{padding:"9px 14px",background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMuted,fontWeight:700,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
          </div>
        </div>
      ):(
      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onSelect(fiche)}>
        {(fiche.tempsInterne||fiche.majorations?.length>0)&&(
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:5}}>
            {fiche.tempsInterne&&<span style={{fontSize:12,fontWeight:800,color:"#F59E0B",background:"rgba(245,158,11,0.14)",padding:"4px 10px",borderRadius:13,whiteSpace:"nowrap"}}>⏱️ {fiche.tempsInterne}</span>}
            {fiche.majorations?.includes("soir50")&&<span style={{fontSize:12,fontWeight:800,color:"#F59E0B",background:"rgba(245,158,11,0.14)",padding:"4px 9px",borderRadius:13,whiteSpace:"nowrap"}}>🌙 +50%</span>}
            {fiche.majorations?.includes("weekend100")&&<span style={{fontSize:12,fontWeight:800,color:"#EF4444",background:"rgba(239,68,68,0.14)",padding:"4px 9px",borderRadius:13,whiteSpace:"nowrap"}}>🌃 +100%</span>}
          </div>
        )}
        <div style={{fontSize:13,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>
          {fiche.adresse
            ? <span onClick={e=>{e.stopPropagation();window.open(`https://waze.com/ul?navigate=yes&q=${encodeURIComponent(fiche.adresse)}`,"_blank");}} style={{cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>📍 {fiche.adresse}</span>
            : "📍 —"}
          {fiche.technicien?` · 👤 ${fiche.technicien}`:""}
        </div>
        {fiche.tel&&(
          <a href={telHref(fiche.tel)} onClick={e=>e.stopPropagation()} style={{fontSize:13,color:"#0EA5E9",fontWeight:600,textDecoration:"none"}}>📞 {fiche.tel}</a>
        )}
        {fiche.technicien&&tColor&&(
          <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,fontWeight:700,color:tColor,background:tColor+"1A",padding:"3px 10px",borderRadius:13,marginTop:4}}>
            👤 {fiche.technicien} {fiche.priseEnCharge?"✅":"⏳"}
          </span>
        )}
        {!fiche.technicien&&(
          <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,fontWeight:700,color:"#0EA5E9",background:"rgba(14,165,233,0.12)",padding:"3px 10px",borderRadius:13,marginTop:4}}>
            🆓 Libre
          </span>
        )}
        {fiche.numeroOS&&(
          <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,fontWeight:700,color:"#A78BFA",background:"rgba(167,139,250,0.12)",padding:"3px 10px",borderRadius:13,marginTop:4}}>
            📋 {fiche.numeroOS}
          </span>
        )}
        {fiche.typesIntervention?.length>0&&(
          <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
            {fiche.typesIntervention.map(id=>{const p=PRESTATIONS.find(x=>x.id===id);return p?<span key={id} style={{fontSize:11.5,fontWeight:600,color:p.color,background:p.color+"18",padding:"2px 9px",borderRadius:13}}>{p.icon} {p.label}</span>:null;})}
          </div>
        )}
      </div>
      )}
      {!replan&&!isRdv&&(
        <button onClick={(ev)=>{ev.stopPropagation();telechargerPDF(buildReportHTML(fiche,true),`Rapport-${fiche.id}.pdf`);}}
          title="Ouvrir le PDF du rapport"
          style={{padding:"7px 12px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>📄 PDF</button>
      )}
      {!replan&&isRdv&&<button onClick={()=>onDemarrer(fiche)} style={{padding:"7px 14px",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>▶ Démarrer</button>}
    </div>
    </div>
  );
}

function Agenda({ fiches, onSelect, onDemarrer, onNewRdv, onProgrammer, actionsCreation, theme, techniciens=[], techColors={}, jour, onJour, absences=[], onSaveAbsence, onDeleteAbsence, onReplanifier }) {
  const T = THEMES[theme] || THEMES.dark;
  const todayStr = today();
  /* Le jour affiché est mémorisé par le parent : l'agenda est démonté quand on ouvre une
     fiche, donc un état local repartirait sur aujourd'hui à chaque retour. */
  const [selDayLocal, setSelDayLocal] = useState(todayStr);
  const selDay = jour || selDayLocal;
  const setSelDay = (d) => { setSelDayLocal(d); if(onJour) onJour(d); };

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

  // Absences : marquage discret sur les cases de la semaine ; la saisie se fait dans Administration.
  const absentsLe = (d) => techniciens.filter(t=>estAbsent(t, d, absences));

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
        <div style={{flex:1,textAlign:"center",fontWeight:600,fontSize:16,color:T.text,textTransform:"capitalize"}}>{labelSemaine}</div>
        <button onClick={()=>navSemaine(1)} style={{width:38,height:38,borderRadius:8,border:`1px solid ${T.border}`,background:T.surface,color:T.text,cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>▶</button>
      </div>
      {/* Retour à la semaine en cours : proposé seulement quand on l'a quittée,
         pour laisser toute la largeur à la date le reste du temps. */}
      {!semaine.includes(todayStr)&&(
        <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
          <button onClick={()=>setSelDay(todayStr)} style={{padding:"7px 16px",borderRadius:8,border:`1px solid #0EA5E9`,background:"rgba(14,165,233,0.1)",color:"#0EA5E9",cursor:"pointer",fontSize:12,fontWeight:800,fontFamily:"inherit"}}>Revenir à aujourd'hui</button>
        </div>
      )}

      {/* Bande semaine : 7 jours */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:16}}>
        {semaine.map((d,i)=>{
          const evts = byDay[d]||[];
          const isToday = d===todayStr, isSel = d===selDay;
          const abs = absentsLe(d);
          return (
            <div key={d} onClick={()=>{setSelDay(d);if(!evts.length&&onNewRdv)onNewRdv(d);}}
              style={{borderRadius:10,padding:"8px 2px 7px",cursor:"pointer",textAlign:"center",minHeight:62,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",gap:3,
                border:`1.5px solid ${isSel?"#0EA5E9":isToday?"rgba(16,185,129,0.5)":abs.length?"rgba(245,158,11,0.45)":T.border}`,
                background:isSel?"rgba(14,165,233,0.14)":isToday?"rgba(16,185,129,0.07)":abs.length?"rgba(245,158,11,0.09)":T.surface}}
              title={abs.length?`Absent${abs.length>1?"s":""} : ${abs.join(", ")}`:undefined}>
              <div style={{fontSize:11,fontWeight:600,color:T.textMuted}}>{jours[i]}</div>
              <div style={{fontSize:18,fontWeight:isToday||isSel?700:500,color:isToday?"#10B981":isSel?"#0EA5E9":T.text}}>{parseInt(d.slice(8))}</div>
              <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"center",minHeight:6}}>
                {evts.slice(0,3).map((f,k)=><span key={k} style={{width:5,height:5,borderRadius:"50%",background:f.technicien?techColor(f.technicien,techniciens,techColors):colorOf(f),display:"inline-block"}}/>)}
              </div>
              {evts.length>0&&<div style={{fontSize:8.5,fontWeight:800,color:isSel?"#0EA5E9":T.textMuted}}>{evts.length}</div>}
              {abs.length>0&&<div style={{fontSize:8.5,fontWeight:800,color:"#F59E0B",lineHeight:1.1}}>🌴{abs.length>1?abs.length:""}</div>}
            </div>
          );
        })}
      </div>

      {/* Légende techniciens */}
      {techniciens.filter(t=>fiches.some(f=>f.technicien===t)).length>0&&(
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14,justifyContent:"center"}}>
          {techniciens.filter(t=>fiches.some(f=>f.technicien===t)).map(t=>(
            <span key={t} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.text,fontWeight:600}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:techColor(t,techniciens,techColors),display:"inline-block",opacity:estAbsent(t,selDay,absences)?.35:1}}/>
              <span style={estAbsent(t,selDay,absences)?{textDecoration:"line-through",opacity:.55}:undefined}>{t}</span>
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

      {/* Créations : juste sous la semaine, là où on les cherche. */}
      {actionsCreation}

      {/* Jour sélectionné */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{background:selDay===todayStr?"linear-gradient(135deg,#10B981,#059669)":"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",borderRadius:10,padding:"7px 15px",fontWeight:600,fontSize:13}}>
          {selDay===todayStr?"Aujourd'hui":dateFr(selDay)}
        </div>
        <div style={{flex:1,height:1,background:T.border}}/>
        <span style={{fontSize:12,color:T.textMuted}}>{dayFiches.length} RDV</span>
      </div>
      {dayFiches.length===0
        ? <div onClick={()=>onNewRdv&&onNewRdv(selDay)} style={{textAlign:"center",padding:"24px",color:T.textMuted,fontSize:13,background:T.surface,border:`1px dashed ${T.border}`,borderRadius:12,cursor:onNewRdv?"pointer":"default"}}>Rien de prévu ce jour{onNewRdv?" — touchez pour ajouter ➕":""}</div>
        : dayFiches.map(fiche=><AgendaCarte key={fiche.id} fiche={fiche} etat={etatFiche(fiche)} onSelect={onSelect} onDemarrer={onDemarrer} T={T} techniciens={techniciens} techColors={techColors} onReplanifier={onReplanifier}/>)}

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
              <AgendaCarte fiche={fiche} etat={etatFiche(fiche)} onSelect={onSelect} onDemarrer={onDemarrer} T={T} techniciens={techniciens} techColors={techColors} onReplanifier={onReplanifier}/>
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

function CarteFiche({ fiche, onSelect, onDelete, T, selectionMode=false, coche=false, onToggleCoche }) {
  const prestas=fiche.prestations?.map(p=>PRESTATIONS.find(x=>x.id===p.id)).filter(Boolean)||[];
  const main=prestas[0];
  const aProg = estAProgrammer(fiche);
  const statutLabel = aProg ? "À planifier" : STATUTS[fiche.status]?.label;
  const statutColor = aProg ? "#64748B" : STATUTS[fiche.status]?.color;
  return(
    <div onClick={()=>selectionMode?onToggleCoche(fiche.id):onSelect(fiche)} style={{background:T.surface,border:`1px solid ${selectionMode&&coche?"#0EA5E9":T.border}`,borderRadius:14,padding:"16px 18px",cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden",boxShadow:selectionMode&&coche?"0 0 0 2px rgba(14,165,233,0.35) inset":"none"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=main?.color||"#0EA5E9";e.currentTarget.style.transform="translateY(-2px)";}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${aProg?"#64748B":(main?.color||"#0EA5E9")},transparent)`}}/>
      {fiche.urgent&&<div style={{position:"absolute",top:8,right:8,fontSize:10,fontWeight:700,color:"#EF4444",background:"rgba(239,68,68,0.1)",padding:"2px 8px",borderRadius:12}}>🚨 Urgence</div>}
      {selectionMode&&(
        <div style={{position:"absolute",top:8,left:8,width:20,height:20,borderRadius:6,border:`2px solid ${coche?"#0EA5E9":T.border}`,background:coche?"#0EA5E9":"transparent",color:"#fff",fontSize:13,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>{coche?"✓":""}</div>
      )}
      <div style={{fontFamily:"monospace",fontSize:10,color:"#0EA5E9",fontWeight:700,marginBottom:3,marginLeft:selectionMode?26:0}}>{fiche.id}</div>
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
        <span>{fiche.technicien&&`👤 ${fiche.technicien} ${fiche.priseEnCharge?"✅":"⏳"}`}</span>
        <span style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:statutColor}}>{aProg?"📌":"●"} {statutLabel}</span>
          {fiche.signature&&"· ✍️"}
          {fiche.photos?.length>0&&<span title={`${fiche.photos.length} photo(s)`} style={{fontSize:11,fontWeight:700,color:"#A78BFA",display:"flex",alignItems:"center",gap:2}}>📷 {fiche.photos.length}</span>}
          {fiche.prestations?.length>0&&<button onClick={e=>{e.stopPropagation();telechargerPDF(buildReportHTML(fiche,true),`Rapport-${fiche.id}.pdf`);}} title="Ouvrir le PDF du rapport" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#0EA5E9",padding:"0 2px",fontFamily:"inherit",fontWeight:700}}>📄</button>}
          {onDelete&&<button onClick={e=>{e.stopPropagation();onDelete(fiche);}} title="Supprimer" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#EF4444",padding:"0 2px",fontFamily:"inherit"}}>🗑️</button>}
        </span>
      </div>
    </div>
  );
}

function ListeCartes({ fiches, onSelect, onDelete, theme, techniciens=[], techTels={} }) {
  const T = THEMES[theme] || THEMES.dark;
  /* Sélection multiple : sert à relancer un technicien sur plusieurs fiches non terminées
     d'un seul message, plutôt que de les lui renvoyer une par une. */
  const [selectionMode, setSelectionMode] = useState(false);
  const [coches, setCoches] = useState([]);
  const [destinataire, setDestinataire] = useState("");
  const toggleCoche = (id) => setCoches(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const quitterSelection = () => { setSelectionMode(false); setCoches([]); setDestinataire(""); };
  const fichesCochees = fiches.filter(f=>coches.includes(f.id));

  const messageRelance = () => [
    `📋 Fiches en attente — merci de les compléter`,
    ``,
    ...fichesCochees.map(f=>`• ${f.id} — ${f.client||"Client"}${f.adresse?` · ${f.adresse}`:""}${f.dateRdv?` · ${dateFr(f.dateRdv)}`:""}`),
    ``,
    `Merci de faire le nécessaire dès que possible.`,
  ].join("\n");

  const envoyerRelance = (canal) => {
    if(!fichesCochees.length){dlgInfo("Sélectionnez au moins une fiche.");return;}
    const num = normaliserTel(techTels[logoKey(destinataire)]||"");
    if(!num){dlgInfo(`Aucun numéro enregistré pour ${destinataire||"ce technicien"}. Renseignez-le dans Administration → Techniciens.`);return;}
    const msg = messageRelance();
    if(canal==="whatsapp") window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,"_blank");
    else window.location.href=`sms:+${num}?&body=${encodeURIComponent(msg)}`;
  };

  if(fiches.length===0) return <Empty icon="📭" text="Aucune fiche trouvée" T={T}/>;
  /* Regroupement par échéance : les fiches passées non traitées ne doivent plus être
     noyées au milieu des interventions à venir. */
  const jour = today();
  const clos = (f) => f.status==="termine" || f.status==="annule";
  const aProgrammer = fiches.filter(estAProgrammer);
  const reste = fiches.filter(f=>!estAProgrammer(f));
  const enRetard = reste.filter(estEnRetard).sort((a,b)=>a.dateRdv.localeCompare(b.dateRdv));
  const aujourdhui = reste.filter(f=>f.dateRdv===jour && !clos(f)).sort((a,b)=>(a.heureRdv||"").localeCompare(b.heureRdv||""));
  const aVenir = reste.filter(f=>f.dateRdv && f.dateRdv>jour && !clos(f)).sort((a,b)=>a.dateRdv.localeCompare(b.dateRdv));
  const sansDate = reste.filter(f=>!f.dateRdv && !clos(f));
  const terminees = reste.filter(clos).sort((a,b)=>(b.dateRdv||"").localeCompare(a.dateRdv||""));
  const bloc = (titre, arr, couleurs) => arr.length>0 && (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{background:`linear-gradient(135deg,${couleurs[0]},${couleurs[1]})`,color:"#fff",borderRadius:10,padding:"6px 14px",fontWeight:800,fontSize:13}}>{titre}</div>
        <div style={{flex:1,height:1,background:T.border}}/>
        <span style={{fontSize:12,color:T.textMuted}}>{arr.length} fiche(s)</span>
      </div>
      {grille(arr)}
    </div>
  );
  const grille = (arr) => (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
      {arr.map(fiche=><CarteFiche key={fiche.id} fiche={fiche} onSelect={onSelect} onDelete={onDelete} T={T}
        selectionMode={selectionMode} coche={coches.includes(fiche.id)} onToggleCoche={toggleCoche}/>)}
    </div>
  );
  return (
    <div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
        <button onClick={()=>selectionMode?quitterSelection():setSelectionMode(true)}
          style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${selectionMode?"#0EA5E9":T.border}`,background:selectionMode?"rgba(14,165,233,0.12)":"none",color:selectionMode?"#0EA5E9":T.textMuted,fontWeight:800,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>
          {selectionMode?"✕ Quitter la sélection":"☑️ Sélectionner des fiches"}
        </button>
        {selectionMode&&(
          <>
            <span style={{fontSize:12,color:T.textMuted,fontWeight:700}}>{coches.length} sélectionnée(s)</span>
            <button onClick={()=>setCoches(fiches.map(f=>f.id))} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:"none",color:T.textMuted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Tout cocher</button>
            <button onClick={()=>setCoches([])} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:"none",color:T.textMuted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Tout décocher</button>
          </>
        )}
      </div>
      {selectionMode&&coches.length>0&&(
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={destinataire} onChange={e=>setDestinataire(e.target.value)}
            style={{padding:"9px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>
            <option value="">— Envoyer à —</option>
            {techniciens.map(t=><option key={t} value={t}>{t}{techTels[logoKey(t)]?"":" (sans n°)"}</option>)}
          </select>
          <button onClick={()=>envoyerRelance("whatsapp")} disabled={!destinataire}
            style={{padding:"9px 16px",borderRadius:8,border:"none",background:destinataire?"linear-gradient(135deg,#25D366,#128C7E)":T.surface2,color:destinataire?"#fff":T.textMuted,fontWeight:800,fontSize:13,cursor:destinataire?"pointer":"not-allowed",fontFamily:"inherit"}}>🟢 WhatsApp</button>
          <button onClick={()=>envoyerRelance("sms")} disabled={!destinataire}
            style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${T.border}`,background:"none",color:destinataire?T.text:T.textMuted,fontWeight:800,fontSize:13,cursor:destinataire?"pointer":"not-allowed",fontFamily:"inherit"}}>💬 SMS</button>
        </div>
      )}
      {bloc("En retard — non traitées", enRetard, ["#EF4444","#B91C1C"])}
      {bloc("Aujourd'hui", aujourdhui, ["#F59E0B","#D97706"])}
      {bloc("À venir", aVenir, ["#0EA5E9","#6366F1"])}
      {bloc("À planifier", aProgrammer, ["#64748B","#475569"])}
      {bloc("Sans date", sansDate, ["#64748B","#475569"])}
      {bloc("Terminées et annulées", terminees, ["#10B981","#059669"])}
    </div>
  );
}

/* ═══════════════════════════════════════════
   HISTORIQUE DES MÉMOS VOCAUX
═══════════════════════════════════════════ */
function MemosVocauxView({ memos = [], theme, onReprendre }) {
  const T = THEMES[theme] || THEMES.dark;
  if(memos.length===0) return <Empty icon="🎙️" text="Aucun mémo vocal enregistré pour l'instant" T={T}/>;
  const BADGE = { applique:{t:"✅ Appliqué",c:"#10B981"}, abandonne:{t:"✕ Abandonné",c:"#EF4444"}, en_attente_analyse:{t:"⏳ En attente d'analyse",c:"#F59E0B"} };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {memos.map(m=>{
        const b = BADGE[m.statut]||BADGE.abandonne;
        return (
          <div key={m.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
              <span style={{fontSize:10.5,fontWeight:800,color:b.c,background:b.c+"1A",padding:"2px 9px",borderRadius:12}}>{b.t}</span>
              <span style={{fontSize:10.5,fontWeight:700,color:T.textMuted}}>{m.mode==="rdv"?"📅 RDV rapide":"🧾 Fiche complète"}</span>
              {m.client&&<span style={{fontSize:11,fontWeight:700,color:T.text}}>👤 {m.client}</span>}
              <span style={{fontSize:10.5,color:T.textFaint,marginLeft:"auto"}}>{new Date(m.ts).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
            </div>
            <div style={{fontSize:12.5,color:T.textMuted,lineHeight:1.5,marginBottom:m.statut!=="applique"?10:0}}>{m.texte}</div>
            {m.statut!=="applique"&&(
              <button onClick={()=>onReprendre(m)} style={{padding:"6px 12px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:7,color:"#fff",fontWeight:700,fontSize:11.5,cursor:"pointer",fontFamily:"inherit"}}>🔁 Reprendre cette dictée</button>
            )}
          </div>
        );
      })}
    </div>
  );
}


function DetailFiche({ fiche, onBack, onEdit, onDelete, onDemarrer, onCreateDevis, onToggleFacturation, onDuplicate, theme, techTels = {}, onSaveTechTel = null, sousTraitants = [], onSaveSousTraitants = null, monTechnicien = null, onClaim = null, onConfirmerPriseEnCharge = null, onMarquerEnvoye = null, onLoguerAppel = null, onAjouterCommentaire = null, onModifierCommentaire = null, onSupprimerAppel = null, onPreparerFacturePennylane = null, onEnvoyerFacturePennylane = null, onVerifierCases = null, parametresMessages = {modeles:MODELES_MESSAGE_DEFAUT} }) {
  const T = THEMES[theme] || THEMES.dark;
  const [showPreview, setShowPreview] = useState(false);
  const [showFacturation, setShowFacturation] = useState(false);
  const [showSousTraitant, setShowSousTraitant] = useState(false);
  const [showQuandChips, setShowQuandChips] = useState(false);
  const [creationFactureEnCours, setCreationFactureEnCours] = useState(false);
  const [draftPennylane, setDraftPennylane] = useState(null); // aperçu modifiable avant envoi réel
  const [apercuEnvoi, setApercuEnvoi] = useState(null); // aperçu modifiable avant envoi WhatsApp/SMS
  const lblStyle = {fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em"};
  const inpStyle = () => ({width:"100%",padding:"9px 12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"});
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
      {showPreview&&<ReportPreview fiche={fiche} onClose={()=>setShowPreview(false)} parametresMessages={parametresMessages} onMarquerEnvoye={onMarquerEnvoye}/>}
      {showFacturation&&<FacturationModal fiche={fiche} theme={theme} onClose={()=>setShowFacturation(false)}/>}
      {showSousTraitant&&<SousTraitantModal fiche={fiche} sousTraitants={sousTraitants} onSaveSousTraitants={onSaveSousTraitants||(()=>{})} theme={theme} onClose={()=>setShowSousTraitant(false)}/>}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Retour</button>
        <code style={{fontSize:12,color:isRdv?"#3B82F6":"#0EA5E9",background:isRdv?"rgba(59,130,246,0.1)":"rgba(14,165,233,0.1)",border:`1px solid ${isRdv?"rgba(59,130,246,0.2)":"rgba(14,165,233,0.2)"}`,padding:"5px 12px",borderRadius:6,fontWeight:700}}>
          {isRdv?"📅 RDV — ":""}{fiche.id}
        </code>
        {fiche.urgent&&<span style={{fontSize:11,fontWeight:700,color:"#EF4444",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",padding:"4px 10px",borderRadius:20}}>🚨 URGENCE</span>}
      </div>

      {/* Action principale */}
      {isRdv?(
        <button onClick={()=>onDemarrer(fiche)} style={{width:"100%",background:"linear-gradient(135deg,#10B981,#059669)",color:"#fff",border:"none",borderRadius:10,padding:"14px 18px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>Démarrer l'intervention</button>
      ):(
        <button onClick={()=>setShowPreview(true)} style={{width:"100%",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:10,padding:"14px 18px",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",marginBottom:8}}>Voir le rapport</button>
      )}

      {/* Actions secondaires */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:7,marginBottom:8}}>
        <button onClick={()=>setShowSousTraitant(true)} style={{background:"none",border:"1.5px solid rgba(37,211,102,0.5)",color:"#0F9D58",borderRadius:9,padding:"11px 10px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Envoyer au sous-traitant</button>
        {!isRdv&&onCreateDevis&&(
          <button onClick={()=>onCreateDevis(fiche)} style={{background:"none",border:"1.5px solid rgba(139,92,246,0.5)",color:"#7C3AED",borderRadius:9,padding:"11px 10px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Créer un devis</button>
        )}
        {!isRdv&&(
          <button onClick={()=>setShowFacturation(true)} style={{background:"none",border:"1.5px solid rgba(16,185,129,0.5)",color:"#0D9488",borderRadius:9,padding:"11px 10px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Proposition de facturation</button>
        )}
        {!isRdv&&onVerifierCases&&(
          <button onClick={()=>onVerifierCases(fiche)} style={{background:"none",border:`1.5px solid ${T.border}`,color:T.textMuted,borderRadius:9,padding:"11px 10px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Vérifier les cases (IA)</button>
        )}
      </div>

      {!fiche.technicien && onClaim && (
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"rgba(14,165,233,0.1)",border:"1.5px solid #0EA5E9",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
          <div style={{fontSize:18}}>🆓</div>
          <div style={{flex:1,minWidth:200,fontSize:12.5,color:T.text}}>Cette intervention n'est attribuée à personne — le premier disponible peut la prendre.</div>
          <button onClick={()=>onClaim(fiche)} style={{padding:"8px 16px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>✋ Je la prends{monTechnicien?` (${monTechnicien})`:""}</button>
        </div>
      )}
      {fiche.technicien && !fiche.priseEnCharge && onConfirmerPriseEnCharge && (
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"rgba(245,158,11,0.1)",border:"1.5px solid #F59E0B",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
          <div style={{fontSize:18}}>⏳</div>
          <div style={{flex:1,minWidth:200,fontSize:12.5,color:T.text}}>Attribuée à <b>{fiche.technicien}</b> — pas encore confirmée comme prise en charge.</div>
          <button onClick={()=>onConfirmerPriseEnCharge(fiche)} style={{padding:"8px 16px",background:"linear-gradient(135deg,#F59E0B,#D97706)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:12.5,cursor:"pointer",fontFamily:"inherit"}}>✅ Je m'en occupe</button>
        </div>
      )}
      {fiche.priseEnCharge && (
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.35)",borderRadius:10,padding:"8px 14px",marginBottom:16,fontSize:12,color:"#10B981",fontWeight:700}}>
          ✅ Pris en charge par {fiche.priseEnCharge.par} à {new Date(fiche.priseEnCharge.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
        </div>
      )}

      {/* Modification de la fiche */}
      <div style={{display:"flex",gap:7,marginBottom:20}}>
        <button onClick={onEdit} style={{flex:1,background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:9,padding:"10px 8px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Modifier</button>
        {onDuplicate&&<button onClick={onDuplicate} style={{flex:1,background:"none",border:`1px solid ${T.border}`,color:T.textMuted,borderRadius:9,padding:"10px 8px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Dupliquer</button>}
        <button onClick={onDelete} style={{flex:1,background:"none",border:"1px solid rgba(239,68,68,0.45)",color:"#EF4444",borderRadius:9,padding:"10px 8px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Supprimer</button>
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
          <a href={telHref(fiche.tel)} style={{color:"#10B981",fontSize:13,fontWeight:700,marginTop:6,display:"flex",alignItems:"center",gap:4,textDecoration:"none"}}>
            📞 {fiche.tel} <span style={{fontSize:11,opacity:.7}}>→ Appeler</span>
          </a>
        )}
        {onLoguerAppel && (
          <div style={{marginTop:10,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:10.5,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>📋 Journal d'appels</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:showQuandChips?8:((fiche.journalAppels||[]).length?10:0)}}>
              {[
                {k:"pas_de_reponse",label:"❌ Pas de réponse",color:"#EF4444"},
                {k:"reussi",label:"✅ Contact réussi",color:"#10B981"},
                {k:"message_laisse",label:"📧 Message laissé",color:"#F59E0B"},
                {k:"injoignable",label:"📵 Injoignable",color:"#64748B"},
              ].map(opt=>(
                <button key={opt.k} onClick={()=>{
                  if(opt.k==="reussi"){ setShowQuandChips(v=>!v); return; }
                  onLoguerAppel(fiche, opt.k, "");
                }} style={{padding:"6px 11px",borderRadius:8,border:`1px solid ${opt.color}55`,background:(opt.k==="reussi"&&showQuandChips)?opt.color+"33":`${opt.color}14`,color:opt.color,fontWeight:700,fontSize:11.5,cursor:"pointer",fontFamily:"inherit"}}>
                  {opt.label}
                </button>
              ))}
              {(()=>{
                const _ja = fiche.journalAppels||[];
                const dernier = _ja[_ja.length-1];
                if(!dernier || dernier.resultat==="reussi") return null;
                return (
                  <button onClick={()=>setShowQuandChips(v=>!v)} style={{padding:"6px 11px",borderRadius:8,border:"1px solid #6366F155",background:showQuandChips?"#6366F133":"#6366F114",color:"#6366F1",fontWeight:700,fontSize:11.5,cursor:"pointer",fontFamily:"inherit"}}>
                    🔄 Il a rappelé
                  </button>
                );
              })()}
            </div>
            {showQuandChips && (()=>{
              const fmtHM = (mins) => { const d=new Date(Date.now()+mins*60000); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
              const tomorrowISO = () => { const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); };
              const CHIPS = [
                {label:"⏱ Dans 30 min", dateRdv:today(), heureRdv:fmtHM(30)},
                {label:"⏱ Dans 45 min", dateRdv:today(), heureRdv:fmtHM(45)},
                {label:"⏱ Dans 1h", dateRdv:today(), heureRdv:fmtHM(60)},
                {label:"🌅 Demain matin", dateRdv:tomorrowISO(), heureRdv:"09:00"},
                {label:"🌇 Demain après-midi", dateRdv:tomorrowISO(), heureRdv:"14:00"},
              ];
              return (
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:(fiche.journalAppels||[]).length?10:0,padding:"8px 0",borderTop:`1px dashed ${T.border}`,borderBottom:`1px dashed ${T.border}`}}>
                  {CHIPS.map(c=>(
                    <button key={c.label} onClick={()=>{
                      onLoguerAppel(fiche.dateRdv!==c.dateRdv||fiche.heureRdv!==c.heureRdv ? {...fiche,dateRdv:c.dateRdv,heureRdv:c.heureRdv} : fiche, "reussi", c.label);
                      setShowQuandChips(false);
                    }} style={{padding:"6px 12px",borderRadius:20,border:"1px solid #10B98155",background:"#10B98114",color:"#10B981",fontWeight:700,fontSize:11.5,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      {c.label}
                    </button>
                  ))}
                  <button onClick={async ()=>{
                    const q = await dlgPrompt("Qu'a dit le client ? La date sera à ajuster manuellement ensuite si besoin.","",{titre:"Retour d'appel",multiline:true,valider:"Enregistrer"});
                    if(q===null) return;
                    onLoguerAppel(fiche, "reussi", q.trim());
                    setShowQuandChips(false);
                  }} style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${T.border}`,background:"none",color:T.textMuted,fontWeight:700,fontSize:11.5,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    📅 Autre…
                  </button>
                </div>
              );
            })()}
            {(fiche.journalAppels||[]).length>0 && (
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto"}}>
                {[...(fiche.journalAppels||[])].reverse().map((e,i)=>{
                  const meta = {pas_de_reponse:{label:"❌ Pas de réponse",color:"#EF4444"},reussi:{label:"✅ Contact réussi",color:"#10B981"},message_laisse:{label:"📧 Message laissé",color:"#F59E0B"},injoignable:{label:"📵 Injoignable",color:"#64748B"}}[e.resultat]||{label:e.resultat,color:T.textMuted};
                  return (
                    <div key={i} style={{fontSize:11.5,padding:"6px 9px",background:T.surface,borderRadius:7,borderLeft:`2.5px solid ${meta.color}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                        <span style={{fontWeight:700,color:meta.color}}>{meta.label}</span>
                        <span style={{color:T.textFaint,fontSize:10.5,flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
                          {new Date(e.ts).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                          {onSupprimerAppel && <button onClick={async ()=>{ if(await dlgConfirm("Cette entrée du journal d'appels sera retirée.",{titre:"Supprimer l'entrée",danger:true})) onSupprimerAppel(fiche, e.ts); }} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontFamily:"inherit",fontSize:11,padding:0}}>🗑️</button>}
                        </span>
                      </div>
                      <div style={{color:T.textMuted,fontSize:10.5,marginTop:1}}>{e.par||"—"}{e.note?` · ${e.note}`:""}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {onAjouterCommentaire && (
          <div style={{marginTop:10,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:10.5,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>💬 Notes d'équipe</div>
            {(fiche.commentaires||[]).length>0 && (
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto",marginBottom:9}}>
                {[...(fiche.commentaires||[])].reverse().map((c,i)=>(
                  <div key={i} style={{fontSize:11.5,padding:"6px 9px",background:T.surface,borderRadius:7,borderLeft:"2.5px solid #6366F1"}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                      <span style={{fontWeight:700,color:"#6366F1"}}>{c.par||"—"}</span>
                      <span style={{color:T.textFaint,fontSize:10.5,flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
                        {new Date(c.ts).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                        {onModifierCommentaire && <button onClick={async ()=>{
                          const nv = await dlgPrompt("Modifier la note :", c.texte, {titre:"Modifier la note",multiline:true,valider:"Enregistrer"});
                          if(nv===null) return;
                          if(!nv.trim()){ if(await dlgConfirm("Vider le texte supprime cette note. Continuer ?",{titre:"Supprimer la note",danger:true})) onModifierCommentaire(fiche, c.ts, null); return; }
                          onModifierCommentaire(fiche, c.ts, nv.trim());
                        }} style={{background:"none",border:"none",color:"#6366F1",cursor:"pointer",fontFamily:"inherit",fontSize:11,padding:0}}>✏️</button>}
                      </span>
                    </div>
                    <div style={{color:T.text,fontSize:11.5,marginTop:2,whiteSpace:"pre-wrap"}}>{c.texte}</div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={async ()=>{
              const texte = await dlgPrompt("Note visible par toute l'équipe sur cette fiche :","",{titre:"Ajouter une note",multiline:true,valider:"Publier la note"});
              if(texte===null || !texte.trim()) return;
              onAjouterCommentaire(fiche, texte.trim());
            }} style={{width:"100%",padding:"8px",borderRadius:8,border:"1px dashed #6366F155",background:"#6366F114",color:"#6366F1",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              ➕ Ajouter une note
            </button>
          </div>
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
                  {k==="facture"?"✅ ":k==="ne_pas_facturer"?"🚫 ":k==="brouillon"?"🧾 ":"💶 "}{v.label}
                </button>
              ))}
            </span>
          )}
        </div>
        {/* Le numéro saisi au passage en « Facturé » n'apparaissait nulle part sur la fiche :
            on l'affiche, et un appui permet de le corriger. */}
        {fiche.facturation==="facture"&&(
          <div onClick={()=>onToggleFacturation&&onToggleFacturation(fiche,"facture")}
            style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:8,padding:"7px 12px",borderRadius:9,background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.4)",cursor:"pointer"}}>
            <span style={{fontSize:10,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:T.textMuted}}>N° de facture</span>
            <span style={{fontSize:13.5,fontWeight:800,color:"#10B981"}}>{fiche.numeroFacture||"à renseigner"}</span>
            <span style={{fontSize:11,fontWeight:700,color:T.textMuted}}>modifier</span>
          </div>
        )}
        {(fiche.facturation==="a_facturer"||fiche.facturation==="brouillon"||fiche.facturation==="facture")&&onPreparerFacturePennylane&&(
          <div style={{marginTop:8}}>
            {fiche.pennylaneInvoiceId
              ? <span style={{fontSize:11.5,color:"#10B981",fontWeight:700}}>🧾 Facture Pennylane créée (n° {fiche.pennylaneInvoiceNumber||fiche.pennylaneInvoiceId}) — brouillon à valider dans Pennylane</span>
              : <button onClick={()=>setDraftPennylane(onPreparerFacturePennylane(fiche))} style={{padding:"7px 14px",borderRadius:8,border:"1px solid rgba(99,102,241,0.4)",background:"rgba(99,102,241,0.1)",color:"#6366F1",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  🧾 Créer facture Pennylane (brouillon)
                </button>}
          </div>
        )}
        {draftPennylane && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setDraftPennylane(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:460,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>🧾 Aperçu — avant envoi à Pennylane</div>
              <div style={{fontSize:11.5,color:T.textMuted,marginBottom:16}}>Vérifie et corrige si besoin — rien ne part tant que tu n'as pas confirmé. La facture arrivera en brouillon, à valider ensuite dans Pennylane.</div>

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div><div style={lblStyle}>Client (nom facturé)</div>
                  <input value={draftPennylane.client} onChange={e=>setDraftPennylane(d=>({...d,client:e.target.value}))} style={inpStyle()}/>
                </div>
                <div><div style={lblStyle}>Adresse de facturation</div>
                  <input value={draftPennylane.adresse} onChange={e=>setDraftPennylane(d=>({...d,adresse:e.target.value}))} style={inpStyle()}/>
                </div>
                <div><div style={lblStyle}>Libellé (nom du produit/service)</div>
                  <input value={draftPennylane.label} onChange={e=>setDraftPennylane(d=>({...d,label:e.target.value}))} style={inpStyle()}/>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <div style={{flex:1}}><div style={lblStyle}>Prix HT (€)</div>
                    <input type="number" step="0.01" value={draftPennylane.prixUnitaire} onChange={e=>setDraftPennylane(d=>({...d,prixUnitaire:e.target.value}))} style={inpStyle()}/>
                  </div>
                  <div style={{flex:1}}><div style={lblStyle}>TVA (%)</div>
                    <select value={draftPennylane.tauxTva} onChange={e=>setDraftPennylane(d=>({...d,tauxTva:parseFloat(e.target.value)}))} style={{...inpStyle(),cursor:"pointer"}}>
                      <option value={20}>20 %</option>
                      <option value={10}>10 %</option>
                      <option value={5.5}>5,5 %</option>
                      <option value={2.1}>2,1 %</option>
                    </select>
                  </div>
                </div>
                <div><div style={lblStyle}>Description (résumé envoyé sur la facture)</div>
                  <textarea value={draftPennylane.description} onChange={e=>setDraftPennylane(d=>({...d,description:e.target.value}))} rows={5} style={{...inpStyle(),resize:"vertical",fontFamily:"inherit"}}/>
                </div>
              </div>

              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={()=>setDraftPennylane(null)} style={{flex:1,padding:"11px",borderRadius:9,border:`1px solid ${T.border}`,background:"none",color:T.textMuted,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
                <button onClick={async()=>{
                  setCreationFactureEnCours(true);
                  await onEnvoyerFacturePennylane(fiche, draftPennylane);
                  setCreationFactureEnCours(false);
                  setDraftPennylane(null);
                }} disabled={creationFactureEnCours} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:"linear-gradient(135deg,#6366F1,#7C3AED)",color:"#fff",fontWeight:800,fontSize:13,cursor:creationFactureEnCours?"default":"pointer",fontFamily:"inherit",opacity:creationFactureEnCours?0.7:1}}>
                  {creationFactureEnCours?"⏳ Envoi…":"✅ Confirmer et envoyer à Pennylane"}
                </button>
              </div>
            </div>
          </div>
        )}
        {apercuEnvoi && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:800,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setApercuEnvoi(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:22,width:460,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:4}}>{apercuEnvoi.type==="whatsapp"?"🟢 Aperçu — message WhatsApp":"💬 Aperçu — message SMS"}</div>
              <div style={{fontSize:11.5,color:T.textMuted,marginBottom:10}}>Vérifie et corrige si besoin — rien n'est envoyé tant que tu n'as pas confirmé.</div>
              {parametresMessages.modeles.length>1&&(
                <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                  {parametresMessages.modeles.map((m,i)=>(
                    <button key={i} onClick={()=>setApercuEnvoi(a=>({...a,modeleIdx:i,texte:appliquerModeleMessage(m.texte,fiche)}))}
                      style={{fontSize:11.5,fontWeight:700,padding:"5px 12px",borderRadius:14,cursor:"pointer",fontFamily:"inherit",
                        background:apercuEnvoi.modeleIdx===i?"#0EA5E9":T.surface2,color:apercuEnvoi.modeleIdx===i?"#fff":T.textMuted,border:`1px solid ${apercuEnvoi.modeleIdx===i?"#0EA5E9":T.border}`}}>
                      {m.nom||`Modèle ${i+1}`}
                    </button>
                  ))}
                </div>
              )}
              <textarea value={apercuEnvoi.texte} onChange={e=>setApercuEnvoi(a=>({...a,texte:e.target.value}))} rows={10} style={{width:"100%",padding:"10px 12px",background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
              <div style={{display:"flex",gap:10,marginTop:16}}>
                <button onClick={()=>setApercuEnvoi(null)} style={{flex:1,padding:"11px",borderRadius:9,border:`1px solid ${T.border}`,background:"none",color:T.textMuted,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
                <button onClick={()=>{
                  if(apercuEnvoi.type==="whatsapp") envoyerRapportWhatsApp(fiche, apercuEnvoi.texte);
                  else envoyerRapportSMS(fiche, apercuEnvoi.texte);
                  onMarquerEnvoye&&onMarquerEnvoye(fiche);
                  setApercuEnvoi(null);
                }} style={{flex:2,padding:"11px",borderRadius:9,border:"none",background:apercuEnvoi.type==="whatsapp"?"linear-gradient(135deg,#25D366,#128C7E)":"#334155",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                  ✅ Confirmer et envoyer
                </button>
              </div>
            </div>
          </div>
        )}
        {fiche.facturation==="ne_pas_facturer"&&(
          <div style={{marginTop:6,fontSize:11.5,color:T.textMuted,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontStyle:fiche.raisonNonFacture?"normal":"italic"}}>🚫 Motif : {fiche.raisonNonFacture || "non précisé"}</span>
            <button onClick={async ()=>{
              const saisie=await dlgPrompt("Pourquoi cette intervention n'est pas facturée ?",fiche.raisonNonFacture||"",{titre:"Motif de non-facturation",multiline:true,valider:"Enregistrer"});
              if(saisie===null) return;
              onToggleFacturation&&onToggleFacturation(fiche,"ne_pas_facturer",saisie.trim());
            }} style={{background:"none",border:"none",color:"#0EA5E9",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit",padding:0}}>✏️ Modifier</button>
          </div>
        )}
        {fiche.noteRdv&&isRdv&&<div style={{marginTop:10,background:"rgba(59,130,246,0.08)",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#93C5FD"}}>💬 {fiche.noteRdv}</div>}
      </div>

      {!isRdv&&fiche.prestations?.length>0&&(
        <div style={card}>
          <div style={secHead}>🔧 Prestations ({fiche.prestations.length})</div>
          {(fiche.prestations||[]).map(p=>{
            const meta=PRESTATIONS.find(x=>x.id===p.id);
            const hasContent=(p.localisations?.length||0)+(p.problemes?.length||0)+(p.causes?.length||0)+(p.constatCamera?.length||0)+(p.methodes?.length||0)+(p.actions?.length||0)+(p.resultats?.length||0)>0||p.note?.trim();
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
                {p.methodes?.length>0&&<div style={{marginBottom:6}}><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>🔬 Méthode de détection</div><Chips items={p.methodes} color="#0EA5E9"/></div>}
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
      {!isRdv&&(fiche.tempsInterne||fiche.majorations?.length||fiche.numeroOS)&&(
        <div style={{...card,border:"1px solid rgba(245,158,11,0.35)",background:isRdv?T.surface:"rgba(245,158,11,0.05)"}}>
          <div style={{...secHead,color:"#F59E0B",borderColor:"rgba(245,158,11,0.25)"}}>⏱️ Temps passé & facturation <span style={{marginLeft:"auto",fontSize:9,opacity:.7}}>🔒 interne</span></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:20,alignItems:"center"}}>
            {fiche.numeroOS&&<div><div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>N° ordre de service</div><div style={{fontSize:20,fontWeight:800,color:T.text}}>📋 {fiche.numeroOS}</div></div>}
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

      {!isRdv&&fiche.audioMemo&&(
        <div style={{...card,border:`1px solid ${T.border}`}}>
          <div style={secHead}>🔊 Note vocale d'origine <span style={{marginLeft:"auto",fontSize:9,opacity:.7}}>🔒 interne</span></div>
          <audio controls src={fiche.audioMemo} style={{width:"100%",height:36}}/>
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
  const [genLignesIA, setGenLignesIA] = useState(false);
  const [descriptionLibre, setDescriptionLibre] = useState("");
  const genererLignesIA = async () => {
    const texte = descriptionLibre.trim();
    if(!texte){dlgInfo("Décrivez d'abord les travaux à réaliser (ou collez la transcription de l'appel).");return;}
    setGenLignesIA(true);
    try {
      const prompt = `Tu es un assistant qui prépare des lignes de devis au forfait pour une entreprise d'assainissement/plomberie en France. À partir de la description ci-dessous (texte libre ou transcription d'appel client), génère une liste de lignes de devis avec désignation, quantité et prix unitaire HT en euros (prix de marché raisonnables pour ce secteur en France).
Description des travaux :
"""${texte}"""
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, sans balises markdown, au format exact :
[{"label":"Désignation de la prestation","qte":1,"pu":150}]
Règles : 2 à 6 lignes maximum, prix HT réalistes et arrondis, quantité entière sauf mètres linéaires (ml) qui peuvent être décimaux. Ne mets aucun commentaire, uniquement le tableau JSON.`;
      const r = await fetch("/api/claude", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, messages:[{role:"user",content:prompt}] })
      });
      if(!r.ok) throw new Error("API "+r.status);
      const data = await r.json();
      const text = (data.content||[]).map(c=>c.text||"").join("").trim();
      if(!text) throw new Error(data.error?.message||"Réponse vide");
      const clean = text.replace(/```json|```/g,"").trim();
      const lignesIA = JSON.parse(clean);
      if(!Array.isArray(lignesIA) || !lignesIA.length) throw new Error("Format de réponse inattendu");
      const nouvellesLignes = lignesIA.map(l=>({label:String(l.label||"").trim(),qte:l.qte||1,pu:l.pu||""}));
      setD(p=>({...p, lignes:[...p.lignes.filter(l=>l.label||l.pu), ...nouvellesLignes]}));
    } catch(e) { dlgInfo("Erreur lors de la génération des lignes : "+(e?.message||e)); }
    setGenLignesIA(false);
  };
  const genererDescriptifIA = async () => {
    const lignesValides = d.lignes.filter(l=>l.label?.trim());
    const texteBrut = d.notes?.trim();
    const forfaitInfo = d.modeForfait && d.forfaitLabel?.trim();
    // En mode forfait il n'y a jamais de lignes détaillées — ce n'est pas une raison de
    // bloquer la génération IA : on rédige à partir de l'intitulé du forfait, ou du texte
    // déjà tapé dans les notes (l'IA le reformule en paragraphe professionnel).
    if(!lignesValides.length && !forfaitInfo && !texteBrut){
      dlgInfo("Décrivez d'abord les travaux — soit avec des lignes détaillées, soit en mode forfait avec un intitulé, soit directement dans les notes ci-dessous.");
      return;
    }
    setGenIA(true);
    try {
      const source = lignesValides.length
        ? `Travaux prévus :\n${lignesValides.map(l=>`- ${l.label}${l.qte>1?` (quantité : ${l.qte})`:""}`).join("\n")}`
        : forfaitInfo
          ? `Intitulé du forfait : ${d.forfaitLabel}`
          : `Description donnée par l'utilisateur, à reformuler proprement en paragraphe professionnel :\n${texteBrut}`;
      const prompt = `${LEXIQUE_METIER}

Tu rédiges le descriptif d'un devis pour une entreprise d'assainissement/plomberie. Rédige un court paragraphe professionnel (3 à 5 phrases, français soigné, ton commercial sobre) décrivant les travaux proposés ci-dessous. Utilise "nous proposons" / "notre intervention comprendra". Ne donne AUCUN prix, AUCUN montant. Ne liste pas ligne par ligne : fais des phrases fluides qui regroupent les travaux. Termine par une phrase sur le résultat attendu (rétablissement du bon écoulement, prévention des obstructions...).
${d.client?`Client : ${d.client}`:""}
${d.adresse?`Adresse : ${d.adresse}`:""}
${source}
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
    } catch(e) { dlgInfo("Erreur lors de la génération : "+(e?.message||e)); }
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

      <Repliable T={T} icone="📐" titre="Relevé sur place" badge="optionnel">
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
      </Repliable>

      <div style={sec}>
        <div style={{fontSize:13,fontWeight:800,color:T.text,marginBottom:4}}>Comment chiffrer ce devis ?</div>
        <div style={{fontSize:11.5,color:T.textMuted,marginBottom:12}}>Choisissez une seule des deux options — l'autre disparaît, pour ne pas avoir à deviner ce qu'il faut remplir.</div>

        {/* Choix du mode : deux grandes cases, un seul actif à la fois */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <button onClick={()=>setD(p=>({...p,modeForfait:true}))}
            style={{padding:"14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
              border:`2px solid ${d.modeForfait?"#A78BFA":T.border}`,
              background:d.modeForfait?"rgba(167,139,250,0.12)":T.surface2}}>
            <div style={{fontSize:20,marginBottom:4}}>💼</div>
            <div style={{fontWeight:800,fontSize:13,color:d.modeForfait?"#A78BFA":T.text}}>Forfait</div>
            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Un prix global, sans détail ligne par ligne</div>
          </button>
          <button onClick={()=>setD(p=>({...p,modeForfait:false}))}
            style={{padding:"14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
              border:`2px solid ${!d.modeForfait?"#0EA5E9":T.border}`,
              background:!d.modeForfait?"rgba(14,165,233,0.12)":T.surface2}}>
            <div style={{fontSize:20,marginBottom:4}}>📋</div>
            <div style={{fontWeight:800,fontSize:13,color:!d.modeForfait?"#0EA5E9":T.text}}>Détail par ligne</div>
            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Plusieurs lignes chiffrées séparément</div>
          </button>
        </div>

        {d.modeForfait ? (
          <div style={{padding:"14px",background:"rgba(167,139,250,0.06)",border:"1.5px solid rgba(167,139,250,0.3)",borderRadius:10}}>
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
          </div>
        ) : (
          <>
            <div style={{marginBottom:14,padding:"12px 14px",background:"rgba(124,58,237,0.06)",border:"1.5px solid rgba(124,58,237,0.3)",borderRadius:10}}>
              <div style={{fontSize:12.5,fontWeight:800,color:"#A78BFA",marginBottom:8}}>✨ Générer les lignes par IA</div>
              <div style={{fontSize:11.5,color:T.textMuted,marginBottom:8}}>Décrivez les travaux en texte libre (ou collez la transcription de l'appel client) : l'IA propose des lignes chiffrées, entièrement modifiables ensuite.</div>
              <textarea value={descriptionLibre} onChange={e=>setDescriptionLibre(e.target.value)} rows={3}
                placeholder="Ex : Débouchage cuisine par furet, environ 8 ml de canalisation, plus inspection caméra pour vérifier l'état du réseau…"
                style={{...inp,resize:"vertical",marginBottom:8}}/>
              <button onClick={genererLignesIA} disabled={genLignesIA}
                style={{padding:"9px 16px",background:genLignesIA?T.surface2:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:genLignesIA?T.textMuted:"#fff",border:"none",borderRadius:8,fontWeight:800,fontSize:13,cursor:genLignesIA?"default":"pointer",fontFamily:"inherit"}}>
                {genLignesIA?"⏳ Génération…":"✨ Générer les lignes"}
              </button>
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
          </>
        )}

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
          <button onClick={async ()=>{if(await dlgConfirm(`${client.nom} sera retiré de la liste. Les fiches existantes sont conservées.`,{titre:"Supprimer le client",danger:true})){onDeleteClient(client.id);setSel(null);}}} style={{marginLeft:"auto",background:"none",border:"1px solid #7F1D1D",color:"#EF4444",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>🗑️ Supprimer</button>
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
              <button onClick={async e=>{e.stopPropagation();if(await dlgConfirm(`Le site ${s.nom||s.adresse} sera retiré de ce client.`,{titre:"Supprimer le site",danger:true})){const ns={...client.sites};delete ns[s.id];onSaveClient({...client,sites:ns});if(siteFilter===s.id)setSiteFilter("");}}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>✕</button>
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
              {f.facturation&&<span style={{fontSize:10.5,fontWeight:700,color:FACTURATION[f.facturation]?.color}}>{FACTURATION[f.facturation]?.label}{f.facturation==="facture"&&f.numeroFacture?` n°${f.numeroFacture}`:""}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const list = clients.filter(c=>!search||sansAccents(c.nom).toLowerCase().includes(sansAccents(search).toLowerCase())).sort((a,b)=>a.nom.localeCompare(b.nom));
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <input placeholder="🔍 Rechercher un client…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,flex:1,minWidth:160,width:"auto"}}/>
        <button onClick={async ()=>{const nom=await dlgPrompt("Nom du nouveau client","",{titre:"Nouveau client",valider:"Créer"});if(nom?.trim()){const c={id:uid2("CLI"),nom:nom.trim(),tel:"",email:"",sites:{}};onSaveClient(c);setSel(c.id);}}}
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
  const [editId, setEditId] = useState(null); // contrat en cours de modification (null = création)
  const vide = {clientId:"",siteId:"",type:CONTRAT_TYPES[0],frequence:"annuel",dateDebut:today(),prochaine:today(),technicien:"",actif:true};
  const [c, setC] = useState(vide);
  const ouvrirEdition = (ct) => {
    setEditId(ct.id);
    setC({clientId:ct.clientId||"",siteId:ct.siteId||"",type:ct.type,frequence:ct.frequence,
          dateDebut:ct.dateDebut||ct.prochaine||today(),prochaine:ct.prochaine||ct.dateDebut||today(),
          technicien:ct.technicien||"",actif:ct.actif!==false});
    setShowForm(true);
  };
  const inp = {width:"100%",padding:"9px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"};
  const lbl = {display:"block",fontSize:9.5,fontWeight:700,color:T.textMuted,letterSpacing:".08em",textTransform:"uppercase",marginBottom:5};
  const cli = clients.find(x=>x.id===c.clientId);
  const sites = Object.values(cli?.sites||{});
  const creer = ()=>{
    if(!c.clientId){dlgInfo("Choisissez un client (créez-le dans l'onglet Clients si besoin).");return;}
    const site = sites.find(s=>s.id===c.siteId);
    const base = { clientId:c.clientId, client:cli?.nom||"", siteId:c.siteId||null, site:site?.nom||"",
      adresse:site?.adresse||"", tel:cli?.tel||"", type:c.type, frequence:c.frequence, technicien:c.technicien };
    if(editId){
      const ancien = contrats.find(x=>x.id===editId) || {};
      // En modification, la date saisie est la PROCHAINE échéance : elle est reprise telle quelle.
      onSaveContrat({ ...ancien, ...base, dateDebut:ancien.dateDebut||c.prochaine, prochaine:c.prochaine });
    } else {
      onSaveContrat({ ...base, id:uid2("CTR"), dateDebut:c.dateDebut, prochaine:c.dateDebut, actif:true });
    }
    setShowForm(false); setEditId(null); setC(vide);
  };
  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
        <button onClick={()=>{if(showForm){setShowForm(false);setEditId(null);setC(vide);}else{setEditId(null);setC(vide);setShowForm(true);}}} style={{padding:"9px 16px",background:showForm?"none":"linear-gradient(135deg,#0EA5E9,#6366F1)",border:showForm?`1px solid ${T.border}`:"none",borderRadius:8,color:showForm?T.textMuted:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{showForm?"✕ Annuler":"➕ Nouveau contrat"}</button>
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
            <div><div style={lbl}>{editId?"Prochaine intervention":"Première intervention"}</div>
              <input type="date" value={editId?c.prochaine:c.dateDebut}
                onChange={e=>setC(p=>editId?{...p,prochaine:e.target.value}:{...p,dateDebut:e.target.value,prochaine:e.target.value})} style={inp}/></div>
            <div><div style={lbl}>Technicien (optionnel)</div>
              <select value={c.technicien} onChange={e=>setC(p=>({...p,technicien:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                <option value="">—</option>
                {techniciens.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button onClick={creer} style={{marginTop:14,width:"100%",padding:"11px",background:"linear-gradient(135deg,#10B981,#059669)",border:"none",borderRadius:8,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{editId?"✓ Enregistrer les modifications":"✓ Créer le contrat"}</button>
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
          <button onClick={()=>ouvrirEdition(ct)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:"#6366F1",padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✏️ Modifier</button>
          <button onClick={()=>onSaveContrat({...ct,actif:ct.actif===false})} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,color:ct.actif!==false?"#F59E0B":"#10B981",padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{ct.actif!==false?"⏸ Suspendre":"▶ Réactiver"}</button>
          <button onClick={async ()=>{if(await dlgConfirm(`Le contrat ${ct.type} de ${ct.client} sera supprimé. Les interventions déjà créées sont conservées.`,{titre:"Supprimer le contrat",danger:true}))onDeleteContrat(ct.id);}} style={{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>🗑️</button>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BOÎTES DE DIALOGUE MAISON
   Remplacent dlgInfo() / confirm() / prompt() du navigateur, qui sur mobile
   s'affichent avec l'habillage du navigateur et cassent l'identité de l'app.
   API promise : `if(await dlgConfirm("…"))`, `const v = await dlgPrompt("…")`.
   dlgInfo() ne bloque pas l'appelant.
   Repli automatique sur les boîtes natives tant que l'hôte n'est pas monté.
═══════════════════════════════════════════ */
let _ouvrirDialogue = null;
const dialogue = (opts) => new Promise(resoudre => {
  if(!_ouvrirDialogue){
    if(opts.type==="confirm") return resoudre(window.confirm(opts.message));
    if(opts.type==="prompt")  return resoudre(window.prompt(opts.message, opts.valeur||""));
    window.alert(opts.message); return resoudre(undefined);
  }
  _ouvrirDialogue({...opts, resoudre});
});
const dlgInfo    = (message, titre) => dialogue({type:"info", titre, message});
const dlgConfirm = (message, o={})  => dialogue({type:"confirm", message, ...o});
const dlgPrompt  = (message, valeur="", o={}) => dialogue({type:"prompt", message, valeur, ...o});

function DialogueHost({ theme }) {
  const T = THEMES[theme] || THEMES.dark;
  const [d, setD] = useState(null);
  const [val, setVal] = useState("");
  const champRef = useRef(null);
  useEffect(()=>{ _ouvrirDialogue = (opts)=>{ setVal(opts.valeur||""); setD(opts); }; return ()=>{ _ouvrirDialogue = null; }; },[]);
  useEffect(()=>{ if(d?.type==="prompt") setTimeout(()=>champRef.current?.focus(),60); },[d]);
  if(!d) return null;
  const fermer = (resultat) => { d.resoudre(resultat); setD(null); };
  const danger = d.danger || /supprim|effac|retir/i.test(d.message||"");
  const accent = danger ? "#EF4444" : "#0EA5E9";
  const multi = d.multiline || (d.message||"").length > 90;
  return (
    <div onClick={()=>fermer(d.type==="confirm"?false:d.type==="prompt"?null:undefined)}
      style={{position:"fixed",inset:0,background:"rgba(2,8,20,0.72)",backdropFilter:"blur(3px)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:18,padding:"22px 22px 18px",width:440,maxWidth:"100%",boxShadow:"0 24px 60px rgba(0,0,0,0.45)"}}>
        <div style={{width:38,height:4,borderRadius:2,background:accent,marginBottom:14}}/>
        {d.titre&&<div style={{fontWeight:800,fontSize:16,color:T.text,marginBottom:6}}>{d.titre}</div>}
        <div style={{fontSize:13.5,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap",marginBottom:d.type==="prompt"?12:18}}>{d.message}</div>
        {d.type==="prompt"&&(
          multi
            ? <textarea ref={champRef} value={val} onChange={e=>setVal(e.target.value)} rows={4}
                style={{width:"100%",padding:"11px 13px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,outline:"none",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",marginBottom:16}}/>
            : <input ref={champRef} value={val} onChange={e=>setVal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")fermer(val);if(e.key==="Escape")fermer(null);}}
                style={{width:"100%",padding:"11px 13px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:16}}/>
        )}
        <div style={{display:"flex",gap:10}}>
          {d.type!=="info"&&(
            <button onClick={()=>fermer(d.type==="confirm"?false:null)}
              style={{flex:1,padding:"12px",borderRadius:10,border:`1px solid ${T.border}`,background:"none",color:T.textMuted,fontWeight:700,fontSize:13.5,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
          )}
          <button autoFocus={d.type!=="prompt"} onClick={()=>fermer(d.type==="confirm"?true:d.type==="prompt"?val:undefined)}
            style={{flex:d.type==="info"?1:1.6,padding:"12px",borderRadius:10,border:"none",background:danger?"linear-gradient(135deg,#EF4444,#B91C1C)":"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",fontWeight:800,fontSize:13.5,cursor:"pointer",fontFamily:"inherit"}}>
            {d.valider || (d.type==="confirm" ? (danger?"Supprimer":"Confirmer") : d.type==="prompt" ? "Valider" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AbsencesAdmin({ T, theme, techniciens=[], fiches=[], absences=[], onSaveAbsence, onDeleteAbsence }) {
  const [a, setA] = useState({technicien:"",du:today(),au:today(),motif:""});
  const inp = {padding:"9px 12px",background:T.surface2,border:`1.5px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",width:"100%",colorScheme:theme==="dark"?"dark":"light"};
  const ajouter = async () => {
    if(!a.technicien){dlgInfo("Choisissez d'abord un technicien.","Technicien manquant");return;}
    if(a.au<a.du){dlgInfo("La date de fin est antérieure à la date de début.","Dates incohérentes");return;}
    const occupees = fiches.filter(f=>f.technicien===a.technicien&&f.dateRdv>=a.du&&f.dateRdv<=a.au&&f.status!=="annule");
    if(occupees.length && !(await dlgConfirm(`${a.technicien} a déjà ${occupees.length} intervention(s) sur cette période. Elles ne seront pas déplacées automatiquement.`,{titre:"Interventions déjà prévues",valider:"Ajouter quand même"}))) return;
    onSaveAbsence({...a, id:uid2("ABS")});
    setA({technicien:"",du:today(),au:today(),motif:""});
  };
  return (
    <div>
      <div style={{fontSize:11.5,color:T.textMuted,marginBottom:10}}>Les jours concernés apparaissent en orange dans l'agenda, et l'assignation d'une intervention à un technicien absent est refusée.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <select value={a.technicien} onChange={e=>setA(p=>({...p,technicien:e.target.value}))} style={{...inp,cursor:"pointer"}}>
          <option value="">— Technicien —</option>
          {techniciens.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <input value={a.motif} onChange={e=>setA(p=>({...p,motif:e.target.value}))} placeholder="Motif (congés, arrêt…)" style={inp}/>
        <input type="date" value={a.du} onChange={e=>setA(p=>({...p,du:e.target.value,au:p.au<e.target.value?e.target.value:p.au}))} style={inp}/>
        <input type="date" value={a.au} min={a.du} onChange={e=>setA(p=>({...p,au:e.target.value}))} style={inp}/>
      </div>
      <button onClick={ajouter} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Ajouter l'absence</button>
      {absences.length>0&&(
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
          {[...absences].sort((x,y)=>x.du.localeCompare(y.du)).map(x=>(
            <div key={x.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.text,background:T.surface2,borderRadius:8,padding:"7px 10px"}}>
              <span style={{fontWeight:700}}>{x.technicien}</span>
              <span style={{color:T.textMuted}}>{dateFr(x.du)} → {dateFr(x.au)}{x.motif?` · ${x.motif}`:""}</span>
              <button onClick={async ()=>{if(await dlgConfirm(`L'absence de ${x.technicien} sera retirée.`,{titre:"Supprimer l'absence",danger:true}))onDeleteAbsence(x.id);}}
                style={{marginLeft:"auto",background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>🗑️</button>
            </div>
          ))}
        </div>
      )}
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

// ── Filet de sécurité global : plus jamais de page blanche ──
// Si un bug fait planter le rendu n'importe où dans l'app (comme le crash du journal
// d'appels rencontré une fois), React affiche normalement une page blanche sans aucun
// moyen de revenir en arrière. Cette classe intercepte ce genre de crash et affiche à la
// place un écran explicite avec le message d'erreur et un bouton pour recharger — et
// enregistre l'incident dans le journal d'activité pour qu'on puisse le corriger vite.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { erreur: null }; }
  static getDerivedStateFromError(erreur) { return { erreur }; }
  componentDidCatch(erreur, info) {
    console.error("Crash intercepté :", erreur, info);
    try { logActivite("erreur_app", null, `${erreur?.message || erreur} — ${(info?.componentStack||"").split("\n")[1]?.trim()||""}`); } catch(e) {}
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div style={{minHeight:"100vh",background:"#0B1120",color:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif",padding:20}}>
        <div style={{textAlign:"center",maxWidth:380}}>
          <div style={{width:54,height:54,borderRadius:16,background:"linear-gradient(135deg,#F59E0B,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 16px"}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Un problème est survenu</div>
          <div style={{fontSize:12.5,color:"#94A3B8",marginBottom:14,lineHeight:1.6}}>L'application a rencontré une erreur inattendue. Ce n'est pas de votre faute — l'incident a été enregistré.</div>
          <div style={{fontSize:11,color:"#64748B",background:"#141F38",borderRadius:8,padding:"9px 12px",marginBottom:18,fontFamily:"monospace",textAlign:"left",wordBreak:"break-word"}}>{String(this.state.erreur?.message||this.state.erreur)}</div>
          <button onClick={()=>window.location.reload()} style={{padding:"11px 26px",background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:9,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>🔄 Recharger l'application</button>
        </div>
      </div>
    );
  }
}

export default function App() {
  return <ErrorBoundary><AppInterne/></ErrorBoundary>;
}

function AppInterne() {
  const [fiches, setFiches] = useState(()=>lsGet("cache_fiches")||[]);
  const [societes, setSocietes] = useState(["A6T Services"]);
  const [techniciens, setTechniciens] = useState([]);
  const [societesLoaded, setSocietesLoaded] = useState(false);
  const [techniciensLoaded, setTechniciensLoaded] = useState(false);
  const [logos, setLogos] = useState({});
  const [clients, setClients] = useState([]);
  const [devisList, setDevisList] = useState([]);
  const [contrats, setContrats] = useState([]);
  const [taches, setTaches] = useState([]);
  const [memosVocaux, setMemosVocaux] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const [activiteLog, setActiviteLog] = useState([]);
  const [userRolesLoaded, setUserRolesLoaded] = useState(false);
  const [rolesError, setRolesError] = useState(""); // message d'erreur exact, affiché à l'écran pour diagnostic sans console
  const [derniereErreur, setDerniereErreur] = useState(""); // dernière erreur technique en direct, visible sans aller dans Administration
  const [voiceResume, setVoiceResume] = useState(null);
  const [showExportMensuel, setShowExportMensuel] = useState(false);
  const [editingDevis, setEditingDevis] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(()=>lsGet("theme")||"light");
  const [positions, setPositions] = useState({}); // { nomTech: { lat, lng, updatedAt, statut } }
  const [view, setView] = useState("accueil");
  const [nav, setNav] = useState("agenda");
  const [agendaJour, setAgendaJour] = useState(today()); // jour affiché dans l'agenda, conservé au retour d'une fiche
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [rechercheFloue, setRechercheFloue] = useState(false); // true si les résultats affichés sont approchants, pas une correspondance exacte
  const [motsTrouvesFloue, setMotsTrouvesFloue] = useState({}); // id de fiche → mot qui a le mieux matché, pour expliquer le résultat approchant
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTech, setFilterTech] = useState("");
  const [sortMode, setSortMode] = useState("date_desc"); // date_desc | date_asc | alpha
  const [toast, setToast] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showRdvForm, setShowRdvForm] = useState(false);
  const [rdvPrefill, setRdvPrefill] = useState(null);
  const [showMailImport, setShowMailImport] = useState(false);
  const [showVoiceImport, setShowVoiceImport] = useState(false);
  const [techTels, setTechTels] = useState({});
  const [techColors, setTechColors] = useState({});
  const [absences, setAbsences] = useState([]); // congés / arrêts des techniciens
  const [sousTraitants, setSousTraitants] = useState([]);
  const [techNom, setTechNom] = useState(()=>localStorage.getItem("techNom")||"");
  // Rafraîchissement silencieux du jeton de notification à chaque ouverture de l'app —
  // si la permission a déjà été accordée une fois, on re-vérifie/re-sauvegarde le jeton en
  // arrière-plan à chaque visite, sans rien demander à la personne. Ça évite d'avoir à
  // repasser par "Activer" dans Profil si le jeton devient périmé avec le temps (fréquent
  // sur iPhone après quelques jours sans ouvrir l'app).
  useEffect(()=>{
    if(!techNom) return;
    if(typeof Notification==="undefined" || Notification.permission!=="granted") return;
    initNotifications(techNom).catch(()=>{});
  },[techNom]);
  const [showProfil, setShowProfil] = useState(false);
  const [prestaLabelsVersion, setPrestaLabelsVersion] = useState(0);
  const [champsCustom, setChampsCustom] = useState({});
  const [prestationsCustomVersion, setPrestationsCustomVersion] = useState(0);
  const [parametresIA, setParametresIA] = useState({analysePhotos:true,maxPhotos:0}); // maxPhotos:0 = toutes
  const [champsPrefill, setChampsPrefill] = useState(null); // {texte, photo} envoyé depuis une fiche vers l'outil "Ajouter des cases"
  const [parametresMessages, setParametresMessages] = useState({modeles:MODELES_MESSAGE_DEFAUT});
  const [online, setOnline] = useState(typeof navigator!=="undefined" ? navigator.onLine : true);
  const [currentUser, setCurrentUser] = useState(null);
  // Après 5 secondes sans confirmation des droits d'accès, on démarre quand même l'app
  // (par défaut accès complet) plutôt que de bloquer qui que ce soit indéfiniment — ne
  // jamais pouvoir travailler est pire qu'un très bref délai de sécurité au démarrage.
  // Si la confirmation arrive après coup, les restrictions s'appliquent normalement dès
  // cet instant, sans qu'il soit nécessaire de recharger la page.
  const [rolesGraceExpired, setRolesGraceExpired] = useState(false);
  const monRole = useMemo(() => {
    if(!currentUser?.email) return { role:"admin", technicien:null };
    if(!userRolesLoaded && !rolesGraceExpired) return { role:"pending", technicien:null };
    if(!userRolesLoaded && rolesGraceExpired) return { role:"admin", technicien:null }; // démarrage débloqué, restriction appliquée dès que possible
    const trouve = userRoles.find(r => (r.email||"").toLowerCase() === currentUser.email.toLowerCase());
    return trouve || { role:"admin", technicien:null }; // par défaut : accès complet tant qu'un compte n'est pas explicitement restreint
  }, [currentUser, userRoles, userRolesLoaded, rolesGraceExpired]);
  const estRestreint = monRole.role === "technicien";
  const [authReady, setAuthReady] = useState(false);
  useEffect(()=>{
    if(!currentUser || userRolesLoaded) { setRolesGraceExpired(false); return; }
    const t = setTimeout(()=>{ setRolesGraceExpired(true); }, 5000);
    return ()=>clearTimeout(t);
  },[currentUser, userRolesLoaded]);
  // Dès la connexion réussie, on va chercher les droits d'accès par le chemin rapide
  // (indépendant du gros téléchargement des fiches) plutôt que d'attendre l'écoute temps
  // réel classique, qui peut se retrouver coincée derrière ce transfert.
  useEffect(()=>{
    if(!currentUser || userRolesLoaded) return;
    let annule = false;
    fetchUserRolesFast(currentUser).then(({data, error})=>{
      if(annule) return;
      if(error) setRolesError(prev => prev || `Chemin rapide : ${error}`);
      if(data===null) return; // échec : l'écoute temps réel plus lente prendra le relais
      setUserRoles(data);
      setUserRolesLoaded(true);
    });
    return ()=>{ annule = true; };
  },[currentUser, userRolesLoaded]);
  const traiterMemosEnAttente = async () => {
    let memos;
    try { memos = await idbListerMemos(); } catch(e) { return; }
    for (const m of memos) {
      try {
        const r = await fetch("/api/transcribe", { method:"POST", headers:{"Content-Type": m.mimeType||"audio/webm"}, body: m.blob });
        const data = await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(data?.error || ("API "+r.status));
        const texte = (data.text||"").trim();
        if(texte){
          saveMemoVocal({ id: m.id, ts: m.ts, mode: m.mode, texte, statut: "en_attente_analyse", client: null });
          showToast("🎙️ Mémo vocal hors-ligne transcrit — disponible dans « Mémos vocaux »");
        }
        await idbSupprimerMemo(m.id);
      } catch(e) {
        // Toujours pas de réseau exploitable, ou erreur ponctuelle : on retentera au prochain retour de connexion.
        console.error("traiterMemosEnAttente error", e);
      }
    }
  };
  useEffect(()=>{
    const on=()=>{setOnline(true);flushPending();traiterMemosEnAttente();}, off=()=>setOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    try { if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{}); } catch(e){}
    setTimeout(()=>{flushPending();traiterMemosEnAttente();}, 3000);
    return ()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);
  // Filet de sécurité (2/2) : capture les erreurs qui n'ont PAS fait planter l'affichage
  // (erreurs dans du code asynchrone, promesses rejetées...) — l'ErrorBoundary plus haut
  // n'attrape que les crashs de rendu React, pas celles-ci. On les enregistre quand même
  // dans le journal d'activité pour ne rien perdre en silence.
  useEffect(()=>{
    const onErr = (e) => { const msg = `${e?.message||e}`; try { logActivite("erreur_app", null, msg); } catch(err){} setDerniereErreur(msg); };
    const onRej = (e) => { const msg = `Promesse rejetée : ${e?.reason?.message||e?.reason||e}`; try { logActivite("erreur_app", null, msg); } catch(err){} setDerniereErreur(msg); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  },[]);
  // Surveillance de la connexion (Firebase Auth)
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, (u)=>{ setCurrentUser(u); setAuthReady(true); if(u?.email) logActivite("connexion", null, u.email); });
    return ()=>unsub();
  },[]);

  const T = THEMES[theme] || THEMES.dark;
  const showToast = m => { setToast(m); setTimeout(()=>setToast(null),3200); };

  const exporterExcel = () => {
    try {
      const entete = ["Reference","Date RDV","Heure","Statut","Client","Adresse","Telephone","Email","Technicien","Societe","Prestations","Temps passe","Majorations","Facturation","N facture","Motif non facture","Conclusion"];
      const echap = (v)=>{ const s=(v==null?"":String(v)).replace(/"/g,'""').replace(/\r?\n/g," "); return '"'+s+'"'; };
      const majLib = {soir50:"Soir +50%",weekend100:"Nuit/WE +100%"};
      const lignes = fiches.map(f=>{
        const prest = (f.prestations||[]).map(p=>{const m=PRESTATIONS.find(x=>x.id===p.id);return m?m.label:p.id;}).join(" / ");
        const maj = (f.majorations||[]).map(m=>majLib[m]||m).join(" + ");
        const stat = STATUTS[f.status]?.label || f.status || "";
        return [f.id,f.dateRdv||"",f.heureRdv||"",stat,f.client||"",f.adresse||"",f.tel||"",f.email||"",f.technicien||"",f.societe||"",prest,f.tempsInterne||"",maj,f.facturation||"",f.numeroFacture||"",f.raisonNonFacture||"",f.conclusion||""].map(echap).join(";");
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
    } catch(e){ dlgInfo("Erreur export : "+(e?.message||e)); }
  };

  useEffect(()=>{
    // Toutes ces écoutes nécessitent d'être connecté (les règles Firebase l'exigent) —
    // on ne les démarre donc qu'une fois currentUser confirmé, plutôt qu'au chargement de
    // la page. Avant ce correctif, elles démarraient immédiatement, avant même la connexion,
    // ce qui provoquait des erreurs "permission_denied" bénignes mais trompeuses (le temps
    // que la connexion se termine), pour TOUTES les données, pas seulement les droits d'accès.
    if(!currentUser) return;
    // Firebase — écoute en temps réel
    const unsub1 = watchFiches(data => { setFiches(data); setLoaded(true); lsSet("cache_fiches", data.map(stripLourd)); });
    const unsub2 = watchPositions(data => setPositions(data));
    const unsub3 = watchSocietes(data => { setSocietes(data); setSocietesLoaded(true); });
    const unsub4 = watchTechniciens(data => { setTechniciens(data); setTechniciensLoaded(true); });
    const unsub5 = watchLogos(data => setLogos(data));
    const unsubT = watchTechTels(data => setTechTels(data));
    const unsubTC = watchTechColors(data => setTechColors(data));
    const unsubAbs = watchAbsences(data => setAbsences(data));
    const unsubST = watchSousTraitants(data => setSousTraitants(data));
    const unsubPL = watchPrestationLabels(data => { applyPrestationLabels(data); setPrestaLabelsVersion(v=>v+1); });
    const unsubCh = watchChamps(data => setChampsCustom(data));
    const unsubPC = watchPrestationsCustom(data => { applyPrestationsCustom(data); setPrestationsCustomVersion(v=>v+1); });
    const unsubIA = watchParametresIA(data => setParametresIA(data));
    const unsubMsg = watchParametresMessages(data => setParametresMessages(data));
    const unsub6 = watchClients(data => setClients(data));
    const unsub7 = watchDevis(data => setDevisList(data));
    const unsub8 = watchContrats(data => setContrats(data));
    const unsub9 = watchTaches(data => setTaches(data));
    const unsubM = watchMemosVocaux(data => setMemosVocaux(data));
    const unsubR = watchUserRoles(data => { setUserRoles(data); setUserRolesLoaded(true); }, err => setRolesError(prev => prev || `Écoute temps réel : ${err?.message || err}`));
    const unsubAct = watchActiviteLog(data => setActiviteLog(data));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8(); unsub9(); unsubT(); unsubTC(); unsubAbs(); unsubST(); unsubPL(); unsubCh(); unsubPC(); unsubIA(); unsubMsg(); unsubM(); unsubR(); unsubAct(); };
  },[currentUser]);

  const creerModuleService = (item) => { savePrestationCustom(item); };
  const supprimerModuleService = (id) => { deletePrestationCustom(id); };

  const ajouterSociete = (nom) => {
    if (!societesLoaded) { console.warn("Liste sociétés pas encore chargée — ajout ignoré pour éviter d'écraser les données."); return; }
    const next = [...new Set([...societes, nom])];
    setSocietes(next); saveSocietes(next); // Firebase
  };
  const ajouterTechnicien = (nom) => {
    if (!techniciensLoaded) { console.warn("Liste techniciens pas encore chargée — ajout ignoré pour éviter d'écraser les données."); return; }
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
    // Technicien absent le jour du RDV : on refuse l'assignation.
    const abs = absenceDe((fiche.technicien||"").trim(), fiche.dateRdv, absences);
    if(abs){
      dlgInfo(`❌ ${abs.technicien} est absent du ${dateFr(abs.du)} au ${dateFr(abs.au)}${abs.motif?` (${abs.motif})`:""}.\nChoisissez un autre technicien ou une autre date.`);
      return;
    }
    if(typeof navigator!=="undefined" && !navigator.onLine){
      lsSet("pending_saves", [...(lsGet("pending_saves")||[]).filter(x=>x.id!==fiche.id), fiche]);
      setFiches(p=>[...p.filter(x=>x.id!==fiche.id), fiche]);
      setSelected(fiche); setView("detail");
      showToast("📴 Hors ligne — fiche mise en attente, envoi automatique au retour du réseau");
      return;
    }
    const prevAvantSave = fiches.find(x=>x.id===fiche.id);
    if (fiche.priseEnCharge && fiche.technicien?.trim() !== prevAvantSave?.technicien && fiche.technicien?.trim() !== fiche.priseEnCharge.par) {
      fiche = { ...fiche, priseEnCharge: null };
    }
    saveFiche(fiche); // Firebase
    try {
      if (fiche.societe && !societes.includes(fiche.societe)) ajouterSociete(fiche.societe);
      if (fiche.technicien?.trim() && !techniciens.includes(fiche.technicien.trim())) ajouterTechnicien(fiche.technicien.trim());
      const prev = prevAvantSave;
      if (fiche.technicien?.trim() && fiche.technicien.trim()!==prev?.technicien) {
        const details = [
          fiche.adresse ? `📍 ${fiche.adresse}` : "",
          (fiche.noteRdv||fiche.notesInternes) ? `📝 ${fiche.noteRdv||fiche.notesInternes}` : "",
        ].filter(Boolean).join(" — ");
        envoyerNotification(fiche.technicien.trim(), "🔧 Intervention assignée", `${fiche.client||"Client"} — ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}${details?" — "+details:""}`, fiche.id);
      } else if (!fiche.technicien?.trim() && !prevAvantSave) {
        // Nouvelle fiche créée sans technicien assigné → toute l'équipe est notifiée (libre à prendre)
        envoyerNotification(null, "🆓 Nouvelle intervention libre", `${fiche.client||"Client"} — ${dateFr(fiche.dateRdv)}${fiche.heureRdv?" à "+fiche.heureRdv:""}`, fiche.id);
      }
    } catch(e) { console.error(e); }
    setSelected(fiche); setView("detail"); showToast("✓ Fiche enregistrée");
  };

  const handleSaveRdv = rdv => {
    const absR = absenceDe((rdv.technicien||"").trim(), rdv.dateRdv, absences);
    if(absR){
      dlgInfo(`❌ ${absR.technicien} est absent du ${dateFr(absR.du)} au ${dateFr(absR.au)}${absR.motif?` (${absR.motif})`:""}.\nChoisissez un autre technicien ou une autre date.`);
      return;
    }
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
      const details = [
        rdv.adresse ? `📍 ${rdv.adresse}` : "",
        rdv.noteRdv ? `📝 ${rdv.noteRdv}` : "",
      ].filter(Boolean).join(" — ");
      envoyerNotification(rdv.technicien.trim(), "📅 Nouveau RDV assigné", `${rdv.client||"Client"} — ${dateFr(rdv.dateRdv)}${rdv.heureRdv?" à "+rdv.heureRdv:""}${details?" — "+details:""}`, rdv.id);
    } else if (!rdv.technicien?.trim() && !prevRdv) {
      // Nouveau RDV créé sans technicien assigné → toute l'équipe est notifiée (libre à prendre)
      envoyerNotification(null, "🆓 Nouveau RDV libre", `${rdv.client||"Client"} — ${dateFr(rdv.dateRdv)}${rdv.heureRdv?" à "+rdv.heureRdv:""}`, rdv.id);
    }
    setShowRdvForm(false); setView("accueil"); setNav("agenda"); showToast("📅 RDV planifié !");
  };

  const demarrerIntervention = rdv => {
    // Une fiche marquée "Devis" (voir bouton 💰 dans le formulaire de RDV) bascule vers la
    // création d'un vrai devis au lieu du formulaire d'intervention classique — pour éviter
    // qu'un devis se retrouve par erreur transformé en intervention facturable.
    if (rdv.natureRdv === "devis") {
      handleCreateDevis(rdv);
      return;
    }
    setEditing({
      client:rdv.client||"", adresse:rdv.adresse||"", adresseFacturation:rdv.adresseFacturation||"", contact:rdv.contact||"", tel:rdv.tel||"",
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
  const handleToggleFacturation = async (fiche, val, raisonPreDefinie) => {
    let raison = fiche.raisonNonFacture || "";
    if (val === "ne_pas_facturer") {
      if (raisonPreDefinie !== undefined) {
        raison = raisonPreDefinie;
      } else {
        const saisie = await dlgPrompt("Pourquoi cette intervention n'est pas facturée ?\nPar exemple : geste commercial, sous garantie, erreur précédente.", raison, {titre:"Motif de non-facturation",multiline:true,valider:"Enregistrer"});
        if (saisie === null) return; // annulé : on ne change rien
        raison = saisie.trim();
      }
    } else if (val !== fiche.facturation) {
      raison = ""; // on quitte "ne pas facturer" → motif remis à zéro
    }
    // Passage en "Facturé" : le numéro de facture est obligatoire (celui de Pennylane
    // une fois le brouillon validé). Sans numéro, on ne change pas le statut.
    let numeroFacture = fiche.numeroFacture || "";
    if (val === "facture") {
      const saisie = await dlgPrompt("Numéro de la facture, tel qu'il apparaît dans Pennylane.", numeroFacture, {titre:"Passer en facturé",valider:"Enregistrer"});
      if (saisie === null) return;                       // annulé
      if (!saisie.trim()) { dlgInfo("Le numéro de facture est obligatoire pour passer la fiche en facturé.","Numéro manquant"); return; }
      numeroFacture = saisie.trim();
    } else if (val !== fiche.facturation) {
      numeroFacture = "";                                // on quitte "Facturé" → numéro effacé
    }
    const nf={...fiche, facturation: val, raisonNonFacture: raison, numeroFacture};
    saveFiche(nf); setSelected(nf);
  };

  /* Un technicien restreint ne voit que ses fiches : lui montrer la liste de ses collègues
     dans les filtres n'a aucun effet et dévoile l'équipe sans raison. */
  const techFiltrables = estRestreint ? techniciens.filter(t=>t===monRole.technicien) : techniciens;
  /* Report d'un RDV depuis la carte de l'agenda : on ne touche qu'à la date et l'heure. */
  const replanifierFiche = useCallback((fiche, dateRdv, heureRdv) => {
    if ((fiche.dateRdv||"") === (dateRdv||"") && (fiche.heureRdv||"") === (heureRdv||"")) return;
    saveFiche({ ...fiche, dateRdv: dateRdv||"", heureRdv: heureRdv||"" });
  }, []);

  const filtered = useMemo(()=>{
    let r=fiches;
    if(estRestreint) r=r.filter(f=>f.technicien===monRole.technicien || (!f.technicien && !monRole.sousTraitant));
    if(search){
      const texteRecherche = sansAccents(search).toLowerCase().trim();
      const exact = r.filter(f=>sansAccents(`${f.client} ${f.adresse} ${f.id} ${f.technicien} ${f.numeroOS||""} ${f.conclusion||""}`).toLowerCase().includes(texteRecherche));
      if(exact.length===0 && texteRecherche.length>=3){
        // Rien trouvé exactement : on propose les fiches les plus proches (fautes de frappe/dictée)
        const notes = r.map(f=>{
          const res = scoreRessemblance(texteRecherche, `${f.client} ${f.adresse} ${f.technicien} ${f.numeroOS||""} ${f.conclusion||""}`);
          return {f, score:res.score, motTrouve:res.motTrouve};
        })
          .filter(x=>Number.isFinite(x.score))
          .sort((a,b)=>a.score-b.score);
        const proches = notes.filter(x=>x.score<0.65).slice(0,6);
        r = proches.map(x=>x.f);
        setTimeout(()=>{
          setRechercheFloue(r.length>0);
          setMotsTrouvesFloue(Object.fromEntries(proches.map(x=>[x.f.id, x.motTrouve])));
        },0);
      } else {
        r = exact;
        setTimeout(()=>setRechercheFloue(false),0);
      }
    } else {
      setTimeout(()=>setRechercheFloue(false),0);
    }
    if(filterStatus==="__retard") r=r.filter(estEnRetard);
    else if(filterStatus==="__aprogrammer") r=r.filter(estAProgrammer);
    else if(filterStatus==="__signees") r=r.filter(f=>f.signature);
    else if(filterStatus==="__afacturer") r=r.filter(f=>f.facturation==="a_facturer");
    else if(filterStatus==="__facture") r=r.filter(f=>f.facturation==="facture");
    else if(filterStatus==="__brouillon") r=r.filter(f=>f.facturation==="brouillon");
    else if(filterStatus==="planifie") r=r.filter(f=>f.status==="planifie"&&!estAProgrammer(f));
    else if(filterStatus) r=r.filter(f=>f.status===filterStatus);
    if(filterTech) r=r.filter(f=>f.technicien===filterTech);
    return r;
  },[fiches,search,filterStatus,filterTech,estRestreint,monRole.technicien,monRole.sousTraitant]);
  const filteredTriee = useMemo(()=>{
    const l = [...filtered];
    if(sortMode==="alpha") l.sort((a,b)=>(a.client||"").localeCompare(b.client||""));
    else if(sortMode==="date_asc") l.sort((a,b)=>(a.dateRdv||"").localeCompare(b.dateRdv||""));
    else l.sort((a,b)=>(b.dateRdv||"").localeCompare(a.dateRdv||""));
    return l;
  },[filtered,sortMode]);

  // Notifications reçues pendant que l'app est ouverte au premier plan
  // (le service worker ne gère que les notifications reçues quand l'app est en arrière-plan/fermée)
  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const supported = await fcmIsSupported();
        if (!supported) return;
        const messaging = getMessaging(app);
        unsub = onMessage(messaging, async (payload) => {
          const title = payload.notification?.title || payload.data?.title || "InterventionPro";
          const body = payload.notification?.body || payload.data?.body || "";
          showToast(`🔔 ${title} — ${body}`);
          // IMPORTANT : `new Notification(...)` ne fonctionne PAS sur iOS Safari/PWA, même une fois
          // la permission accordée — l'appel échoue silencieusement (d'où le bandeau visible mais
          // aucun son/vibration réel sur iPhone). Sur iOS, seul le Service Worker peut déclencher une
          // vraie notification système. On passe donc par navigator.serviceWorker.ready, qui fonctionne
          // aussi bien sur iOS que sur Android/desktop.
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              const reg = await navigator.serviceWorker.ready;
              if (reg && reg.showNotification) {
                const url = payload.data?.ficheId ? `/?fiche=${encodeURIComponent(payload.data.ficheId)}` : "/";
                await reg.showNotification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", vibrate: [200,100,200], tag: payload.data?.ficheId || undefined, data: { ficheId: payload.data?.ficheId || "", url } });
              } else {
                new Notification(title, { body, icon: "/icon-192.png" });
              }
            } catch(e) {
              try { new Notification(title, { body, icon: "/icon-192.png" }); } catch(e2) {}
            }
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
  const NAV=[{id:"dashboard",label:"Tableau de bord"},{id:"agenda",label:"Agenda"},{id:"devis",label:"Devis"}];
  const NAV_MENU=[{id:"liste",label:"Liste des interventions"},{id:"clients",label:"Clients et sites"},{id:"contrats",label:"Contrats d'entretien"},{id:"carte",label:"Carte des techniciens"},{id:"memos",label:"Historique des mémos vocaux"},{id:"admin",label:"Administration"},{id:"champs",label:"Personnaliser les cases"}];

  const dialogueHost = <DialogueHost theme={theme}/>;
  const offlineBanner = !online && (
    <div style={{background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"#fff",textAlign:"center",fontWeight:800,fontSize:12.5,padding:"8px 12px"}}>
      📴 Mode hors ligne — consultation possible, vos enregistrements et mémos vocaux seront synchronisés au retour du réseau
    </div>
  );

  // Bandeau non bloquant : si la confirmation des droits d'accès a échoué (règle Firebase,
  // réseau...), on continue de travailler normalement (accès complet par défaut après le
  // court délai de grâce) mais on affiche l'erreur exacte ici, visible sans console, pour
  // pouvoir la diagnostiquer précisément la prochaine fois que ça arrive.
  const rolesErrorBanner = rolesError && (
    <div style={{background:"rgba(239,68,68,0.15)",borderBottom:"1px solid rgba(239,68,68,0.4)",color:"#EF4444",textAlign:"center",fontWeight:700,fontSize:11.5,padding:"7px 12px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,flexWrap:"wrap"}}>
      <span>⚠️ Vérification des droits d'accès en échec ({rolesError.slice(0,140)}) — accès complet appliqué par défaut.</span>
      <button onClick={()=>setRolesError("")} style={{background:"none",border:"1px solid rgba(239,68,68,0.5)",color:"#EF4444",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:11}}>Masquer</button>
    </div>
  );
  const derniereErreurBanner = derniereErreur && (
    <div style={{background:"rgba(239,68,68,0.15)",borderBottom:"1px solid rgba(239,68,68,0.4)",color:"#EF4444",textAlign:"center",fontWeight:700,fontSize:11.5,padding:"7px 12px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,flexWrap:"wrap"}}>
      <span>🐞 Une erreur technique vient de se produire : {derniereErreur.slice(0,140)}</span>
      <button onClick={()=>setDerniereErreur("")} style={{background:"none",border:"1px solid rgba(239,68,68,0.5)",color:"#EF4444",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:11}}>Masquer</button>
    </div>
  );

  // Ouvre automatiquement la bonne fiche quand on arrive depuis une notification —
  // soit via le paramètre ?fiche=... (nouvel onglet), soit via un message envoyé par
  // le service worker si l'app était déjà ouverte (le focus seul ne change pas l'URL).
  const ouvrirFicheParId = (id) => {
    const cible = fiches.find(f=>f.id===id);
    if(cible){ setSelected(cible); setView("detail"); }
  };
  useEffect(()=>{
    if(!fiches.length) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("fiche");
    if(id){ ouvrirFicheParId(id); window.history.replaceState({}, "", window.location.pathname); }
  },[fiches.length>0]);
  useEffect(()=>{
    if(!("serviceWorker" in navigator)) return;
    const onMsg = (e) => {
      if(e.data?.type==="OUVRIR_FICHE" && e.data?.url){
        const id = new URL(e.data.url, window.location.origin).searchParams.get("fiche");
        if(id) ouvrirFicheParId(id);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return ()=>navigator.serviceWorker.removeEventListener("message", onMsg);
  },[fiches]);

  const fichesVisibles = useMemo(()=> estRestreint ? fiches.filter(f=>f.technicien===monRole.technicien || (!f.technicien && !monRole.sousTraitant)) : fiches, [fiches,estRestreint,monRole.technicien,monRole.sousTraitant]);
  const fichesEnRetard = useMemo(()=>{
    const seuil = Date.now() - 3*24*60*60*1000;
    return fichesVisibles.filter(f => f.status==="a_prevoir" && (f.createdAt||0) < seuil);
  },[fichesVisibles]);
  const retardBanner = fichesEnRetard.length>0 && nav!=="liste" && (
    <div onClick={()=>{setView("accueil");setNav("liste");setFilterStatus("a_prevoir");}} style={{cursor:"pointer",background:"rgba(249,115,22,0.15)",borderBottom:"1px solid rgba(249,115,22,0.35)",color:"#F97316",textAlign:"center",fontWeight:800,fontSize:12.5,padding:"8px 12px"}}>
      ⚠️ {fichesEnRetard.length} fiche(s) "Retour à prévoir" en attente depuis plus de 3 jours — cliquez pour voir
    </div>
  );

  const mailImportModal = showMailImport && (
    <MailImport theme={theme} onCancel={()=>setShowMailImport(false)}
      onExtracted={data=>{ setShowMailImport(false); setRdvPrefill({ technicien:"", status:"planifie", type:"rdv", ...data }); setShowRdvForm(true); }}/>
  );
  const voiceImportModal = showVoiceImport && (
    <VoiceImport theme={theme} techniciens={techniciens} clients={clients} initialTexte={voiceResume?.texte} initialMode={voiceResume?.mode}
      onCancel={()=>{setShowVoiceImport(false);setVoiceResume(null);}}
      onLog={memo=>saveMemoVocal(memo)}
      onExtracted={(mode,data)=>{
        setShowVoiceImport(false);
        setVoiceResume(null);
        if (mode==="rdv") { setRdvPrefill({ technicien:"", status:"planifie", type:"rdv", ...data }); setShowRdvForm(true); }
        else { setEditing({ technicien:"", ...data }); setView("form"); }
      }}/>
  );

  // ── Sécurité : connexion obligatoire ──
  // IMPORTANT : on vérifie authReady et currentUser AVANT de se soucier des droits d'accès
  // (userRoles). Firebase refuse de toute façon de lire les droits tant qu'on n'est pas
  // connecté — attendre cette info avant d'afficher le formulaire de connexion bloquait
  // l'écran de connexion lui-même (personne ne peut même taper son mot de passe).
  if(!authReady) return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px"}}>🔧</div>
        <div style={{fontSize:14,color:T.textMuted}}>Chargement…</div>
      </div>
    </div>
  );
  if(!currentUser) return <LoginPage theme={theme} />;
  // À partir d'ici, l'utilisateur est authentifié : on peut légitimement attendre la
  // confirmation de ses droits d'accès (admin ou technicien restreint) avant d'afficher
  // les données de l'app.
  if(monRole.role==="pending") return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:50,height:50,borderRadius:14,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px"}}>🔧</div>
        <div style={{fontSize:14,color:T.textMuted}}>Chargement…</div>
      </div>
    </div>
  );

  // Formulaire RDV plein écran
  if(showRdvForm) return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      {dialogueHost}
      {offlineBanner}
      {rolesErrorBanner}
      {derniereErreurBanner}
      {retardBanner}
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
      {dialogueHost}
      {offlineBanner}
      {rolesErrorBanner}
      {derniereErreurBanner}
      {retardBanner}
      {mailImportModal}
      {voiceImportModal}
      {showExportMensuel && <ExportMensuelModal fiches={fiches} theme={theme} onClose={()=>setShowExportMensuel(false)}/>}
      {showProfil&&<ProfilModal techniciens={techniciens} techNom={techNom} onSaveTechNom={n=>{setTechNom(n);localStorage.setItem("techNom",n);}} theme={theme} onClose={()=>setShowProfil(false)}/>}

      {/* HEADER */}
      <header style={{background:T.surface,backdropFilter:"blur(12px)",borderBottom:`1px solid ${T.border}`,padding:"0 16px",height:58,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:300,boxShadow:theme!=="dark"?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
        {/* Logo — icône seulement */}
        <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:"0 4px 14px rgba(14,165,233,0.3)",flexShrink:0}}>🔧</div>

        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>{setEditing(null);setView("form");}} style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(14,165,233,0.25)"}}>
            Nouvelle fiche
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
          <FicheForm champsCustom={champsCustom} initial={editing} onSave={handleSave} onBack={()=>setView(selected&&editing?"detail":"accueil")} fiches={fiches} theme={theme} societes={societes} onAddSociete={ajouterSociete} techniciens={techniciens} onAddTechnicien={ajouterTechnicien} logos={logos} onSaveLogo={(nom,d)=>saveLogo(nom,d)} onRemoveLogo={nom=>removeLogo(nom)} clients={clients} parametresIA={parametresIA}/>
        )}

        {view==="rdv"&&editing&&(
          <div style={{maxWidth:800,margin:"0 auto"}}>
            <RdvForm initial={editing} fiches={fiches} onSave={handleSaveRdv} onBack={()=>setView("detail")} theme={theme} techniciens={techniciens} onAddTechnicien={ajouterTechnicien}/>
          </div>
        )}

        {view==="detail"&&selected&&(
          <DetailFiche fiche={selected} theme={theme} techTels={techTels} onSaveTechTel={saveTechTel}
            sousTraitants={sousTraitants} onSaveSousTraitants={arr=>{setSousTraitants(arr);saveSousTraitants(arr);}}
            monTechnicien={estRestreint?monRole.technicien:null}
            onClaim={estRestreint&&!monRole.sousTraitant?(f)=>{const nf={...f,technicien:monRole.technicien};saveFiche(nf);setSelected(nf);showToast(`✋ Intervention attribuée à ${monRole.technicien}`);}:null}
            onConfirmerPriseEnCharge={(f)=>{const nf={...f,priseEnCharge:{par:f.technicien,ts:Date.now()}};saveFiche(nf);setSelected(nf);showToast(`✅ Prise en charge confirmée`);}}
            onMarquerEnvoye={(f)=>{const nf={...f,rapportEnvoye:true,rapportEnvoyeLe:Date.now()};saveFiche(nf);setSelected(nf);}}
            onLoguerAppel={(f,resultat,note)=>{
              const entry = { ts: Date.now(), par: (estRestreint?monRole.technicien:f.technicien)||"Admin", resultat, note: note||"" };
              const nf = {...f, journalAppels:[...(f.journalAppels||[]), entry]};
              saveFiche(nf); setSelected(nf);
              showToast(resultat==="reussi" ? "✅ Contact réussi enregistré" : "📋 Tentative enregistrée");
              // Plus de notification à toute l'équipe ici — trop bavard à l'usage. L'info reste
              // visible dans le journal d'appels de la fiche ; les seules notifications qui
              // partent désormais sont l'assignation, le rappel avant RDV, et les alertes sur les
              // fiches non traitées (soir/matin) — pour éviter la lassitude côté technicien.
            }}
            onAjouterCommentaire={(f,texte)=>{
              const auteur = monRole.technicien || "Admin";
              const c = { ts: Date.now(), par: auteur, texte };
              const nf = {...f, commentaires:[...(f.commentaires||[]), c]};
              saveFiche(nf); setSelected(nf);
              showToast("💬 Note ajoutée");
              // Pas de diffusion à toute l'équipe (trop bavard), mais le technicien assigné
              // à la fiche est prévenu — sauf s'il est lui-même l'auteur de la note.
              const destinataire = (f.technicien||"").trim();
              if(destinataire && destinataire !== auteur){
                envoyerNotification(destinataire, "💬 Note sur votre intervention",
                  `${auteur} — ${f.client||"Client"} : ${texte.length>90?texte.slice(0,90)+"…":texte}`, f.id);
              }
            }}
            onModifierCommentaire={(f,ts,nouveauTexte)=>{
              const nf = {...f, commentaires:(f.commentaires||[])
                .filter(c=>!(c.ts===ts && nouveauTexte===null))
                .map(c=>c.ts===ts && nouveauTexte!==null ? {...c, texte:nouveauTexte, modifieLe:Date.now()} : c)
              };
              saveFiche(nf); setSelected(nf);
              showToast(nouveauTexte===null ? "🗑️ Note supprimée" : "✏️ Note modifiée");
              const auteurModif = monRole.technicien || "Admin";
              const destinataire = (f.technicien||"").trim();
              if(nouveauTexte!==null && destinataire && destinataire !== auteurModif){
                envoyerNotification(destinataire, "✏️ Note modifiée sur votre intervention",
                  `${auteurModif} — ${f.client||"Client"} : ${nouveauTexte.length>90?nouveauTexte.slice(0,90)+"…":nouveauTexte}`, f.id);
              }
            }}
            onSupprimerAppel={(f,ts)=>{
              const nf = {...f, journalAppels:(f.journalAppels||[]).filter(e=>e.ts!==ts)};
              saveFiche(nf); setSelected(nf);
              showToast("🗑️ Entrée supprimée");
            }}
            onPreparerFacturePennylane={estRestreint ? null : (f)=>{
              const montant = calculerMontant(f.tempsInterne, f.tarifHoraire);
              let tarifConnu = montant!=="—" && !isNaN(parseFloat(montant));
              let coef=1; (f.majorations||[]).forEach(m=>{ if(m==="soir50")coef+=0.5; if(m==="weekend100")coef+=1; });
              let prixUnitaire = tarifConnu ? (parseFloat(montant)*coef).toFixed(2) : "0.00";
              let tauxTva = 20;
              // Si le temps/tarif horaire ne sont pas renseignés, on cherche un prix au forfait
              // mentionné en texte libre (ex: "340€ht tva 10") dans les notes de prestation ou la
              // conclusion — pour ne pas laisser 0€ alors que le prix a bien été dicté quelque part.
              if(!tarifConnu){
                const textesACherche = [...(f.prestations||[]).map(p=>p.note||""), f.conclusion||""];
                for(const t of textesACherche){
                  const m = t.match(/(\d+(?:[.,]\d+)?)\s*€?\s*(?:ht|h\.t\.?)\b[^.]*?tva\s*(\d+(?:[.,]\d+)?)/i) || t.match(/(\d+(?:[.,]\d+)?)\s*€\s*(?:ht|h\.t\.?)\b/i);
                  if(m){ prixUnitaire=parseFloat(m[1].replace(",",".")).toFixed(2); if(m[2]) tauxTva=parseFloat(m[2].replace(",",".")); tarifConnu=true; break; }
                }
              }
              const labelPresta = ((f.prestations||[]).map(p=>PRESTATIONS.find(x=>x.id===p.id)?.label).filter(Boolean).join(", ") || "Intervention") + (tarifConnu?"":" (tarif à définir)");
              // Détail de l'intervention pour la ligne de facture : la conclusion rédigée si elle
              // existe, sinon on assemble les infos clés de chaque prestation (problème/action/résultat).
              // On retire aussi les formules de politesse type "restons à votre disposition..." qui
              // n'ont pas leur place sur une ligne de facture (adaptées à un rapport, pas à une facture).
              const nettoyer = (t) => (t||"").replace(/Nous restons (?:à votre disposition|disponibles) pour toute question relative[^.]*\.?/gi, "").replace(/N['’]hésitez pas à nous contacter[^.]*\.?/gi, "").trim();
              // Une facture n'a pas besoin de toute la conclusion détaillée du rapport (déjà
              // transmise au client à part) — juste un résumé court : quoi, sans tout le récit.
              // Ça évite aussi une description trop longue qui ferait déborder la mise en page
              // de la facture sur une deuxième page (mise en page que Pennylane ne permet pas
              // d'ajuster de notre côté).
              const resumer = (t, maxPhrases=5, maxChars=500) => {
                if(!t) return "";
                const phrases = t.match(/[^.!?]+[.!?]+/g) || [t];
                let r = phrases.slice(0, maxPhrases).join(" ").trim();
                if(r.length > maxChars) r = r.slice(0, maxChars).trim() + "…";
                return r;
              };
              const detail = resumer(nettoyer(f.conclusion?.trim())) || (f.prestations||[]).map(p=>{
                const meta = PRESTATIONS.find(x=>x.id===p.id);
                const bouts = [
                  p.problemes?.length ? `Problème : ${p.problemes.join(", ")}` : "",
                  p.actions?.length ? `Action : ${p.actions.join(", ")}` : "",
                  p.resultats?.length ? `Résultat : ${p.resultats.join(", ")}` : "",
                ].filter(Boolean).join(". ");
                return bouts ? `${meta?.label||""} — ${bouts}` : "";
              }).filter(Boolean).join("\n") || "";
              return { label: labelPresta, description: detail, prixUnitaire, tauxTva, client: f.client||"Client", adresse: f.adresseFacturation||f.adresse||"" };
            }}
            onEnvoyerFacturePennylane={estRestreint ? null : async (f, draft)=>{
              try {
                const r = await fetch("/api/creer-facture-pennylane", {
                  method:"POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({
                    client: draft.client,
                    adresse: draft.adresse,
                    dateFacture: f.dateRdv || today(),
                    lignes: [{ label: draft.label, description: draft.description, quantite: 1, prixUnitaire: draft.prixUnitaire, tauxTva: draft.tauxTva }],
                  }),
                });
                const d = await r.json().catch(()=>({}));
                if(d.ok){
                  const nf = {...f, pennylaneInvoiceId: d.invoiceId, pennylaneInvoiceNumber: d.invoiceNumber};
                  saveFiche(nf); setSelected(nf);
                  showToast(`🧾 Facture Pennylane créée (n° ${d.invoiceNumber||d.invoiceId}) — à valider dans Pennylane`);
                } else {
                  dlgInfo("❌ Échec de la création de la facture Pennylane : "+(d.error||"erreur inconnue"));
                }
              } catch(e) {
                dlgInfo("❌ Erreur réseau lors de la création de la facture : "+e.message);
              }
            }}
            onVerifierCases={estRestreint ? null : (f)=>{
              const texte = f.conclusion?.trim() || (f.prestations||[]).map(p=>{
                const meta = PRESTATIONS.find(x=>x.id===p.id);
                return `${meta?.label} : ${[p.problemes?.join(", "),p.causes?.join(", "),p.actions?.join(", "),p.resultats?.join(", "),p.note].filter(Boolean).join(" / ")}`;
              }).join("\n");
              setChampsPrefill({ texte, photo: f.photos?.[0]?.data || null });
              setView("accueil"); setNav("champs");
            }}
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
                  {!techNom&&<span style={{display:"inline-block",marginLeft:5,width:7,height:7,borderRadius:"50%",background:"#EF4444",verticalAlign:"middle"}}/>}
                </button>
                {menuOpen&&(
                  <>
                    <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:390}}/>
                    <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:400,background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:12,padding:8,minWidth:230,boxShadow:"0 16px 48px rgba(0,0,0,0.35)"}}>
                      {NAV_MENU.filter(n=>!estRestreint || n.id==="liste").map(n=>(
                        <button key={n.id} onClick={()=>{setNav(n.id);setMenuOpen(false);}}
                          style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",
                            background:nav===n.id?"rgba(14,165,233,0.14)":"transparent",
                            color:nav===n.id?"#0EA5E9":T.text}}>
                          {n.label}
                        </button>
                      ))}
                      <button onClick={()=>{setShowProfil(true);setMenuOpen(false);}}
                        style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",padding:"10px 12px",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",background:"transparent",color:T.text}}>
                        Cet appareil et notifications
                        {!techNom&&<span style={{width:8,height:8,borderRadius:"50%",background:"#EF4444"}}/>}
                      </button>
                      {!estRestreint&&<button onClick={()=>{exporterExcel();setMenuOpen(false);}}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"10px 12px",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",background:"transparent",color:"#10B981"}}>
                        Exporter en Excel
                      </button>}
                      <div style={{borderTop:`1px solid ${T.border}`,margin:"8px 4px",paddingTop:10}}>
                        <div style={{fontSize:9.5,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:7,paddingLeft:8}}>Couleur de l'écran</div>
                        <div style={{display:"flex",gap:6,paddingLeft:8,paddingBottom:4}}>
                          {Object.values(THEMES).map(t=>(
                            <button key={t.id} onClick={()=>{setTheme(t.id);lsSet("theme",t.id);}} title={t.label}
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
                          Se déconnecter
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
                {/* Dans l'agenda, la semaine prime : seule la recherche reste au-dessus. */}
                {nav!=="agenda"&&(<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                  style={{padding:"10px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"}}>
                  <option value="">Tous statuts</option>
                  <option value="__retard">⏰ En retard</option>
                  <option value="__aprogrammer">📌 À planifier</option>
                  {Object.entries(STATUTS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  <option value="__signees">✍️ Signées</option>
                  <option value="__afacturer">💶 À facturer</option>
                  <option value="__brouillon">🧾 Brouillon (à valider dans Pennylane)</option>
                  <option value="__facture">✅ Facturé</option>
                </select>)}
                {nav!=="liste"&&nav!=="agenda"&&(
                  <select value={filterTech} onChange={e=>{setFilterTech(e.target.value);if(e.target.value&&nav==="agenda")setNav("liste");}}
                    style={{padding:"10px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"}}>
                    <option value="">{estRestreint?"Mes fiches et les fiches libres":"Tous techniciens"}</option>
                    {techFiltrables.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                {nav==="liste"&&(
                  <select value={sortMode} onChange={e=>setSortMode(e.target.value)} title="Trier"
                    style={{padding:"10px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:12,outline:"none",cursor:"pointer",fontFamily:"inherit",colorScheme:theme==="dark"?"dark":"light"}}>
                    <option value="date_desc">↓ Plus récent</option>
                    <option value="date_asc">↑ Plus ancien</option>
                    <option value="alpha">A→Z Client</option>
                  </select>
                )}
                <span style={{fontSize:12,color:T.textMuted}}>{filtered.length}/{fiches.length}</span>
              </div>
            )}
            {nav==="liste"&&techFiltrables.length>0&&(
              <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                <button onClick={()=>setFilterTech("")} style={{padding:"6px 13px",borderRadius:20,border:`1.5px solid ${!filterTech?"#0EA5E9":T.border}`,background:!filterTech?"rgba(14,165,233,0.14)":T.surface,color:!filterTech?"#0EA5E9":T.textMuted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{estRestreint?"Tout voir":"Tous"}</button>
                {techFiltrables.map(t=>{
                  const c = techColor(t, techniciens, techColors);
                  const actif = filterTech===t;
                  return (
                    <button key={t} onClick={()=>setFilterTech(actif?"":t)} style={{padding:"6px 13px",borderRadius:20,border:`1.5px solid ${actif?c:T.border}`,background:actif?c+"22":T.surface,color:actif?c:T.textMuted,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      👤 {t}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bandeau filtre actif */}
            {nav==="liste"&&(filterStatus||filterTech)&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 14px",background:"rgba(14,165,233,0.1)",border:"1px solid rgba(14,165,233,0.35)",borderRadius:8,flexWrap:"wrap"}}>
                <span style={{fontSize:12,fontWeight:700,color:"#0EA5E9"}}>
                  Filtre :{filterStatus?` ${filterStatus==="__retard" ? "⏰ En retard" : filterStatus==="__aprogrammer" ? "📌 À planifier" : filterStatus==="__signees" ? "✍️ Signées" : filterStatus==="__afacturer" ? "💶 À facturer" : filterStatus==="__brouillon" ? "🧾 Brouillon" : filterStatus==="__facture" ? "✅ Facturé" : STATUTS[filterStatus]?.label}`:""}{filterStatus&&filterTech?" · ":""}{filterTech?` 👤 ${filterTech}`:""} — {filtered.length} fiche(s)
                </span>
                <button onClick={()=>{setFilterStatus("");setFilterTech("");}} style={{marginLeft:"auto",background:"none",border:"1px solid rgba(14,165,233,0.4)",borderRadius:6,color:"#0EA5E9",fontSize:11,fontWeight:700,cursor:"pointer",padding:"3px 10px",fontFamily:"inherit"}}>✕ Tout afficher</button>
              </div>
            )}

            {nav==="dashboard"&&<TableauDeBord fiches={fichesVisibles} theme={theme} onNew={()=>{setEditing(null);setView("form");}} onNewRdv={()=>setShowRdvForm(true)} onDemarrer={demarrerIntervention} onSelect={f=>{setSelected(f);setView("detail");}} onFilterStatus={s=>{setFilterStatus(s);setNav("liste");}} taches={taches} onAjouterTache={ajouterTache} onToggleTache={toggleTache} onSupprimerTache={supprimerTache}/>}
            {nav==="champs"&&<ChampsEditor champs={champsCustom} onSave={saveChamps} onSavePrestationLabel={savePrestationLabel} theme={theme} onCreateModule={creerModuleService} onDeleteModule={supprimerModuleService} prefill={champsPrefill} onPrefillConsumed={()=>setChampsPrefill(null)}/>}
            {nav==="admin"&&<AdminView societes={societes} techniciens={techniciens} techTels={techTels} techColors={techColors} logos={logos} champs={champsCustom}
              sousTraitants={sousTraitants} onSaveSousTraitants={arr=>{setSousTraitants(arr);saveSousTraitants(arr);}}
              onSaveSocietes={arr=>{setSocietes(arr);saveSocietes(arr);}}
              onSaveTechniciens={arr=>{setTechniciens(arr);saveTechniciens(arr);}}
              onSaveTechTel={saveTechTel} onSaveTechColor={saveTechColor} onSaveLogo={saveLogo} onRemoveLogo={removeLogo}
              onSaveChamps={saveChamps} onGoChamps={()=>setNav("champs")} onOpenExport={()=>setShowExportMensuel(true)}
              parametresIA={parametresIA} onSaveParametresIA={p=>{setParametresIA(p);saveParametresIA(p);}}
              parametresMessages={parametresMessages} onSaveParametresMessages={p=>{setParametresMessages(p);saveParametresMessages(p);}}
              absences={absences} onSaveAbsence={estRestreint?null:saveAbsenceFb} onDeleteAbsence={estRestreint?null:deleteAbsenceFb}
              userRoles={userRoles} onSaveUserRole={saveUserRole} onDeleteUserRole={deleteUserRole} theme={theme} activiteLog={activiteLog} fiches={fiches}/>}
            {nav==="agenda"&&search.trim()&&(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",borderRadius:10,padding:"7px 15px",fontWeight:800,fontSize:13}}>🔍 Résultats — toutes dates</div>
                  <div style={{flex:1,height:1,background:T.border}}/>
                  <span style={{fontSize:12,color:T.textMuted}}>{filtered.length} fiche(s)</span>
                </div>
                {rechercheFloue&&filtered.length>0&&(
                  <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:10,padding:"9px 14px",marginBottom:10,fontSize:12.5,color:"#F59E0B",fontWeight:600}}>
                    🤔 Aucune correspondance exacte pour « {search} » — voici les fiches qui s'en rapprochent le plus.
                  </div>
                )}
                {filtered.length===0
                  ? <div style={{textAlign:"center",padding:"24px",color:T.textMuted,fontSize:13,background:T.surface,border:`1px dashed ${T.border}`,borderRadius:12}}>Aucune intervention ne correspond à « {search} », même en recherche approximative.</div>
                  : [...filtered].sort((a,b)=>(b.dateRdv||"").localeCompare(a.dateRdv||"")).map(f=>(
                      <div key={f.id}>
                        <AgendaCarte fiche={f} etat={(f.type==="rdv"||(f.status==="planifie"&&!f.prestations?.length))?"rdv":"complete"} onSelect={x=>{setSelected(x);setView("detail");}} onDemarrer={demarrerIntervention} T={T} techniciens={techniciens} techColors={techColors} onReplanifier={replanifierFiche}/>
                        {rechercheFloue&&motsTrouvesFloue[f.id]&&(
                          <div style={{fontSize:11,color:"#F59E0B",marginTop:-6,marginBottom:8,paddingLeft:6}}>🔍 Ressemble à « {motsTrouvesFloue[f.id]} » dans « {search} »</div>
                        )}
                      </div>
                    ))}
              </div>
            )}
            {nav==="agenda"&&!search.trim()&&<Agenda actionsCreation={<div style={{display:"flex",gap:10,marginBottom:14}}>
    <button onClick={()=>setShowMailImport(true)} style={{flex:1,background:"linear-gradient(135deg,#A78BFA,#7C3AED)",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 18px rgba(124,58,237,0.3)"}}>RDV depuis un mail</button>
    <button onClick={()=>{setRdvPrefill({technicien:"",status:"planifie",type:"rdv",dateRdv:agendaJour});setShowRdvForm(true);}} style={{flex:1,background:"linear-gradient(135deg,#3B82F6,#2563EB)",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 18px rgba(59,130,246,0.3)"}}>Nouveau RDV</button>
    <button onClick={()=>setShowVoiceImport(true)} style={{flex:1,background:"linear-gradient(135deg,#0EA5E9,#6366F1)",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 18px rgba(14,165,233,0.3)"}}>Mémo vocal</button>
                </div>} fiches={filtered} theme={theme} jour={agendaJour} onJour={setAgendaJour} absences={absences} onReplanifier={replanifierFiche} techniciens={techniciens} techColors={techColors} onSelect={f=>{setSelected(f);setView("detail");}} onDemarrer={demarrerIntervention} onProgrammer={(fiche,date)=>{const nf={...fiche,dateRdv:date};saveFiche(nf);showToast("📅 Programmé le "+dateFr(date));}} onNewRdv={d=>{setRdvPrefill({technicien:"",status:"planifie",type:"rdv",dateRdv:d});setShowRdvForm(true);}}/>}
            {nav==="clients"&&<ClientsView clients={clients} fiches={fiches} onSaveClient={handleSaveClient} onDeleteClient={deleteClient} onSelectFiche={f=>{setSelected(f);setView("detail");}} theme={theme}/>}
            {nav==="contrats"&&<ContratsView contrats={contrats} clients={clients} techniciens={techniciens} onSaveContrat={saveContrat} onDeleteContrat={deleteContrat} theme={theme}/>}
            {nav==="devis"&&<DevisList devisList={devisList} theme={theme} onCreate={()=>{setEditingDevis({id:nextDevisNum(devisList),date:today(),client:"",site:"",adresse:"",tva:10,statut:"brouillon",lignes:[{label:"",qte:1,pu:""}],photos:[],notes:"",createdAt:ts(),_photosDispo:[]});setView("devisform");}} onOpen={dv=>{setEditingDevis(dv);setView("devisform");}} onChangeStatut={(dv,s)=>saveDevisFb({...dv,statut:s})} onDelete={async dv=>{if(await dlgConfirm("Le devis "+dv.id+" sera supprimé définitivement.",{titre:"Supprimer le devis",danger:true}))deleteDevisFb(dv.id);}}/>}
            {nav==="liste"&&<ListeCartes fiches={filteredTriee} theme={theme} techniciens={techniciens} techTels={techTels} onSelect={f=>{setSelected(f);setView("detail");}} onDelete={async f=>{if(await dlgConfirm("L\u2019intervention "+f.id+" ("+(f.client||"sans client")+") sera supprim\u00e9e d\u00e9finitivement.",{titre:"Supprimer l\u2019intervention",danger:true})){deleteFiche(f.id);showToast("\ud83d\uddd1\ufe0f Supprim\u00e9e");}}}/>}
            {nav==="carte"&&<CarteView fiches={fichesVisibles} positions={positions} theme={theme}/>}
            {nav==="memos"&&<MemosVocauxView memos={memosVocaux} theme={theme} onReprendre={m=>{setVoiceResume({texte:m.texte,mode:m.mode});setShowVoiceImport(true);}}/>}
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
