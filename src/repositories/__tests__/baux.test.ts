import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { definirPhotoPiece, enregistrerClauses, getBail, signerBail, villeDeAdresse } from '../bauxRepository';
import { creerLogement } from '../logementRepository';
import { entrerLocataire } from '../locataireRepository';
import { definirSignature, enregistrerProprietaire, getProprietaire } from '../proprietaireRepository';
import { exporterSauvegarde, restaurerSauvegarde } from '../sauvegardeRepository';

const SIGNATURE = 'data:image/svg+xml;base64,PHN2Zy8+';

async function maison() {
  const db = await createMigratedDatabase();
  await enregistrerProprietaire(db, { nom: 'Moussa Adéyèmi', telephone: '+229 01', adresse: 'Akpakpa, Cotonou' });
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 0 });
  const { contratId } = await entrerLocataire(db, { nom_complet: 'Awa' }, logementId, {
    date_debut: '2026-10-15',
    loyer: 25000,
    toilettes: 0,
    caution: 75000,
    prix_kwh: 250,
    releve_initial: 0,
    jour_echeance: 15,
  });
  return { db, contratId };
}

test('bail par défaut : pièces selon le type de logement, ville tirée de l’adresse', async () => {
  const { db, contratId } = await maison();
  expect(villeDeAdresse('Akpakpa, Cotonou')).toBe('Cotonou');
  expect(await getBail(db, contratId)).toMatchObject({ enregistre: false, chambres: 1, salon: 1, fait_a: 'Cotonou', duree_annees: 1, mois_impayes: 3 });
});

test('signé quand les deux parties ont signé ; modifier les clauses efface les signatures', async () => {
  const { db, contratId } = await maison();
  const clauses = await getBail(db, contratId);
  await expect(signerBail(db, contratId, 'locataire', SIGNATURE, '2026-10-15')).rejects.toThrow(/clauses/);
  await enregistrerClauses(db, contratId, { ...clauses, preavis_mois: 2 });
  await signerBail(db, contratId, 'locataire', SIGNATURE, '2026-10-15');
  expect((await getBail(db, contratId)).signe_le).toBeNull();
  await signerBail(db, contratId, 'bailleur', SIGNATURE, '2026-10-15');
  expect(await getBail(db, contratId)).toMatchObject({ enregistre: true, preavis_mois: 2, signe_le: '2026-10-15' });
  await definirPhotoPiece(db, contratId, 'data:image/jpeg;base64,AAAA');

  await enregistrerClauses(db, contratId, { ...clauses, preavis_mois: 3 });
  expect(await getBail(db, contratId)).toMatchObject({ signature_locataire: null, signe_le: null, photo_piece: 'data:image/jpeg;base64,AAAA' });
  await expect(signerBail(db, contratId, 'bailleur', 'javascript:alert(1)', '2026-10-15')).rejects.toThrow(/invalide/);
});

test('signature du propriétaire, bail et photo inclus dans la sauvegarde', async () => {
  const { db, contratId } = await maison();
  await definirSignature(db, SIGNATURE);
  await enregistrerClauses(db, contratId, await getBail(db, contratId));
  await definirPhotoPiece(db, contratId, 'data:image/jpeg;base64,AAAA');
  const sauvegarde = await exporterSauvegarde(db);

  const autre = await createMigratedDatabase();
  await restaurerSauvegarde(autre, JSON.parse(JSON.stringify(sauvegarde)));
  expect((await getProprietaire(autre))?.signature).toBe(SIGNATURE);
  expect((await getBail(autre, contratId)).photo_piece).toBe('data:image/jpeg;base64,AAAA');
});

test('une sauvegarde de la version 1 (sans baux) reste restaurable', async () => {
  const { db } = await maison();
  const ancienne = JSON.parse(JSON.stringify(await exporterSauvegarde(db)));
  ancienne.schema = 1;
  delete ancienne.tables.baux;
  for (const p of ancienne.tables.proprietaire) delete p.signature;
  const autre = await createMigratedDatabase();
  await restaurerSauvegarde(autre, ancienne);
  expect((await getProprietaire(autre))?.nom).toBe('Moussa Adéyèmi');
});
