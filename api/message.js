// Route Vercel : rédige un premier message de prospection avec Groq (clé GROQ_API_KEY côté serveur)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST seulement' });
  const cle = process.env.GROQ_API_KEY;
  if (!cle) return res.status(500).json({ error: 'GROQ_API_KEY manquante' });
  const b = req.body || {};
  const nom = String(b.nom || '').slice(0, 80), cat = String(b.cat || '').slice(0, 60), ville = String(b.ville || '').slice(0, 60);
  if (!nom) return res.status(400).json({ error: 'Nom manquant' });
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 220,
        temperature: 0.7,
        messages: [
          { role: 'system', content: "Tu écris des premiers messages de prospection B2B en français. 60 mots max. Vouvoiement, ton simple et poli, une seule question finale. Pas d'emoji, pas d'objet, pas de signature, pas d'invention de faits." },
          { role: 'user', content: `Commerce : ${nom}. Métier : ${cat}. Ville : ${ville}.` }
        ]
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: d.error?.message || 'Erreur Groq' });
    return res.status(200).json({ message: d.choices?.[0]?.message?.content?.trim() || '' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
