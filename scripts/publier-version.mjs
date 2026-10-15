/**
 * Publie une version de l'application :
 *   1. télécharge l'APK construit par EAS (ou prend un fichier local) ;
 *   2. crée la release GitHub « vX.Y.Z » avec l'APK (hébergement gratuit, fichiers jusqu'à 2 Go) ;
 *   3. enregistre la version dans l'API (Render → Supabase) : le site et l'application la proposent.
 *
 * Usage : node scripts/publier-version.mjs <url-ou-chemin-de-l-apk> ["notes de version"]
 * Variables : ONILE_API_URL (ex. https://onile-api.onrender.com), ADMIN_TOKEN (celui de Render).
 * Prérequis : GitHub CLI (`gh`) connecté au dépôt.
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [source, notes = ''] = process.argv.slice(2);
const API = process.env.ONILE_API_URL?.replace(/\/$/, '');
const JETON = process.env.ADMIN_TOKEN;
if (!source) throw new Error('Indiquez l’URL ou le chemin de l’APK.');
if (!API || !JETON) throw new Error('Définissez ONILE_API_URL et ADMIN_TOKEN.');

const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
const version = app.version;
const versionCode = app.android.versionCode;
const nomFichier = `onile-${version}.apk`;

let apk = source;
if (/^https:\/\//.test(source)) {
  apk = join(mkdtempSync(join(tmpdir(), 'onile-apk-')), nomFichier);
  console.log(`Téléchargement de l’APK…`);
  const r = await fetch(source);
  if (!r.ok || !r.body) throw new Error(`Téléchargement impossible : ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(apk));
} else if (!existsSync(apk)) {
  throw new Error(`Fichier introuvable : ${apk}`);
}

const tag = `v${version}`;
console.log(`Release GitHub ${tag}…`);
execFileSync('gh', ['release', 'create', tag, `${apk}#${nomFichier}`, '--title', `Onílé ${version}`, '--notes', notes || `Onílé ${version}`], {
  stdio: 'inherit',
});
const depot = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).toString().trim();
const urlApk = `https://github.com/${depot}/releases/download/${tag}/${nomFichier}`;

console.log('Enregistrement de la version dans l’API…');
const r = await fetch(`${API}/api/versions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ version, version_code: versionCode, url_apk: urlApk, notes: notes || null }),
});
if (!r.ok) throw new Error(`API : ${r.status} ${await r.text()}`);
console.log(`Publiée : ${version} (${versionCode}) → ${urlApk}`);
console.log(`Lien de téléchargement permanent : ${API}/telecharger`);
