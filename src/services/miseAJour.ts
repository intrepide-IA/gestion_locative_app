/**
 * Nouvelle version disponible ? Interroge l'API (Render) configurée par EXPO_PUBLIC_API_URL.
 * Sans réseau ou sans API configurée, rien n'est proposé (aucune erreur affichée).
 */
import { APP_VERSION_CODE } from '../constants';

const URL_API = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export interface VersionPubliee {
  version: string;
  version_code: number;
  notes: string | null;
  /** Lien de téléchargement stable (redirection vers l'APK). */
  lien: string;
}

export async function nouvelleVersion(): Promise<VersionPubliee | null> {
  if (!URL_API.startsWith('https://')) return null;
  try {
    const r = await fetch(`${URL_API}/api/version`);
    if (!r.ok) return null;
    const v = (await r.json()) as { version: string; version_code: number; notes: string | null };
    return v.version_code > APP_VERSION_CODE ? { ...v, lien: `${URL_API}/telecharger` } : null;
  } catch {
    return null;
  }
}
