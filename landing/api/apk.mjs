/**
 * Relais du fichier APK depuis la dernière release GitHub, servi par le site lui-même (même adresse).
 * Pourquoi : un lien vers github.com fait quitter la page ; Chrome Android ouvre alors une vue séparée
 * (✕, github.com) qui reste bloquée à 100 % sur un fichier .apk.
 *
 *   GET /api/apk?info=1             → { version, version_code, taille, notes, publiee_le, nom }
 *   GET /api/apk?debut=A&fin=B      → octets A à B (206) : la page télécharge par morceaux, avec reprise
 *   GET /api/apk                    → fichier complet (repli)
 */
const RELEASES = 'https://api.github.com/repos/intrepide-IA/gestion_locative_app/releases/latest';
let cache = { quand: 0, release: null };

async function derniereRelease() {
  if (cache.release && Date.now() - cache.quand < 300_000) return cache.release;
  const r = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'onile-site' } });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const rel = await r.json();
  const apk = (rel.assets ?? []).find((a) => a.name.endsWith('.apk'));
  if (!apk) throw new Error('Aucun fichier APK dans la dernière release');
  const code = /\((\d+)\)\s*$/.exec(rel.name ?? '');
  cache = {
    quand: Date.now(),
    release: {
      version: String(rel.tag_name).replace(/^v/, ''),
      version_code: code ? Number(code[1]) : null,
      taille: apk.size,
      nom: apk.name,
      url: apk.browser_download_url,
      notes: rel.body || null,
      publiee_le: rel.published_at,
    },
  };
  return cache.release;
}

const json = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET(request) {
  let rel;
  try {
    rel = await derniereRelease();
  } catch (e) {
    return json({ erreur: String(e.message ?? e) }, 502);
  }
  const params = new URL(request.url).searchParams;
  if (params.has('info')) {
    const { url: _url, ...info } = rel;
    return json(info);
  }

  const debut = params.has('debut') ? Number(params.get('debut')) : null;
  const fin = params.has('fin') ? Number(params.get('fin')) : null;
  const morceau = debut !== null && fin !== null;
  if (morceau && !(Number.isInteger(debut) && Number.isInteger(fin) && debut >= 0 && fin >= debut && fin < rel.taille)) {
    return json({ erreur: 'Morceau invalide' }, 416);
  }
  const amont = await fetch(rel.url, { headers: morceau ? { Range: `bytes=${debut}-${fin}` } : {}, redirect: 'follow' });
  if (!amont.ok || !amont.body) return json({ erreur: `Téléchargement GitHub impossible (${amont.status})` }, 502);

  const entetes = {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': String(morceau ? fin - debut + 1 : rel.taille),
    'Content-Disposition': `attachment; filename="${rel.nom}"`,
    'Cache-Control': 'no-store',
    'X-Onile-Version': rel.version,
  };
  if (morceau) entetes['Content-Range'] = `bytes ${debut}-${fin}/${rel.taille}`;
  return new Response(amont.body, { status: morceau ? 206 : 200, headers: entetes });
}
