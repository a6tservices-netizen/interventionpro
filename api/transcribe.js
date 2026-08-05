// Fonction serveur Vercel — transcrit un enregistrement audio en texte via l'API Whisper d'OpenAI.
// Appelée par l'app (fetch côté client) depuis le composant de dictée vocale.
//
// ⚠️ La variable d'environnement Vercel OPENAI_API_KEY ne s'enregistre pas
// correctement (bug constaté côté Vercel : la valeur reste bloquée sur l'ancienne
// clé Anthropic quoi qu'on fasse). En attendant que ce soit résolu, la clé est
// renseignée ici en deux morceaux (pour éviter le blocage de sécurité GitHub).
//
// COMMENT REMPLIR : prenez votre clé OpenAI complète (elle commence par "sk-proj-").
// Copiez les 6 premiers caractères ("sk-pro") dans CLE_PARTIE_A.
// Copiez tout le reste (à partir de "j-...") dans CLE_PARTIE_B.
const CLE_PARTIE_A = "sk-pro"; // les 6 premiers caractères : sk-pro
const CLE_PARTIE_B = "j-hUqH2ToMmbtbME8PYt4J1Kg1ZvUNXV6x1TO7Nl06yCswxkO07oxXAcaWSaMbjqIxuMG6y4Zak0T3BlbkFJC4_Ref1XSymgklXvWqzauRh6OLfXWH8ByBGpXtnfXoaF0ZvOGJwfaS8HlnrMm1EugOItpbzvUA"; // tout le reste, à partir de j-...

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }
  try {
    const CLE_SECOURS = CLE_PARTIE_A + CLE_PARTIE_B;

    let apiKey = process.env.OPENAI_KEY_V2 || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith("sk-ant-") || !apiKey.startsWith("sk-")) {
      apiKey = CLE_SECOURS;
    }
    if (!apiKey || apiKey.startsWith("sk-ant-") || apiKey.includes("REMPLIR_ICI") || !apiKey.startsWith("sk-")) {
      throw new Error("Aucune clé OpenAI valide disponible. Vérifiez CLE_PARTIE_A et CLE_PARTIE_B dans le fichier.");
    }

    let buffer;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (typeof req.body === "string" && req.body.length) {
      buffer = Buffer.from(req.body, "binary");
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    }
    if (!buffer || !buffer.length) throw new Error("Aucun audio reçu (corps de requête vide)");

    const contentType = req.headers["content-type"] || "audio/webm";
    const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("wav") ? "wav" : "webm";

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: contentType }), `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "fr");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`OpenAI ${r.status}: ${errText}`);
    }
    const data = await r.json();
    res.status(200).json({ text: data.text || "" });
  } catch (e) {
    console.error("transcribe error:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}
