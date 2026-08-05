// Fonction serveur Vercel — transcrit un enregistrement audio en texte via l'API Whisper d'OpenAI.
// Appelée par l'app (fetch côté client) depuis le composant de dictée vocale.
//
// Nécessite la variable d'environnement Vercel OPENAI_API_KEY.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }
  try {
    // ⚠️ Clé de secours temporaire, en attendant de comprendre pourquoi la
    // variable d'environnement Vercel OPENAI_API_KEY ne s'enregistre pas correctement.
    // Remplacez le texte entre guillemets ci-dessous par votre vraie clé OpenAI (sk-proj-...).
    // À retirer une fois le problème Vercel résolu, et à révoquer/régénérer ensuite.
    const CLE_SECOURS = "REMPLACER_PAR_VOTRE_CLE_OPENAI_ICI";

    let apiKey = process.env.OPENAI_KEY_V2 || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith("sk-ant-") || !apiKey.startsWith("sk-")) {
      apiKey = CLE_SECOURS;
    }
    if (!apiKey || apiKey.startsWith("sk-ant-") || apiKey === "REMPLACER_PAR_VOTRE_CLE_OPENAI_ICI") {
      const toutesLesCles = Object.keys(process.env).sort().join(", ");
      throw new Error(`Aucune clé OpenAI valide. Variables vues par le serveur: [${toutesLesCles}]`);
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
