import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { listerLocataires } from '../../repositories/locataireRepository';
import { soldeTresorerie } from '../../repositories/financesRepository';
import { chargerDonneesDemo } from '../donneesDemo';

test('les données de démonstration se chargent et respectent toutes les contraintes', async () => {
  const db = await createMigratedDatabase();
  await chargerDonneesDemo(db);
  expect((await listerLocataires(db)).filter((l) => l.contrat_statut === 'actif')).toHaveLength(4);
  expect(await soldeTresorerie(db)).toBeGreaterThan(0);
  expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
});
