/**
 * Mise à jour de l'application : nouvelle version publiée ? (API Render, EXPO_PUBLIC_API_URL,
 * et en secours la dernière release GitHub si l'API ne répond pas)
 * Puis téléchargement dans l'application, avec sa progression, et ouverture directe de la fenêtre
 * « Installer » d'Android : plus besoin de chercher le fichier dans les téléchargements.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { APP_VERSION, APP_VERSION_CODE } from '../constants';
import { versionPlusRecente } from '../domain/version';

const URL_API = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const RELEASES = 'https://api.github.com/repos/intrepide-IA/gestion_locative_app/releases/latest';

export interface VersionPubliee {
  version: string;
  version_code: number;
  notes: string | null;
  /** Fichier APK (release GitHub). */
  url_apk: string;
  /** Lien de téléchargement stable, à ouvrir dans le navigateur en dernier recours. */
  lien: string;
}

export async function nouvelleVersion(): Promise<VersionPubliee | null> {
  if (URL_API.startsWith('https://')) {
    try {
      const r = await fetch(`${URL_API}/api/version`);
      if (r.ok) {
        const v = (await r.json()) as { version: string; version_code: number; notes: string | null; url_apk: string };
        return v.version_code > APP_VERSION_CODE ? { ...v, lien: `${URL_API}/telecharger` } : null;
      }
    } catch {
      // API injoignable : on passe au secours GitHub.
    }
  }
  return derniereReleaseGitHub();
}

/** Secours : dernière release GitHub (tag vX.Y.Z et fichier .apk), comparée au numéro de version. */
async function derniereReleaseGitHub(): Promise<VersionPubliee | null> {
  try {
    const r = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const rel = (await r.json()) as {
      tag_name: string;
      name: string | null;
      body: string | null;
      html_url: string;
      assets: { name: string; browser_download_url: string }[];
    };
    const version = rel.tag_name.replace(/^v/, '');
    const code = /\((\d+)\)\s*$/.exec(rel.name ?? '');
    const apk = rel.assets.find((a) => a.name.endsWith('.apk'));
    if (!apk) return null;
    if (code ? Number(code[1]) <= APP_VERSION_CODE : !versionPlusRecente(version, APP_VERSION)) return null;
    return { version, version_code: code ? Number(code[1]) : 0, notes: rel.body || null, url_apk: apk.browser_download_url, lien: rel.html_url };
  } catch {
    return null;
  }
}

/** Télécharge l'APK (progression de 0 à 1) puis ouvre l'installateur d'Android. */
export async function telechargerEtInstaller(v: VersionPubliee, onProgression: (part: number) => void): Promise<void> {
  const fichier = `${FileSystem.cacheDirectory}onile-${v.version}.apk`;
  await FileSystem.deleteAsync(fichier, { idempotent: true });
  const tache = FileSystem.createDownloadResumable(v.url_apk, fichier, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    if (totalBytesExpectedToWrite > 0) onProgression(totalBytesWritten / totalBytesExpectedToWrite);
  });
  const resultat = await tache.downloadAsync();
  if (!resultat || resultat.status !== 200) throw new Error('Téléchargement interrompu.');
  onProgression(1);
  // Comptage anonyme pour les statistiques (jamais bloquant).
  if (URL_API.startsWith('https://')) void fetch(`${URL_API}/api/telechargement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: v.version }),
  }).catch(() => undefined);
  const contenu = await FileSystem.getContentUriAsync(resultat.uri);
  // FLAG_GRANT_READ_URI_PERMISSION (1) : l'installateur peut lire le fichier de l'application.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contenu,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
}
