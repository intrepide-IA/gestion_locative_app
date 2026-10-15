/**
 * API Onílé (Render) — sans dépendance, Node 20+.
 *
 *   GET  /api/sante        → état du service
 *   GET  /api/version      → dernière version publiée (l'application et le site l'affichent)
 *   GET  /telecharger      → redirige vers l'APK de la dernière version
 *   POST /api/versions     → publie une version (en-tête Authorization: Bearer ADMIN_TOKEN)
 *
 * Variables d'environnement : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN,
 * ORIGINES_AUTORISEES (domaines du site, séparés par des virgules), PORT (fourni par Render).
 * La synchronisation des données ne passe pas par cette API : l'application parle directement à
 * Supabase, chaque utilisateur limité à ses propres sauvegardes (RLS).
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const env = (nom, obligatoire = true) => {
  const v = process.env[nom]?.trim();
  if (!v && obligatoire) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v ?? '';
};

const SUPABASE_URL = env('SUPABASE_URL').replace(/\/$/, '');
const ANON = env('SUPABASE_ANON_KEY');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY', false);
const ADMIN_TOKEN = env('ADMIN_TOKEN', false);
const ORIGINES = env('ORIGINES_AUTORISEES', false)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const PORT = Number(process.env.PORT ?? 10000);

async function derniereVersion() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/versions_app?select=version,version_code,url_apk,notes,publiee_le&order=version_code.desc&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!r.ok) throw new Error(`Supabase : ${r.status}`);
  const [v] = await r.json();
  return v ?? null;
}

function memeJeton(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function lireCorps(req, limite = 10_000) {
  return new Promise((resolve, reject) => {
    let corps = '';
    req.on('data', (morceau) => {
      corps += morceau;
      if (corps.length > limite) reject(new Error('Corps trop volumineux'));
    });
    req.on('end', () => resolve(corps));
    req.on('error', reject);
  });
}

function repondre(res, statut, donnees, entetes = {}) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes });
  res.end(JSON.stringify(donnees));
}

function cors(req) {
  const origine = req.headers.origin;
  if (origine && ORIGINES.includes(origine)) {
    return { 'Access-Control-Allow-Origin': origine, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  }
  return {};
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const entetes = cors(req);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...entetes, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/sante') return repondre(res, 200, { ok: true }, entetes);

    if (req.method === 'GET' && url.pathname === '/api/version') {
      const v = await derniereVersion();
      return v ? repondre(res, 200, v, { ...entetes, 'Cache-Control': 'public, max-age=300' }) : repondre(res, 404, { erreur: 'Aucune version publiée' }, entetes);
    }

    if (req.method === 'GET' && url.pathname === '/telecharger') {
      const v = await derniereVersion();
      if (!v) return repondre(res, 404, { erreur: 'Aucune version publiée' });
      res.writeHead(302, { Location: v.url_apk, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (req.method === 'POST' && url.pathname === '/api/versions') {
      const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!ADMIN_TOKEN || !SERVICE || !memeJeton(jeton, ADMIN_TOKEN)) return repondre(res, 401, { erreur: 'Non autorisé' }, entetes);
      const corps = JSON.parse(await lireCorps(req));
      const { version, version_code, url_apk, notes } = corps;
      if (typeof version !== 'string' || !Number.isInteger(version_code) || typeof url_apk !== 'string' || !url_apk.startsWith('https://')) {
        return repondre(res, 400, { erreur: 'version, version_code (entier) et url_apk (https) sont requis' }, entetes);
      }
      const r = await fetch(`${SUPABASE_URL}/rest/v1/versions_app`, {
        method: 'POST',
        headers: {
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({ version, version_code, url_apk, notes: typeof notes === 'string' ? notes : null }),
      });
      if (!r.ok) return repondre(res, 502, { erreur: `Supabase : ${r.status} ${await r.text()}` }, entetes);
      return repondre(res, 201, (await r.json())[0], entetes);
    }

    return repondre(res, 404, { erreur: 'Introuvable' }, entetes);
  } catch (error) {
    console.error(error);
    return repondre(res, 500, { erreur: 'Erreur interne' }, entetes);
  }
});

serveur.listen(PORT, () => console.log(`API Onílé sur le port ${PORT}`));
