import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import type { SqlDatabase } from '../../db/types';
import { dateEcheance, etatEcheance, jourEcheanceParDefaut, moisEntre, payeJusquaApres, premierMoisFacture } from '../../domain/echeances';
import { creerLogement } from '../logementRepository';
import { entrerLocataire, modifierConditionsContrat, terminerContrat, type ConditionsContrat } from '../locataireRepository';
import {
  annulerFacture,
  annulerPaiement,
  echeancesDuLocataire,
  emettreFactureLoyer,
  enregistrerPaiement,
  genererEcheances,
  listerEcheancesDuMois,
  paiementsDuLocataire,
  echeancierDuLocataire,
  situationLocataire,
  syntheseDuMois,
} from '../loyerRepository';

const conditions: ConditionsContrat = {
  date_debut: '2026-09-05',
  loyer: 25000,
  toilettes: 1000,
  caution: 0,
  prix_kwh: 250,
  releve_initial: 0,
  jour_echeance: 5,
};

async function installer(db: SqlDatabase, c: Partial<ConditionsContrat> = {}) {
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
  return entrerLocataire(db, { nom_complet: 'Awa' }, logementId, { ...conditions, ...c });
}

const payer = (db: SqlDatabase, locataireId: number, montant: number, datePaiement = '2026-10-03') =>
  enregistrerPaiement(db, { locataireId, montant, mode: 'especes', datePaiement });

describe('règles de calcul', () => {
  test('statuts : payée, partielle, en attente, en retard dès le lendemain de l’échéance', () => {
    expect(etatEcheance(26000, 26000, '2026-10-05', '2026-10-20').statut).toBe('payee');
    expect(etatEcheance(26000, 0, '2026-10-05', '2026-10-05')).toMatchObject({ statut: 'en_attente', enRetard: false });
    expect(etatEcheance(26000, 0, '2026-10-05', '2026-10-06')).toMatchObject({ statut: 'en_retard', enRetard: true });
    expect(etatEcheance(26000, 15000, '2026-10-05', '2026-10-06')).toMatchObject({ statut: 'partielle', enRetard: true, reste: 11000 });
  });

  test('mois couverts et date d’échéance jamais avant l’entrée', () => {
    expect(moisEntre('2026-11-20', '2027-02-01')).toEqual([
      { annee: 2026, mois: 11 },
      { annee: 2026, mois: 12 },
      { annee: 2027, mois: 1 },
      { annee: 2027, mois: 2 },
    ]);
    expect(dateEcheance(2026, 10, 5, '2026-10-15')).toBe('2026-10-15');
    expect(dateEcheance(2026, 11, 5, '2026-10-15')).toBe('2026-11-05');
  });
});

describe('échéances', () => {
  test('génération jusqu’au mois courant, sans doublon si on relance', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    expect(await genererEcheances(db, '2026-12-10')).toBe(3);
    expect(await genererEcheances(db, '2026-12-10')).toBe(0);
    const liste = await echeancesDuLocataire(db, locataireId, '2026-12-10');
    expect(liste.map((e) => `${e.annee}-${e.mois}:${e.montant_du}`)).toEqual(['2026-12:26000', '2026-11:26000', '2026-10:26000']);
  });

  test('une hausse de loyer ne change pas les échéances déjà créées', async () => {
    const db = await createMigratedDatabase();
    const { locataireId, contratId } = await installer(db);
    await genererEcheances(db, '2026-10-10');
    await modifierConditionsContrat(db, contratId, { ...conditions, loyer: 30000 });
    await genererEcheances(db, '2026-11-10');
    const liste = await echeancesDuLocataire(db, locataireId, '2026-11-10');
    expect(liste.map((e) => e.montant_du)).toEqual([31000, 26000]);
  });

  test('un contrat terminé ne génère plus d’échéances après la sortie', async () => {
    const db = await createMigratedDatabase();
    const { locataireId, contratId } = await installer(db);
    await terminerContrat(db, contratId, '2026-11-15');
    await genererEcheances(db, '2027-02-01');
    expect(await echeancesDuLocataire(db, locataireId, '2027-02-01')).toHaveLength(2);
  });
});

describe('paiements', () => {
  test('paiement partiel de 15 000 sur 26 000 : partielle, reste 11 000, reçu numéroté', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-10-01');
    const r = await payer(db, locataireId, 15000);
    expect(r).toMatchObject({ recuNumero: 'REC-2026-00001', credit: 0, dette: 11000 });
    const [e] = await listerEcheancesDuMois(db, 2026, 10, '2026-10-06');
    expect(e).toMatchObject({ paye: 15000, reste: 11000, statut: 'partielle', enRetard: true });
  });

  test('le paiement règle d’abord les échéances les plus anciennes', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-11-10');
    await payer(db, locataireId, 30000, '2026-11-10');
    const [nov, oct] = await echeancesDuLocataire(db, locataireId, '2026-11-10');
    expect(oct).toMatchObject({ statut: 'payee' });
    expect(nov).toMatchObject({ paye: 4000, statut: 'partielle' });
  });

  test('trop-perçu : conservé en crédit puis affecté à l’échéance suivante, jamais compté deux fois', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-10-01');
    const r = await payer(db, locataireId, 30000);
    expect(r.credit).toBe(4000);
    expect(await situationLocataire(db, locataireId)).toEqual({ du: 26000, regle: 26000, dette: 0, credit: 4000 });

    await genererEcheances(db, '2026-11-01');
    expect(await situationLocataire(db, locataireId)).toEqual({ du: 52000, regle: 30000, dette: 22000, credit: 0 });
    const [nov] = await echeancesDuLocataire(db, locataireId, '2026-11-01');
    expect(nov.paye).toBe(4000);
  });

  test('annulation : le paiement reste visible, ne compte plus, le reçu garde son numéro', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-10-01');
    await payer(db, locataireId, 26000);
    const [p] = await paiementsDuLocataire(db, locataireId);
    await expect(annulerPaiement(db, p.id, '  ')).rejects.toThrow(/motif/);
    await annulerPaiement(db, p.id, 'Erreur de saisie');
    await expect(annulerPaiement(db, p.id, 'Encore')).rejects.toThrow(/déjà annulé/);

    expect(await situationLocataire(db, locataireId)).toMatchObject({ dette: 26000, credit: 0 });
    const [apres] = await paiementsDuLocataire(db, locataireId);
    expect(apres).toMatchObject({ motif_annulation: 'Erreur de saisie', recu_numero: 'REC-2026-00001' });
    const mvt = await db.get<{ statut: string }>("SELECT statut FROM mouvements_financiers WHERE origine_type = 'paiement'");
    expect(mvt?.statut).toBe('annule');

    // Le numéro suivant n'est pas celui du reçu annulé.
    expect((await payer(db, locataireId, 26000)).recuNumero).toBe('REC-2026-00002');
  });

  test('un encaissement crée exactement un mouvement de trésorerie', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-10-01');
    await payer(db, locataireId, 26000);
    const n = await db.get<{ n: number; total: number }>("SELECT count(*) AS n, SUM(montant) AS total FROM mouvements_financiers WHERE statut = 'valide'");
    expect(n).toEqual({ n: 1, total: 26000 });
  });

  test('refuse un montant nul, décimal ou une date invalide', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await expect(payer(db, locataireId, 0)).rejects.toThrow(/invalide/);
    await expect(payer(db, locataireId, 10.5)).rejects.toThrow(/invalide/);
    await expect(payer(db, locataireId, 100, '03/10/2026')).rejects.toThrow(/date invalide/);
  });
});

describe('factures et synthèse', () => {
  test('la facture porte le montant dû, est unique par échéance, numérotée sans doublon', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-11-01');
    await payer(db, locataireId, 15000);
    const [nov, oct] = await echeancesDuLocataire(db, locataireId, '2026-11-01');
    expect(await emettreFactureLoyer(db, oct.id)).toBe('FAC-2026-00001');
    expect(await emettreFactureLoyer(db, oct.id)).toBe('FAC-2026-00001');
    const f = await db.get<{ montant: number }>("SELECT montant FROM factures WHERE numero = 'FAC-2026-00001'");
    expect(f?.montant).toBe(26000);

    await annulerFacture(db, 'FAC-2026-00001', 'Erreur');
    expect(await emettreFactureLoyer(db, oct.id)).toBe('FAC-2026-00002');
    expect(await emettreFactureLoyer(db, nov.id)).toBe('FAC-2026-00003');
  });

  test('synthèse du mois : attendu, réglé, reste, encaissé et retards', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-10-01');
    await payer(db, locataireId, 15000, '2026-10-04');
    expect(await syntheseDuMois(db, 2026, 10, '2026-10-10')).toEqual({
      attendu: 26000,
      regle: 15000,
      reste: 11000,
      encaisse: 15000,
      enRetard: 1,
    });
  });
});

test('premier loyer dû le même jour du mois suivant l’entrée', async () => {
  expect(premierMoisFacture('2026-10-15')).toBe('2026-11');
  expect(premierMoisFacture('2026-12-31')).toBe('2027-01');
  expect(jourEcheanceParDefaut('2026-10-15')).toBe(15);
  expect(jourEcheanceParDefaut('2026-10-31')).toBe(28);
  const db = await createMigratedDatabase();
  const logementId = await creerLogement(db, { reference: 'Ch 9', type: 'chambre_salon', loyer_indicatif: 20000, toilettes: 0 });
  await entrerLocataire(db, { nom_complet: 'Bio' }, logementId, { ...conditions, date_debut: '2026-10-15', jour_echeance: 15 });
  expect(await genererEcheances(db, '2026-10-31')).toBe(0);
  expect(await genererEcheances(db, '2026-11-02')).toBe(1);
  const e = await db.get<{ date_echeance: string }>('SELECT date_echeance FROM echeances');
  expect(e?.date_echeance).toBe('2026-11-15');
});

describe('échéancier et paiements d’avance', () => {
  test('4 mois payés d’un coup : payé jusqu’en janvier, prochain paiement le 5 février', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-10-10');
    await payer(db, locataireId, 26000 * 4, '2026-10-03');
    const e = await echeancierDuLocataire(db, locataireId, '2026-10-10', 6);
    expect(e.payeJusqua).toEqual({ annee: 2027, mois: 1 });
    expect(e.prochain).toEqual({ date: '2027-02-05', montant: 26000, enRetard: false });
    expect(e.lignes.map((l) => `${l.mois}:${l.statut}`)).toEqual(['10:payee', '11:avance', '12:avance', '1:avance', '2:a_venir', '3:a_venir', '4:a_venir']);

    // Le mois suivant, l'échéance de novembre est créée et réglée par l'avance : rien à payer.
    await genererEcheances(db, '2026-11-10');
    expect((await situationLocataire(db, locataireId)).dette).toBe(0);
    expect((await echeancierDuLocataire(db, locataireId, '2026-11-10', 6)).payeJusqua).toEqual({ annee: 2027, mois: 1 });
  });

  test('retard : le prochain paiement est le plus ancien mois impayé', async () => {
    const db = await createMigratedDatabase();
    const { locataireId } = await installer(db);
    await genererEcheances(db, '2026-11-10');
    await payer(db, locataireId, 10000);
    const e = await echeancierDuLocataire(db, locataireId, '2026-11-10', 2);
    expect(e.payeJusqua).toBeNull();
    expect(e.prochain).toEqual({ date: '2026-10-05', montant: 16000, enRetard: true });
  });
});

test('effet d’un paiement sur l’échéancier : jusqu’à quel mois il couvre', async () => {
  const db = await createMigratedDatabase();
  const { locataireId } = await installer(db);
  await genererEcheances(db, '2026-10-10');
  const e = await echeancierDuLocataire(db, locataireId, '2026-10-10', 6);
  expect(payeJusquaApres(e, 20000)).toBeNull();
  expect(payeJusquaApres(e, 26000 * 3)).toEqual({ annee: 2026, mois: 12 });
});
