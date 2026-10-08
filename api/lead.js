// Vercel serverless function : POST /api/lead -> ajoute ou met à jour un contact dans Brevo.
// Variables d'environnement requises (jamais dans le code ni dans le dépôt) :
//   BREVO_API_KEY   clé API v3 de Brevo
//   BREVO_LIST_ID   identifiant numérique de la liste Brevo
//   ALLOWED_ORIGIN  origine(s) autorisée(s), séparées par des virgules (ex : https://bluezonehills-cmd.github.io)
// Attributs de contact à créer dans Brevo (type texte) : SECTEUR, AXE, TEMPERATURE

const SECTORS = ['health', 'manifestation', 'ia', 'mmo', 'finance'];
const TEMPS = ['froid', 'tiède', 'chaud', 'très chaud'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return !origin || allowed.includes(origin);
}

const clean = (v, max = 40) => String(v || '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, max);

module.exports = async (req, res) => {
  const originOk = cors(req, res);
  if (req.method === 'OPTIONS') return res.status(originOk ? 204 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  if (!originOk) return res.status(403).json({ ok: false, error: 'origin' });

  const key = process.env.BREVO_API_KEY;
  const listId = parseInt(process.env.BREVO_LIST_ID, 10);
  if (!key || !listId) return res.status(500).json({ ok: false, error: 'config' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  if (b.website) return res.status(200).json({ ok: true }); // piège anti-robots (champ caché rempli)

  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ ok: false, error: 'email' });
  if (b.consent !== true) return res.status(400).json({ ok: false, error: 'consent' });

  const attributes = {
    SECTEUR: SECTORS.includes(b.sector) ? b.sector : 'inconnu',
    AXE: clean(b.focus) || 'general',
    TEMPERATURE: TEMPS.includes(b.temp) ? b.temp : 'inconnue'
  };

  try {
    const r = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email, attributes, listIds: [listId], updateEnabled: true })
    });
    if (r.ok) return res.status(200).json({ ok: true });
    console.error('Brevo', r.status, await r.text());
    return res.status(502).json({ ok: false, error: 'brevo' });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ ok: false, error: 'network' });
  }
};
