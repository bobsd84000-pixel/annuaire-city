// Route Vercel : cherche les emails publics d'un site (4 requêtes HTTP max, sans IA)
// POST { site: "exemple.fr" } -> { site, emails: [{ email, statut }], erreurs: [...] }
// Pas de vérification SMTP : chaque email est seulement « trouvé sur le site ».
import { lire } from './profil.js';

const PAGES = ['/contact', '/contact.html', '/mentions-legales'];
const IGNORES = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|sentry|wixpress|domain|email)\b/i;

// Extrait les emails du HTML (liens mailto: et texte visible), sans doublons
export function extraire(html = '') {
  const brut = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map(m => decodeURIComponent(m[1]))
    .concat(html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []);
  return [...new Set(brut.map(e => e.trim().toLowerCase()))].filter(e => !IGNORES.test(e));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST seulement' });
  let site = String((req.body || {}).site || '').trim().slice(0, 200);
  if (!site) return res.status(400).json({ error: 'Site manquant' });
  if (!/^https?:\/\//i.test(site)) site = 'https://' + site;
  let base;
  try { base = new URL(site); } catch { return res.status(400).json({ error: 'Adresse invalide' }); }

  const erreurs = [];
  let accueil;
  try { accueil = await lire(base.href); }
  catch (e) { return res.status(502).json({ error: 'Site injoignable : ' + e.message }); }

  const racine = new URL('/', accueil.url).href;
  const pages = await Promise.all(PAGES.map(p =>
    lire(racine + p.slice(1)).then(r => r.txt).catch(e => { erreurs.push(p + ' : ' + e.message); return ''; })));

  // Garde les emails du domaine du site ; les autres sont signalés à part
  const domaine = new URL(accueil.url).hostname.replace(/^www\./, '');
  const trouves = extraire([accueil.txt, ...pages].join('\n'));
  const emails = trouves.map(email => ({
    email,
    statut: email.endsWith('@' + domaine) || email.endsWith('.' + domaine) ? 'trouve_sur_site' : 'autre_domaine'
  }));

  return res.status(200).json({ site: accueil.url, emails, erreurs });
}
