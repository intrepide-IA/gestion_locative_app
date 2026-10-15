/** Aperçu web : pas de mise à jour d'application (elle ne concerne que le téléphone). */
export interface VersionPubliee {
  version: string;
  version_code: number;
  notes: string | null;
  url_apk: string;
  lien: string;
}

export async function nouvelleVersion(): Promise<VersionPubliee | null> {
  return null;
}

export async function telechargerEtInstaller(): Promise<void> {
  throw new Error('Mise à jour disponible seulement sur le téléphone.');
}
