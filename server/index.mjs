/**
 * API Onílé (Render) — sans dépendance, Node 20+.
 *
 *   GET  /api/sante        → état du service
 *   GET  /api/version      → dernière version publiée (l'application et le site l'affichent)
 *   GET  /telecharger      → redirige vers l'APK de la dernière version
 *   GET  /apk              → transmet l'APK (avec sa taille) : la page du site affiche la progression
 *   POST /api/versions     → publie une version (en-tête Authorization: Bearer ADMIN_TOKEN)
 *   POST /api/telechargement            → compte un téléchargement fait depuis l'application
 *   POST /api/newsletter                → inscription à la lettre d'information { email }
 *   GET  /api/newsletter/desinscription → désinscription en un clic (?jeton=…)
 *   GET  /api/admin/stats | /abonnes | /envois, POST /api/admin/newsletter
 *        → espace d'administration (session Supabase d'un e-mail listé dans ADMIN_EMAILS)
 *
 * Variables d'environnement : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN,
 * ORIGINES_AUTORISEES (domaines du site, séparés par des virgules), PORT (fourni par Render),
 * ADMIN_EMAILS (e-mails autorisés dans l'espace d'administration, séparés par des virgules),
 * BREVO_API_KEY, EXPEDITEUR_EMAIL, EXPEDITEUR_NOM (envoi de la lettre d'information via Brevo).
 * La synchronisation des données ne passe pas par cette API : l'application parle directement à
 * Supabase, chaque utilisateur limité à ses propres sauvegardes (RLS).
 */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
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
const ADMIN_EMAILS = env('ADMIN_EMAILS', false)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const BREVO_API_KEY = env('BREVO_API_KEY', false);
const EXPEDITEUR_EMAIL = env('EXPEDITEUR_EMAIL', false);
const EXPEDITEUR_NOM = env('EXPEDITEUR_NOM', false) || 'Onílé';
const URL_PUBLIQUE = env('URL_PUBLIQUE', false) || 'https://onile-api.onrender.com';

/** Appel REST Supabase avec la clé service_role (tables d'administration). */
async function supabase(chemin, options = {}) {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante');
  const r = await fetch(`${SUPABASE_URL}${chemin}`, {
    ...options,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} : ${await r.text()}`);
  const texte = await r.text();
  return texte ? JSON.parse(texte) : null;
}

/** Comptage d'un téléchargement : jamais bloquant, aucune adresse IP enregistrée. */
function compterTelechargement(source, version) {
  if (!SERVICE) return;
  supabase('/rest/v1/telechargements', { method: 'POST', body: JSON.stringify({ source, version }), headers: { Prefer: 'return=minimal' } }).catch(
    (e) => console.error('Comptage impossible', e.message)
  );
}

/** Vérifie la session Supabase envoyée par la page d'administration ; renvoie l'e-mail ou null. */
async function adminConnecte(req) {
  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!jeton || !ADMIN_EMAILS.length) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jeton}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const email = String(u.email ?? '').toLowerCase();
  return ADMIN_EMAILS.includes(email) ? email : null;
}

const echapperHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function htmlLettre(contenu, jeton) {
  const paragraphes = echapperHtml(contenu)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const lien = `${URL_PUBLIQUE}/api/newsletter/desinscription?jeton=${jeton}`;
  return `<div style="font-family:Arial,sans-serif;color:#14211C;max-width:560px;margin:auto;padding:24px">
<p style="font-size:22px;font-weight:800;color:#0F6B4F;margin:0 0 18px">Onílé</p>${paragraphes}
<hr style="border:0;border-top:1px solid #E6E2DA;margin:24px 0">
<p style="font-size:12px;color:#5B6B64">Vous recevez ce message car vous êtes inscrit à la lettre d’Onílé.
<a href="${lien}" style="color:#5B6B64">Se désinscrire</a></p></div>`;
}

async function envoyerEmail(destinataire, sujet, html) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: { email: EXPEDITEUR_EMAIL, name: EXPEDITEUR_NOM }, to: [{ email: destinataire }], subject: sujet, htmlContent: html }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${await r.text()}`);
}

function lireJson(req) {
  return lireCorps(req, 200_000).then((t) => (t ? JSON.parse(t) : {}));
}

/** « 1.0.11 » > « 1.0.9 » : comparaison chiffre par chiffre. */
function plusRecente(a, b) {
  const x = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

const RELEASES = 'https://api.github.com/repos/intrepide-IA/gestion_locative_app/releases/latest';
let cacheGitHub = { quand: 0, release: null };

/** Dernière release GitHub (gardée 5 minutes) : version, versionCode (dans le titre « Onílé 1.0.11 (21) ») et APK. */
async function derniereReleaseGitHub() {
  if (Date.now() - cacheGitHub.quand < 300_000) return cacheGitHub.release;
  let release = null;
  try {
    const r = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'onile-api' } });
    if (r.ok) {
      const rel = await r.json();
      const apk = (rel.assets ?? []).find((a) => a.name.endsWith('.apk'));
      const code = /\((\d+)\)\s*$/.exec(rel.name ?? '');
      if (apk) {
        release = {
          version: String(rel.tag_name).replace(/^v/, ''),
          version_code: code ? Number(code[1]) : null,
          url_apk: apk.browser_download_url,
          notes: rel.body || null,
          publiee_le: rel.published_at,
        };
      }
    }
  } catch (e) {
    console.error('GitHub indisponible', e.message);
  }
  cacheGitHub = { quand: Date.now(), release };
  return release;
}

/**
 * Version à proposer : la plus récente entre celle enregistrée (Supabase) et la dernière release GitHub.
 * Si GitHub est en avance (enregistrement manqué pendant une panne), elle est enregistrée au passage.
 */
async function derniereVersion() {
  let enregistree = null;
  let erreur = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/versions_app?select=version,version_code,url_apk,notes,publiee_le&order=version_code.desc&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (r.ok) [enregistree = null] = await r.json();
    else erreur = new Error(`Supabase : ${r.status}`);
  } catch (e) {
    erreur = e;
  }
  const gh = await derniereReleaseGitHub();
  if (!gh || (enregistree && !plusRecente(gh.version, enregistree.version))) {
    if (erreur && !enregistree) throw erreur;
    return enregistree;
  }
  const v = { ...gh, version_code: gh.version_code ?? (enregistree ? enregistree.version_code + 1 : 1) };
  if (SERVICE) {
    supabase('/rest/v1/versions_app', {
      method: 'POST',
      body: JSON.stringify({ version: v.version, version_code: v.version_code, url_apk: v.url_apk, notes: v.notes }),
      headers: { Prefer: 'return=minimal' },
    }).catch((e) => console.error('Enregistrement automatique impossible', e.message));
  }
  return v;
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

/** Données publiques (version, fichier APK) : lisibles depuis n'importe quel site. */
const PUBLIC = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition, X-Onile-Version',
};

function cors(req) {
  const origine = req.headers.origin;
  if (origine && ORIGINES.includes(origine)) {
    return { 'Access-Control-Allow-Origin': origine, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  }
  return {};
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const entetes = { ...cors(req), ...PUBLIC };
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, entetes);
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/sante') return repondre(res, 200, { ok: true }, entetes);

    if (req.method === 'GET' && url.pathname === '/api/version') {
      const v = await derniereVersion();
      return v ? repondre(res, 200, v, { ...PUBLIC, 'Cache-Control': 'public, max-age=60' }) : repondre(res, 404, { erreur: 'Aucune version publiée' }, PUBLIC);
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/apk') {
      const v = await derniereVersion();
      if (!v) return repondre(res, 404, { erreur: 'Aucune version publiée' }, PUBLIC);
      const source = await fetch(v.url_apk, { method: req.method, redirect: 'follow' });
      if (!source.ok) return repondre(res, 502, { erreur: `APK indisponible (${source.status})` }, PUBLIC);
      const taille = source.headers.get('content-length');
      res.writeHead(200, {
        ...PUBLIC,
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="onile-${v.version}.apk"`,
        'Cache-Control': 'no-store',
        'X-Onile-Version': v.version,
        ...(taille ? { 'Content-Length': taille } : {}),
      });
      if (req.method === 'HEAD' || !source.body) return res.end();
      // Transmis au fur et à mesure, sans tout garder en mémoire.
      compterTelechargement('site', v.version);
      Readable.fromWeb(source.body).on('error', () => res.destroy()).pipe(res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/telecharger') {
      const v = await derniereVersion();
      if (!v) return repondre(res, 404, { erreur: 'Aucune version publiée' });
      compterTelechargement('lien', v.version);
      res.writeHead(302, { Location: v.url_apk, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (req.method === 'POST' && url.pathname === '/api/telechargement') {
      const corps = await lireJson(req).catch(() => ({}));
      compterTelechargement(corps.source === 'site' ? 'site' : 'application', typeof corps.version === 'string' ? corps.version.slice(0, 20) : null);
      return repondre(res, 202, { ok: true }, entetes);
    }

    if (req.method === 'POST' && url.pathname === '/api/newsletter') {
      const { email } = await lireJson(req).catch(() => ({}));
      const propre = String(email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(propre) || propre.length > 200) return repondre(res, 400, { erreur: 'Adresse e-mail invalide.' }, entetes);
      await supabase('/rest/v1/abonnes?on_conflict=email', {
        method: 'POST',
        body: JSON.stringify({ email: propre, desinscrit_le: null }),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
      return repondre(res, 201, { ok: true }, entetes);
    }

    if (req.method === 'GET' && url.pathname === '/api/newsletter/desinscription') {
      const jeton = url.searchParams.get('jeton') ?? '';
      if (/^[0-9a-f-]{36}$/i.test(jeton)) {
        await supabase(`/rest/v1/abonnes?jeton=eq.${jeton}`, { method: 'PATCH', body: JSON.stringify({ desinscrit_le: new Date().toISOString() }) });
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désinscription</title>
<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:24px;text-align:center"><h1 style="color:#0F6B4F">Désinscription confirmée</h1>
<p>Vous ne recevrez plus la lettre d’information d’Onílé.</p></div>`);
    }

    if (url.pathname.startsWith('/api/admin/')) {
      const admin = await adminConnecte(req);
      if (!admin) return repondre(res, 401, { erreur: 'Accès réservé à l’administrateur.' }, entetes);

      if (req.method === 'GET' && url.pathname === '/api/admin/stats') {
        return repondre(res, 200, { admin, ...(await supabase('/rest/v1/rpc/statistiques_admin', { method: 'POST', body: '{}' })) }, entetes);
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/abonnes') {
        return repondre(res, 200, await supabase('/rest/v1/abonnes?select=email,cree_le,desinscrit_le&order=cree_le.desc&limit=500'), entetes);
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/envois') {
        return repondre(res, 200, await supabase('/rest/v1/envois_newsletter?select=sujet,destinataires,envoye_le&order=envoye_le.desc&limit=50'), entetes);
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/newsletter') {
        if (!BREVO_API_KEY || !EXPEDITEUR_EMAIL) {
          return repondre(res, 503, { erreur: 'Envoi non configuré : ajoutez BREVO_API_KEY et EXPEDITEUR_EMAIL dans Render.' }, entetes);
        }
        const { sujet, contenu, test } = await lireJson(req);
        if (typeof sujet !== 'string' || !sujet.trim() || typeof contenu !== 'string' || !contenu.trim()) {
          return repondre(res, 400, { erreur: 'Sujet et contenu obligatoires.' }, entetes);
        }
        if (test) {
          await envoyerEmail(admin, `[Test] ${sujet}`, htmlLettre(contenu, '00000000-0000-0000-0000-000000000000'));
          return repondre(res, 200, { envoyes: 1, test: true }, entetes);
        }
        const abonnes = await supabase('/rest/v1/abonnes?select=email,jeton&desinscrit_le=is.null&limit=5000');
        let envoyes = 0;
        const echecs = [];
        for (const a of abonnes) {
          try {
            await envoyerEmail(a.email, sujet, htmlLettre(contenu, a.jeton));
            envoyes += 1;
          } catch (e) {
            echecs.push(a.email);
            console.error('Envoi impossible', a.email, e.message);
          }
        }
        await supabase('/rest/v1/envois_newsletter', {
          method: 'POST',
          body: JSON.stringify({ sujet, contenu, destinataires: envoyes }),
          headers: { Prefer: 'return=minimal' },
        });
        return repondre(res, 200, { envoyes, echecs: echecs.length }, entetes);
      }
      return repondre(res, 404, { erreur: 'Introuvable' }, entetes);
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
