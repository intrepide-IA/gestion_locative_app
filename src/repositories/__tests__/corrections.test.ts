import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { corrigerLocataire, journalDesModifications, supprimerLocataireDefinitivement } from '../correctionsRepository';
import { acheterElectricite, enregistrerReleve } from '../electriciteRepository';
import { soldeTresorerie } from '../financesRepository';
import { creerLogement } from '../logementRepository';
import { entrerLocataire, getLocataire } from '../locataireRepository';
import { emettreFactureLoyer, enregistrerPaiement, genererEcheances } from '../loyerRepository';

const conditions = { date_debut: '2026-09-05', loyer: 25000, toilettes: 1000, caution: 50000, prix_kwh: 250, releve_initial: 0, jour_echeance: 5 };

async function maison() {
  const db = await createMigratedDatabase();
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
  const ids = await entrerLocataire(db, { nom_complet: 'Awa' }, logementId, conditions);
  await genererEcheances(db, '2026-11-10');
  return { db, logementId, ...ids };
}

test('correction complète : échéances payées intactes, les autres recalculées ; journal et motif obligatoire', async () => {
  const { db, locataireId, contratId } = await maison();
  await enregistrerPaiement(db, { locataireId, montant: 26000, mode: 'especes', datePaiement: '2026-10-05' }); // règle octobre
  const novembre = await db.get<{ id: number }>("SELECT id FROM echeances WHERE mois = 11");
  await emettreFactureLoyer(db, novembre!.id);
  const correction = { ...conditions, loyer: 30000, toilettes: 0, caution: 60000, caution_electricite: 0, caution_eau: 0, jour_echeance: 10 };
  await expect(corrigerLocataire(db, contratId, { nom_complet: 'Awa B.' }, correction, '', '2026-11-10')).rejects.toThrow(/motif/);
  await corrigerLocataire(db, contratId, { nom_complet: 'Awa B.', telephone: '01' }, correction, 'Erreur de loyer à l’entrée', '2026-11-10');

  const e = await db.all<{ mois: number; montant_du: number; date_echeance: string }>('SELECT mois, montant_du, date_echeance FROM echeances ORDER BY annee, mois');
  expect(e).toEqual([
    { mois: 10, montant_du: 26000, date_echeance: '2026-10-05' },
    { mois: 11, montant_du: 30000, date_echeance: '2026-11-10' },
  ]);
  expect(await db.get("SELECT statut FROM factures WHERE echeance_id = ?", [novembre!.id])).toEqual({ statut: 'annulee' });
  expect((await getLocataire(db, locataireId))?.nom_complet).toBe('Awa B.');
  expect(await soldeTresorerie(db)).toBe(60000 + 26000);
  expect((await journalDesModifications(db))[0]).toMatchObject({ action: 'correction', motif: 'Erreur de loyer à l’entrée' });
});

test('suppression définitive : plus aucune trace sauf le journal ; trésorerie recalculée', async () => {
  const { db, locataireId, contratId } = await maison();
  await enregistrerPaiement(db, { locataireId, montant: 26000, mode: 'especes', datePaiement: '2026-10-05' });
  await acheterElectricite(db, { contratId, montantRecu: 1000, mode: 'especes', date: '2026-10-05' });
  await enregistrerReleve(db, { contratId, nouvelIndex: 2, date: '2026-10-10' });
  await supprimerLocataireDefinitivement(db, locataireId, 'Locataire saisi par erreur');
  for (const table of ['locataires', 'contrats', 'echeances', 'paiements', 'recus', 'factures', 'achats_electricite', 'releves', 'mouvements_financiers']) {
    expect(await db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)).toEqual({ n: 0 });
  }
  expect(await soldeTresorerie(db)).toBe(0);
  const [j] = await journalDesModifications(db);
  expect(j).toMatchObject({ action: 'suppression', motif: 'Locataire saisi par erreur' });
  expect(JSON.parse(j.details!)).toMatchObject({ nom: 'Awa', paiements: 1, total_paye: 26000 });
  expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
});
