import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import type { SqlDatabase } from '../../db/types';
import { acheterElectricite } from '../electriciteRepository';
import {
  annulerMouvement,
  creerMouvement,
  definirSoldeInitial,
  listerCategories,
  listerMouvements,
  mouvementsEnCsv,
  rapport,
  soldeTresorerie,
  validerMouvement,
} from '../financesRepository';
import { creerLogement } from '../logementRepository';
import { entrerLocataire, terminerContrat } from '../locataireRepository';
import { annulerPaiement, enregistrerPaiement, genererEcheances, paiementsDuLocataire } from '../loyerRepository';
import { enregistrerProprietaire } from '../proprietaireRepository';

async function maison(caution = 50000) {
  const db = await createMigratedDatabase();
  await enregistrerProprietaire(db, { nom: 'Moussa', telephone: null, adresse: null });
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
  const ids = await entrerLocataire(db, { nom_complet: 'Awa' }, logementId, {
    date_debut: '2026-10-01',
    loyer: 25000,
    toilettes: 1000,
    caution,
    prix_kwh: 250,
    releve_initial: 0,
    jour_echeance: 5,
  });
  return { db, logementId, ...ids };
}

async function categorie(db: SqlDatabase, sens: 'entree' | 'sortie', nom: string) {
  return (await listerCategories(db, sens)).find((c) => c.nom === nom)!.id;
}

const OCTOBRE = { debut: '2026-10-01', fin: '2026-10-31' };

test('la caution reçue est une entrée distincte des loyers', async () => {
  const { db } = await maison(50000);
  const r = await rapport(db, OCTOBRE);
  expect(r).toMatchObject({ entrees: 50000, cautions: 50000, loyersEncaisses: 0 });
});

test('solde exact après plusieurs entrées et sorties, chaque encaissement compté une fois', async () => {
  const { db, locataireId, contratId } = await maison(50000);
  await definirSoldeInitial(db, 100000);
  await genererEcheances(db, '2026-10-01');
  await enregistrerPaiement(db, { locataireId, montant: 26000, mode: 'especes', datePaiement: '2026-10-03' });
  await acheterElectricite(db, { contratId, montantRecu: 5000, mode: 'especes', date: '2026-10-04' });
  await creerMouvement(db, { sens: 'sortie', date: '2026-10-10', montant: 15000, categorieId: await categorie(db, 'sortie', 'Plomberie') });
  // 100 000 + 50 000 (caution) + 26 000 (loyer) + 5 000 (kWh) − 15 000 (plomberie)
  expect(await soldeTresorerie(db)).toBe(166000);
});

test('une dépense prévue ne touche pas la trésorerie avant d’être payée', async () => {
  const { db } = await maison(0);
  const id = await creerMouvement(db, {
    sens: 'sortie',
    date: '2026-10-20',
    montant: 30000,
    categorieId: await categorie(db, 'sortie', 'Réparations'),
    brouillon: true,
  });
  expect(await soldeTresorerie(db)).toBe(0);
  expect((await rapport(db, OCTOBRE)).depensesPrevues).toBe(30000);
  await validerMouvement(db, id, '2026-10-22');
  expect(await soldeTresorerie(db)).toBe(-30000);
});

test('annulation : saisie manuelle annulable avec motif, mouvement d’origine protégé', async () => {
  const { db, locataireId } = await maison(0);
  const id = await creerMouvement(db, { sens: 'entree', date: '2026-10-05', montant: 2000, categorieId: await categorie(db, 'entree', 'Autres revenus') });
  await expect(annulerMouvement(db, id, '')).rejects.toThrow(/motif/);
  await annulerMouvement(db, id, 'Doublon');
  expect(await soldeTresorerie(db)).toBe(0);

  await genererEcheances(db, '2026-10-01');
  await enregistrerPaiement(db, { locataireId, montant: 26000, mode: 'especes', datePaiement: '2026-10-03' });
  const loyer = (await listerMouvements(db, OCTOBRE)).find((m) => m.origine_type === 'paiement')!;
  await expect(annulerMouvement(db, loyer.id, 'Test')).rejects.toThrow(/origine/);

  // L'annulation à la source se répercute sur la trésorerie.
  const [p] = await paiementsDuLocataire(db, locataireId);
  await annulerPaiement(db, p.id, 'Erreur');
  expect(await soldeTresorerie(db)).toBe(0);
});

test('rapport : loyers facturés, encaissés, impayés et évolution mensuelle', async () => {
  const { db, locataireId } = await maison(0);
  await genererEcheances(db, '2026-11-10');
  await enregistrerPaiement(db, { locataireId, montant: 30000, mode: 'especes', datePaiement: '2026-10-03' });
  await creerMouvement(db, { sens: 'sortie', date: '2026-11-02', montant: 5000, categorieId: await categorie(db, 'sortie', 'Nettoyage') });
  const r = await rapport(db, { debut: '2026-10-01', fin: '2026-11-30' });
  expect(r).toMatchObject({
    loyersFactures: 52000,
    loyersEncaisses: 30000,
    impayes: 22000,
    entrees: 30000,
    sorties: 5000,
    resultat: 25000,
    soldeDebut: 0,
    soldeFin: 25000,
  });
  expect(r.parMois).toEqual([
    { annee: 2026, mois: 10, entrees: 30000, sorties: 0 },
    { annee: 2026, mois: 11, entrees: 0, sorties: 5000 },
  ]);
  expect(r.parCategorie.map((c) => [c.categorie, c.total])).toEqual([
    ['Loyers', 30000],
    ['Nettoyage', 5000],
  ]);
});

test('restitution de caution au départ : sortie tracée, plafonnée à la caution reçue', async () => {
  const { db, contratId } = await maison(50000);
  await expect(terminerContrat(db, contratId, '2026-12-31', 60000)).rejects.toThrow(/dépasse/);
  await terminerContrat(db, contratId, '2026-12-31', 40000);
  const sorties = (await listerMouvements(db, { debut: '2026-12-01', fin: '2026-12-31' })).filter((m) => m.sens === 'sortie');
  expect(sorties).toMatchObject([{ montant: 40000, categorie_nom: 'Restitution de caution', reference: 'DEP-2026-00001' }]);
  expect(await soldeTresorerie(db)).toBe(10000);
});

test('catégorie incohérente refusée ; export CSV lisible', async () => {
  const { db } = await maison(0);
  await expect(
    creerMouvement(db, { sens: 'sortie', date: '2026-10-05', montant: 100, categorieId: await categorie(db, 'entree', 'Autres revenus') })
  ).rejects.toThrow(/Catégorie/);
  await creerMouvement(db, {
    sens: 'sortie',
    date: '2026-10-05',
    montant: 1500,
    categorieId: await categorie(db, 'sortie', 'Entretien'),
    description: 'Ampoule; couloir',
  });
  const csv = mouvementsEnCsv(await listerMouvements(db, OCTOBRE));
  expect(csv.split('\r\n')[0]).toContain('Montant (FCFA)');
  expect(csv).toContain('"Ampoule; couloir"');
  expect(csv).toContain('DEP-2026-00001');
});
