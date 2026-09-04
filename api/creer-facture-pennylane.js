// Fonction serveur Vercel — création d'une facture brouillon dans Pennylane à partir
// d'une fiche InterventionPro.
//
// Prudence volontaire : la facture est toujours créée en BROUILLON ("draft": true) dans
// Pennylane — jamais envoyée automatiquement au client. Adel la relit et la valide
// lui-même directement dans Pennylane.
//
// Nécessite la variable d'environnement Vercel PENNYLANE_API_KEY (clé API générée depuis
// Pennylane → Paramètres → API).

const BASE = "https://app.pennylane.com/api/external/v2";

// Pennylane exige une adresse de facturation structurée (rue / code postal / ville
// séparés), alors que nos fiches ne stockent qu'une adresse complète en une seule ligne
// (ex: "35 rue Jules Ferry, 94600 Choisy-le-Roi"). On l'extrait automatiquement ici.
// Note : le pays doit être transmis sous la clé "country_alpha2" (code à 2 lettres),
// pas "country" — confirmé après un premier essai raté avec le mauvais nom de champ.
function parseAdresseFr(adresseComplete) {
  const defaut = { address: "Non renseignée", postal_code: "00000", city: "Non renseignée", country_alpha2: "FR" };
  if (!adresseComplete) return defaut;
  const m = adresseComplete.match(/^(.*?),?\s*(\d{5})\s+(.+)$/);
  if (m) return { address: m[1].trim() || "Non renseignée", postal_code: m[2], city: m[3].trim(), country_alpha2: "FR" };
  return { ...defaut, address: adresseComplete }; // format inattendu : on garde le texte tel quel, à corriger dans Pennylane si besoin
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${label}) après ${ms}ms`)), ms)),
  ]);
}

// Source des doublons : la recherche se faisait sur le nom EXACT. « SDC 272 - COEUR
// CITADIN » et « SDC 272 – COEUR CITADIN » (tiret long) sont deux clients différents
// pour Pennylane, alors que c'est le même pour nous. On compare donc sur une forme
// normalisée : sans accents, sans casse, tirets et espaces unifiés.
function normaliserNom(nom) {
  return (nom || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // accents
    .replace(/[–—−]/g, "-")                             // tirets longs → tiret simple
    .replace(/[^a-zA-Z0-9]+/g, " ")                     // ponctuation → espace
    .trim().replace(/\s+/g, " ")
    .toLowerCase();
}

// Les réponses de l'API n'ont pas toujours la même enveloppe selon l'endpoint.
function extraireListe(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.customers)) return data.customers;
  return [];
}

async function chercherParFiltre(filtreObjet, headers, label) {
  const filtre = encodeURIComponent(JSON.stringify(filtreObjet));
  const res = await withTimeout(fetch(`${BASE}/customers?filter=${filtre}&limit=100`, { headers }), 8000, label);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return extraireListe(data);
}

async function trouverOuCreerClient(client, adresse, headers) {
  const cible = normaliserNom(client);

  // 1. Nom exact — le cas le plus fréquent, et le moins coûteux.
  let candidats = await chercherParFiltre([{ field: "name", operator: "eq", value: client }], headers, "recherche client (exact)");
  let trouve = candidats.find(c => normaliserNom(c.name) === cible);
  if (trouve) return { id: trouve.id, cree: false, nomPennylane: trouve.name };

  // 2. Recherche approchante : on prend le premier mot significatif du nom et on
  //    compare nous-mêmes sur la forme normalisée. C'est ce qui rattrape les tirets,
  //    accents et espaces doubles qui créaient des doublons.
  const racine = (client || "").trim().split(/\s+/).slice(0, 2).join(" ");
  if (racine && racine.length >= 3) {
    candidats = await chercherParFiltre([{ field: "name", operator: "match", value: racine }], headers, "recherche client (approchante)");
    trouve = candidats.find(c => normaliserNom(c.name) === cible);
    if (trouve) return { id: trouve.id, cree: false, nomPennylane: trouve.name };
  }

  // 3. Toujours rien : on crée — attention, l'endpoint de CRÉATION est différent de
  //    celui de recherche (/company_customers, pas /customers — piège de l'API v2).
  //    billing_address est obligatoire côté Pennylane, au format structuré.
  const creationRes = await withTimeout(fetch(`${BASE}/company_customers`, {
    method: "POST", headers,
    body: JSON.stringify({ name: client, billing_address: parseAdresseFr(adresse) }),
  }), 8000, "création client");
  const creationData = await creationRes.json().catch(() => ({}));
  if (!creationRes.ok) throw new Error("Création du client Pennylane échouée : " + (creationData?.message || creationRes.status));
  return { id: creationData.id, cree: true, nomPennylane: client };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Méthode non autorisée" }); return; }
  const cle = process.env.PENNYLANE_API_KEY;
  if (!cle) { res.status(500).json({ ok: false, error: "PENNYLANE_API_KEY manquante côté serveur (Vercel → Settings → Environment Variables)" }); return; }

  const headers = { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", Accept: "application/json" };

  try {
    const { client, adresse, lignes, dateFacture, clientIdImpose } = req.body || {};
    if (!client || !Array.isArray(lignes) || !lignes.length) {
      res.status(400).json({ ok: false, error: "Données manquantes : client et au moins une ligne de facturation sont requis." });
      return;
    }

    // clientIdImpose : permet de forcer un client déjà choisi, sans nouvelle recherche.
    const resultatClient = clientIdImpose
      ? { id: clientIdImpose, cree: false, nomPennylane: client }
      : await trouverOuCreerClient(client, adresse, headers);

    // Correspondance taux de TVA (%) → code Pennylane. Le taux peut être détecté
    // automatiquement dans le texte dicté (ex: "TVA 10") — sinon 20% par défaut.
    const codeTva = (taux) => {
      const t = Math.round(taux || 20);
      if (t === 10) return "FR_100";
      if (t === 5 || t === 6) return "FR_055"; // 5,5%
      if (t === 2) return "FR_021"; // 2,1%
      return "FR_200"; // 20% par défaut
    };
    const invoiceLines = lignes.map(l => ({
      label: l.label || "Intervention",
      ...(l.description?.trim() ? { description: l.description.trim() } : {}),
      quantity: l.quantite || 1,
      unit: "piece",
      raw_currency_unit_price: String(l.prixUnitaire || 0),
      vat_rate: codeTva(l.tauxTva),
    }));

    const dateFactureFinale = dateFacture || new Date().toISOString().slice(0, 10);
    const echeance = new Date(dateFactureFinale);
    echeance.setDate(echeance.getDate() + 30);
    const factureRes = await withTimeout(fetch(`${BASE}/customer_invoices`, {
      method: "POST", headers,
      body: JSON.stringify({
        customer_id: resultatClient.id,
        date: dateFactureFinale,
        deadline: echeance.toISOString().slice(0, 10), // échéance à 30 jours — probablement obligatoire côté Pennylane
        invoice_lines: invoiceLines,
        draft: true, // toujours en brouillon — validation manuelle dans Pennylane
      }),
    }), 8000, "création facture");
    const factureData = await factureRes.json().catch(() => ({}));
    if (!factureRes.ok) throw new Error("Création de la facture Pennylane échouée : " + (factureData?.message || factureRes.status));

    res.status(200).json({
      ok: true,
      invoiceId: factureData.id,
      invoiceNumber: factureData.invoice_number,
      montant: factureData.currency_amount,
      // Permet à l'application de prévenir : un nouveau client vient d'être créé,
      // c'est le moment de vérifier que ce n'est pas un doublon.
      clientCree: resultatClient.cree,
      clientId: resultatClient.id,
      clientNom: resultatClient.nomPennylane,
    });
  } catch (e) {
    console.error("creer-facture-pennylane error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
