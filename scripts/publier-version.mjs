/**
 * Publie une version de l'application pour qu'elle soit téléchargeable depuis le site :
 *   1. héberge l'APK sur GitHub Releases (« vX.Y.Z ») — ou garde le lien EAS avec --lien-direct ;
 *   2. enregistre la version dans l'API (Render → Supabase) : le lien /telecharger et l'alerte
 *      « Nouvelle version » de l'application la proposent aussitôt.
 *
 * Usage :
 *   node scripts/publier-version.mjs <url-ou-chemin-de-l-apk> ["notes"] [--lien-direct]
 *
 * Réglages (variables d'environnement, ou fichier .env.publication à la racine, jamais commité) :
 *   ONILE_API_URL   ex. https://onile-api.onrender.com
 *   ADMIN_TOKEN     le jeton ADMIN_TOKEN du service Render
 *   GITHUB_TOKEN    (facultatif) jeton GitHub « contents: write » pour créer la release sans GitHub CLI
 *
 * Hébergement de l'APK, au choix : GITHUB_TOKEN, sinon GitHub CLI (`gh auth login`), sinon --lien-direct
 * (le lien expo.dev est enregistré tel quel : simple, mais Expo peut le faire expirer).
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const RACINE = new URL('..', import.meta.url);

// Réglages lus dans .env.publication s'ils ne sont pas dans l'environnement.
const fichierReglages = new URL('.env.publication', RACINE);
if (existsSync(fichierReglages)) {
  for (const ligne of readFileSync(fichierReglages, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const lienDirect = args.includes('--lien-direct');
const [source, notes = ''] = args.filter((a) => !a.startsWith('--'));
const API = process.env.ONILE_API_URL?.trim().replace(/\/$/, '');
const JETON = process.env.ADMIN_TOKEN?.trim();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();

function arreter(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!source) arreter('Indiquez l’URL ou le chemin de l’APK : node scripts/publier-version.mjs "<url>" "notes"');
if (!API || !JETON) {
  arreter(`ONILE_API_URL et ADMIN_TOKEN sont introuvables.
  PowerShell :  $env:ONILE_API_URL = "https://onile-api.onrender.com"
                $env:ADMIN_TOKEN = "le-jeton-render"
  Invite cmd :  set ONILE_API_URL=https://onile-api.onrender.com
  Ou bien un fichier .env.publication à la racine du projet avec ces deux lignes.`);
}

const app = JSON.parse(readFileSync(new URL('app.json', RACINE), 'utf8')).expo;
const version = app.version;
const versionCode = app.android.versionCode;
const nomFichier = `onile-${version}.apk`;
const tag = `v${version}`;

function depotGitHub() {
  const url = execFileSync('git', ['-c', 'safe.directory=*', 'remote', 'get-url', 'origin']).toString().trim();
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
  if (!m) arreter(`Dépôt GitHub introuvable (origin = ${url}).`);
  return `${m[1]}/${m[2]}`;
}

async function fichierLocal() {
  if (!/^https:\/\//.test(source)) {
    if (!existsSync(source)) arreter(`Fichier introuvable : ${source}`);
    return source;
  }
  const chemin = join(mkdtempSync(join(tmpdir(), 'onile-apk-')), nomFichier);
  console.log('Téléchargement de l’APK…');
  const r = await fetch(source);
  if (!r.ok || !r.body) arreter(`Téléchargement impossible : ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(chemin));
  return chemin;
}

async function viaApiGitHub(apk, depot) {
  const entetes = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  console.log(`Release GitHub ${tag} (API)…`);
  let r = await fetch(`https://api.github.com/repos/${depot}/releases`, {
    method: 'POST',
    headers: { ...entetes, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name: `Onílé ${version}`, body: notes || `Onílé ${version}` }),
  });
  if (r.status === 422) r = await fetch(`https://api.github.com/repos/${depot}/releases/tags/${tag}`, { headers: entetes });
  if (!r.ok) arreter(`GitHub : ${r.status} ${await r.text()}`);
  const release = await r.json();
  const envoi = await fetch(release.upload_url.replace(/\{.*\}$/, `?name=${nomFichier}`), {
    method: 'POST',
    headers: { ...entetes, 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': String(statSync(apk).size) },
    body: readFileSync(apk),
  });
  if (!envoi.ok && envoi.status !== 422) arreter(`Envoi de l’APK sur GitHub : ${envoi.status} ${await envoi.text()}`);
}

function ghDisponible() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let urlApk;
if (lienDirect) {
  if (!/^https:\/\//.test(source)) arreter('--lien-direct demande une URL https (lien expo.dev de l’APK).');
  urlApk = source;
  console.log('Lien direct : l’APK reste hébergé par Expo.');
} else {
  const depot = depotGitHub();
  if (GITHUB_TOKEN) {
    await viaApiGitHub(await fichierLocal(), depot);
  } else if (ghDisponible()) {
    const apk = await fichierLocal();
    console.log(`Release GitHub ${tag} (gh)…`);
    execFileSync('gh', ['release', 'create', tag, `${apk}#${nomFichier}`, '--repo', depot, '--title', `Onílé ${version}`, '--notes', notes || `Onílé ${version}`], {
      stdio: 'inherit',
    });
  } else {
    arreter(`Pour héberger l’APK sur GitHub, il faut au choix :
  - installer GitHub CLI :  winget install GitHub.cli   puis   gh auth login
  - ou définir GITHUB_TOKEN (jeton GitHub avec le droit « Contents : read and write » sur le dépôt)
  - ou publier tout de suite avec le lien Expo :  ajoutez --lien-direct à la commande`);
  }
  urlApk = `https://github.com/${depot}/releases/download/${tag}/${nomFichier}`;
}

console.log('Enregistrement de la version dans l’API (Render peut mettre ~30 s à se réveiller)…');
const r = await fetch(`${API}/api/versions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ version, version_code: versionCode, url_apk: urlApk, notes: notes || null }),
});
if (!r.ok) arreter(`API : ${r.status} ${await r.text()}`);
console.log(`\n✔ Publiée : Onílé ${version} (code ${versionCode})`);
console.log(`  APK : ${urlApk}`);
console.log(`  Lien permanent : ${API}/telecharger`);
