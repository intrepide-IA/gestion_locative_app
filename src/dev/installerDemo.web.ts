/**
 * Aperçu web de développement uniquement : expose `window.__onileDemo()` qui crée un profil de
 * démonstration (PIN 2580) et des données réalistes, pour les captures de la landing page.
 */
import { getDatabase } from '../db/client';
import { pinService } from '../security/native';
import { chargerDonneesDemo } from './donneesDemo';

export function installerDemo(): void {
  if (!__DEV__ || typeof window === 'undefined') return;
  (window as unknown as { __onileDemo: () => Promise<void> }).__onileDemo = async () => {
    const db = await getDatabase();
    await chargerDonneesDemo(db);
    if (!(await pinService.hasPin())) await pinService.createPin('2580');
  };
}
