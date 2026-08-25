// Fonction serveur Vercel — création d'une facture brouillon dans Pennylane à partir
// d'une fiche InterventionPro.
//
// Prudence volontaire pour ce premier jet : la facture est toujours créée en BROUILLON
// ("draft": true) dans Pennylane — jamais envoyée automatiquement au client. Adel la
// relit et la valide lui-même directement dans Pennylane.
//
// Nécessite la variable d'environnement Vercel PENNYLANE_API_KEY (clé API générée depuis
// Pennylane → Paramètres → API).

const BASE = "https://app.pennylane.com/api/external/v2";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${label}) après ${ms}ms`)), ms)),
  ]);
}

async function trouverOuCreerClient(client, adresse, headers) {
  // Recherche d'abord un client existant portant ce nom exact, pour éviter les doublons.
  const filtre = encodeURIComponent(JSON.stringify([{ field: "name", operator: "eq", value: client }]));
  const rechercheRes = await withTimeout(fetch(`${BASE}/customers?filter=${filtre}`, { headers }), 8000, "recherche client");
  const rechercheData = await rechercheRes.json().catch(() => ({}));
  if (rechercheRes.ok && Array.isArray(rechercheData.items) && rechercheData.items.length) {
    return rechercheData.items[0].id;
  }
  // Pas trouvé : on le crée — attention, l'endpoint de CRÉATION est différent de celui
  // de recherche (/company_customers, pas /customers — piège classique de l'API v2).
  // Note : on ne transmet que le nom pour l'instant — l'adresse de facturation Pennylane
  // attend un format structuré (rue/code postal/ville séparés) qu'on ne construit pas ici
  // pour éviter une erreur de format ; à compléter manuellement dans Pennylane si besoin.
  const creationRes = await withTimeout(fetch(`${BASE}/company_customers`, {
    method: "POST", headers,
    body: JSON.stringify({ name: client }),
  }), 8000, "création client");
  const creationData = await creationRes.json().catch(() => ({}));
  if (!creationRes.ok) throw new Error("Création du client Pennylane échouée : " + (creationData?.message || creationRes.status));
  return creationData.id;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "Méthode non autorisée" }); return; }
  const cle = process.env.PENNYLANE_API_KEY;
  if (!cle) { res.status(500).json({ ok: false, error: "PENNYLANE_API_KEY manquante côté serveur (Vercel → Settings → Environment Variables)" }); return; }

  const headers = { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", Accept: "application/json" };

  try {
    const { client, adresse, lignes, dateFacture } = req.body || {};
    if (!client || !Array.isArray(lignes) || !lignes.length) {
      res.status(400).json({ ok: false, error: "Données manquantes : client et au moins une ligne de facturation sont requis." });
      return;
    }

    const customerId = await trouverOuCreerClient(client, adresse, headers);

    const invoiceLines = lignes.map(l => ({
      label: l.label || "Intervention",
      quantity: l.quantite || 1,
      unit: "piece",
      raw_currency_unit_price: String(l.prixUnitaire || 0),
      vat_rate: "FR_200", // TVA 20% par défaut — à ajuster si besoin d'un autre taux
    }));

    const factureRes = await withTimeout(fetch(`${BASE}/customer_invoices`, {
      method: "POST", headers,
      body: JSON.stringify({
        customer_id: customerId,
        date: dateFacture || new Date().toISOString().slice(0, 10),
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
    });
  } catch (e) {
    console.error("creer-facture-pennylane error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
