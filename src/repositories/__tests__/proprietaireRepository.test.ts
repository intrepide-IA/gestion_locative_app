import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { enregistrerProprietaire, getProprietaire } from '../proprietaireRepository';

test('aucun profil sur une base neuve', async () => {
  const db = await createMigratedDatabase();
  expect(await getProprietaire(db)).toBeNull();
});

test('crée puis met à jour l’unique profil sans changer la date de création', async () => {
  const db = await createMigratedDatabase();
  const cree = await enregistrerProprietaire(db, { nom: ' Moussa Adé ', telephone: '', adresse: 'Cotonou' }, () => 'T1');
  expect(cree).toMatchObject({ id: 1, nom: 'Moussa Adé', telephone: null, adresse: 'Cotonou', cree_le: 'T1' });

  const maj = await enregistrerProprietaire(db, { nom: 'Moussa', telephone: '+229 01 00 00 00', adresse: null }, () => 'T2');
  expect(maj).toMatchObject({ nom: 'Moussa', telephone: '+229 01 00 00 00', adresse: null, cree_le: 'T1' });
  const n = await db.get<{ n: number }>('SELECT count(*) AS n FROM proprietaire');
  expect(n?.n).toBe(1);
});

test('refuse un nom vide', async () => {
  const db = await createMigratedDatabase();
  await expect(enregistrerProprietaire(db, { nom: '   ', telephone: null, adresse: null })).rejects.toThrow(/obligatoire/);
});
