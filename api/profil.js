// Route Vercel : profil gratuit d'un site (3 requêtes HTTP, sans navigateur, sans IA)
// POST { site: "exemple.fr" } -> { site, signaux: {...}, erreurs: [...] }
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DELAI = 6000, MAX_OCTETS = 1_500_000, MAX_REDIR = 3;

// Bloque les adresses internes (évite qu'on sonde le réseau de Vercel)
function ipPrivee(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return ipPrivee(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function hoteSur(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('protocole refusé');
  const h = u.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(h) ? [{ address: h }] : await lookup(h, { all: true });
  if (!ips.length || ips.some(x => ipPrivee(x.address))) throw new Error('adresse interne refusée');
}

// Lecture avec délai, taille max et redirections vérifiées une par une
export async function lire(url) {
  for (let i = 0; i <= MAX_REDIR; i++) {
    await hoteSur(url);
    const r = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(DELAI),
      headers: { 'User-Agent': 'AnnuaireCityProfil/1.0', 'Accept': 'text/html,*/*' }
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      url = new URL(r.headers.get('location'), url).href;
      continue;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = (await r.text()).slice(0, MAX_OCTETS);
    return { url, txt };
  }
  throw new Error('trop de redirections');
}

// Analyse pure : texte en entrée, signaux en sortie (testable sans réseau)
export function analyser(html = '', robots = '', sitemap = '') {
  const h = html.toLowerCase(), s = {};

  // Agence web créditée en pied de page (seulement si la formule est claire)
  const ag = html.match(/(?:r[ée]alis[ée]|con[çc]u|cr[ée]{1,2}|d[ée]velopp[ée])\s+(?:par|avec)\s*:?\s*(?:<[^>]+>\s*)*([^<\n]{2,40})/i)
    || html.match(/(?:powered|website|site|designed|made)\s+by\s*:?\s*(?:<[^>]+>\s*)*([^<\n]{2,40})/i);
  s.agence = ag ? ag[1].trim().replace(/[.\s]+$/, '') : null;

  s.pub_google = /googleadservices\.com|gtag\(\s*['"]config['"]\s*,\s*['"]aw-|['"]aw-\d+/.test(h);
  s.pub_meta = /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/.test(h);
  s.schema_seo = /application\/ld\+json|itemtype=["']https?:\/\/schema\.org/.test(h);

  const resa = h.match(/calendly\.com|planity\.com|doctolib\.fr|thefork|lafourchette|zenchef|booksy\.com|resalib|treatwell|guestonline|sumup\.com\/booking/);
  s.reservation_en_ligne = resa ? resa[0] : null;

  const cms = [['wp-content', 'WordPress'], ['wix.com', 'Wix'], ['cdn.shopify', 'Shopify'], ['squarespace', 'Squarespace'],
    ['webflow', 'Webflow'], ['jimdo', 'Jimdo'], ['prestashop', 'PrestaShop'], ['joomla', 'Joomla']].find(([k]) => h.includes(k));
  s.cms = cms ? cms[1] : null;

  s.bloque_ia = /user-agent:\s*(gptbot|claudebot|ccbot|google-extended)[\s\S]*?disallow:\s*\/\s*$/im.test(robots);

  const pages = sitemap.match(/<loc>/gi);
  s.nb_pages_sitemap = pages ? pages.length : null;

  // Blog abandonné : dernière date d'une page blog/actualités dans le sitemap > 1 an
  const dates = [...sitemap.matchAll(/<url>[\s\S]*?<loc>([^<]*(?:blog|actualit|news|article)[^<]*)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/gi)]
    .map(m => Date.parse(m[2])).filter(n => !isNaN(n));
  if (dates.length) {
    const jours = Math.round((Date.now() - Math.max(...dates)) / 864e5);
    s.blog_dernier_article_jours = jours;
    s.blog_abandonne = jours > 365;
  } else {
    s.blog_dernier_article_jours = null;
    s.blog_abandonne = null;
  }
  return s;
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
  const [robots, sitemap] = await Promise.all(['robots.txt', 'sitemap.xml'].map(f =>
    lire(racine + f).then(r => r.txt).catch(e => { erreurs.push(f + ' : ' + e.message); return ''; })));

  return res.status(200).json({ site: accueil.url, signaux: analyser(accueil.txt, robots, sitemap), erreurs });
}
