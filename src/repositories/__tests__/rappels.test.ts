import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { aHeure, alertesEnCours, ecartJours, rappelsSouhaites, situationsDesContrats } from '../../domain/rappels';
import { acheterElectricite, enregistrerReleve } from '../electriciteRepository';
import { creerLogement } from '../logementRepository';
import { entrerLocataire } from '../locataireRepository';
import { enregistrerPaiement } from '../loyerRepository';
import {
  definirNotificationsActives,
  lireNotificationsLues,
  listerAlertes,
  listerSituations,
  marquerNotifications,
  signatureAlerte,
  synchroniserRappels,
  type Planificateur,
} from '../rappelsRepository';

function fauxPlanificateur() {
  const programmes = new Map<string, string>();
  let n = 0;
  const p: Planificateur & { programmes: Map<string, string> } = {
    programmes,
    planifier: async (r) => {
      const id = `id-${++n}`;
      programmes.set(id, r.cle);
      return id;
    },
    annuler: async (id) => {
      programmes.delete(id);
    },
  };
  return p;
}

async function maison() {
  const db = await createMigratedDatabase();
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
  const ids = await entrerLocataire(db, { nom_complet: 'Awa' }, logementId, {
    date_debut: '2026-09-05',
    loyer: 25000,
    toilettes: 1000,
    caution: 0,
    prix_kwh: 250,
    releve_initial: 0,
    jour_echeance: 5,
  });
  return { db, ...ids };
}

const cles = (p: ReturnType<typeof fauxPlanificateur>) => [...p.programmes.values()].sort();

test('rappels J-3, J et J+3 d’une échéance, uniquement dans le futur', () => {
  const echeance = { id: 1, date_echeance: '2026-10-05', reste: 26000, locataire_nom: 'Awa', logement_reference: 'A' };
  const avant = rappelsSouhaites({ echeancesImpayees: [echeance], contratsAvecFin: [], stocks: [] }, new Date(2026, 9, 1, 8));
  expect(avant.filter((r) => r.type === 'loyer').map((r) => r.cle)).toEqual(['loyer-1-j-3', 'loyer-1-j', 'loyer-1-j+3']);
  expect(avant[0].date).toEqual(aHeure('2026-10-02'));
  const apres = rappelsSouhaites({ echeancesImpayees: [echeance], contratsAvecFin: [], stocks: [] }, new Date(2026, 9, 6, 8));
  expect(apres.filter((r) => r.type === 'loyer').map((r) => r.cle)).toEqual(['loyer-1-j+3']);
});

test('synchronisation : programmée une seule fois, annulée quand le loyer est réglé', async () => {
  const { db, locataireId } = await maison();
  const p = fauxPlanificateur();
  const maintenant = new Date(2026, 9, 1, 8);

  const premier = await synchroniserRappels(db, p, maintenant, '2026-10-01');
  expect(premier.programmes).toBe(6); // J-3, J, J+3 + rappels de sauvegarde des 3 prochains mois
  expect((await synchroniserRappels(db, p, maintenant, '2026-10-01')).programmes).toBe(0);

  await enregistrerPaiement(db, { locataireId, montant: 26000, mode: 'especes', datePaiement: '2026-10-01' });
  const bilan = await synchroniserRappels(db, p, maintenant, '2026-10-01');
  expect(bilan).toEqual({ programmes: 0, annules: 3 });
  expect(cles(p)).toEqual(['sauvegarde-2026-11', 'sauvegarde-2026-12', 'sauvegarde-2027-01']);
});

test('stock électrique bas : une seule alerte par situation', async () => {
  const { db, contratId } = await maison();
  const p = fauxPlanificateur();
  await acheterElectricite(db, { contratId, montantRecu: 1000, mode: 'especes', date: '2026-10-01' });
  const maintenant = new Date(2026, 9, 10, 8);
  await synchroniserRappels(db, p, maintenant, '2026-10-10');
  expect(cles(p).filter((c) => c.startsWith('kwh-'))).toEqual(['kwh-1-bas-4-0']);
  await synchroniserRappels(db, p, maintenant, '2026-10-10');
  expect(cles(p).filter((c) => c.startsWith('kwh-'))).toHaveLength(1);

  await enregistrerReleve(db, { contratId, nouvelIndex: 4, date: '2026-10-10' });
  await synchroniserRappels(db, p, maintenant, '2026-10-10');
  // L'alerte « bas » encore à venir est remplacée par « épuisé ».
  expect(cles(p).filter((c) => c.startsWith('kwh-'))).toEqual(['kwh-1-epuise-4-4']);
});

test('notifications désactivées : tous les rappels à venir sont annulés', async () => {
  const { db } = await maison();
  const p = fauxPlanificateur();
  await synchroniserRappels(db, p, new Date(2026, 9, 1, 8), '2026-10-01');
  await definirNotificationsActives(db, false);
  const bilan = await synchroniserRappels(db, p, new Date(2026, 9, 1, 8), '2026-10-01');
  expect(bilan.annules).toBe(6);
  expect(p.programmes.size).toBe(0);
});

test('alertes en cours : retards d’abord, fins de contrat à 30 jours, sauvegarde ancienne', () => {
  expect(ecartJours('2026-10-30', '2026-11-02')).toBe(3);
  const alertes = alertesEnCours(
    {
      echeancesImpayees: [
        { id: 1, date_echeance: '2026-10-17', reste: 5000, locataire_nom: 'Awa', logement_reference: 'A' },
        { id: 2, date_echeance: '2026-10-05', reste: 26000, locataire_nom: 'Koffi', logement_reference: 'B' },
        { id: 3, date_echeance: '2026-11-05', reste: 26000, locataire_nom: 'Koffi', logement_reference: 'B' },
      ],
      contratsAvecFin: [
        { id: 7, date_fin: '2026-11-10', locataire_nom: 'Awa', logement_reference: 'A' },
        { id: 8, date_fin: '2027-06-30', locataire_nom: 'Koffi', logement_reference: 'B' },
      ],
      stocks: [{ contrat_id: 1, etat: 'bas', stock: 2.5, locataire_nom: 'Awa', achetes: 10, consommes: 7.5 }],
      derniereSauvegarde: '2026-08-01T10:00:00.000Z',
    },
    '2026-10-15'
  );
  expect(alertes.map((a) => [a.cle, a.gravite])).toEqual([
    ['loyer-2', 'urgent'],
    ['kwh-1', 'attention'],
    ['loyer-1', 'attention'],
    ['fin-7', 'attention'],
    ['sauvegarde', 'info'],
  ]);
  expect(alertes[0].titre).toBe('Loyer en retard de 10 jours');
  expect(alertes[2].titre).toBe('Loyer attendu dans 2 jours');
});

test('listerAlertes lit la base : loyer du mois en retard, aucune sauvegarde', async () => {
  const { db } = await maison();
  const alertes = await listerAlertes(db, '2026-10-08');
  expect(alertes.map((a) => a.titre)).toEqual(['Loyer en retard de 3 jours', 'Aucune sauvegarde de vos données']);
});

test('rappels de contrôle du compteur : veille et jour de l’épuisement estimé, relevé après 7 jours', () => {
  const stock = {
    contrat_id: 3,
    etat: 'ok' as const,
    stock: 10,
    locataire_nom: 'Awa',
    achetes: 40,
    consommes: 30,
    index_coupure: 1040,
    epuisement_estime: '2026-10-15',
    dernier_releve_le: '2026-10-05',
  };
  const r = rappelsSouhaites({ echeancesImpayees: [], contratsAvecFin: [], stocks: [stock] }, new Date(2026, 9, 6, 8));
  expect(r.filter((x) => x.type === 'electricite').map((x) => [x.cle, x.date.getDate()])).toEqual([
    ['kwh-verif-3-40-30-j-1', 14],
    ['kwh-verif-3-40-30-j', 15],
    ['releve-3-2026-10-05', 12],
  ]);
  expect(r[1].corps).toContain('Index de coupure : 1040');
  expect(r[1].titre).toBe('Awa');
  const alertes = alertesEnCours({ echeancesImpayees: [], contratsAvecFin: [], stocks: [stock], derniereSauvegarde: '2026-10-10' }, '2026-10-14');
  expect(alertes.map((a) => a.titre)).toEqual(['Électricité : épuisement estimé dans 1 jour']);
});

test('listerAlertes : chaque alerte est expliquée (période, montant, que faire)', async () => {
  const { db } = await maison();
  const [loyer] = await listerAlertes(db, '2026-10-08');
  expect(loyer.description).toContain('Le loyer de');
  expect(loyer.description).toContain('Il reste');
  expect(loyer.locataireId).toBeGreaterThan(0);
  expect(loyer.contratId).toBeGreaterThan(0);
});

test('notifications lues : marquées, puis non lues à nouveau si l’alerte s’aggrave', async () => {
  const { db } = await maison();
  const avant = await listerAlertes(db, '2026-10-03');
  const loyer = avant.find((a) => a.type === 'loyer')!;
  expect(loyer.gravite).toBe('attention');
  await marquerNotifications(db, [signatureAlerte(loyer)], true, avant.map(signatureAlerte));
  expect((await lireNotificationsLues(db)).has(signatureAlerte(loyer))).toBe(true);
  const apres = (await listerAlertes(db, '2026-10-08')).find((a) => a.cle === loyer.cle)!;
  expect(apres.gravite).toBe('urgent');
  expect((await lireNotificationsLues(db)).has(signatureAlerte(apres))).toBe(false);
  // Les signatures d'alertes disparues sont oubliées.
  await marquerNotifications(db, [], true, []);
  expect((await lireNotificationsLues(db)).size).toBe(0);
});

test('situations : loyer à jour, échéance proche, retard ; électricité basse ou consommée sans payer', () => {
  const s = situationsDesContrats(
    {
      echeancesImpayees: [
        { id: 1, contrat_id: 1, date_echeance: '2026-10-05', reste: 26000, locataire_nom: 'A', logement_reference: 'A' },
        { id: 2, contrat_id: 1, date_echeance: '2026-09-05', reste: 4000, locataire_nom: 'A', logement_reference: 'A' },
        { id: 3, contrat_id: 2, date_echeance: '2026-10-18', reste: 26000, locataire_nom: 'B', logement_reference: 'B' },
      ],
      stocks: [
        { contrat_id: 2, etat: 'bas', stock: 3, locataire_nom: 'B', achetes: 40, consommes: 37 },
        { contrat_id: 4, etat: 'deficit', stock: -2, prix_kwh: 250, locataire_nom: 'D', achetes: 10, consommes: 12 },
      ],
    },
    [1, 2, 3],
    '2026-10-15'
  );
  expect(s.get(1)).toMatchObject({ niveau: 'retard', loyer: { niveau: 'retard', enRetard: 30000, joursRetard: 40 } });
  expect(s.get(2)).toMatchObject({ niveau: 'attention', loyer: { prochain: { montant: 26000, dans: 3 } }, electricite: { niveau: 'attention' } });
  expect(s.get(3)).toMatchObject({ niveau: 'ok', loyer: { niveau: 'ok' }, electricite: null });
  expect(s.get(4)).toMatchObject({ niveau: 'retard', loyer: null, electricite: { etat: 'deficit', montantDu: 500 } });
});

test('listerSituations lit la base : le loyer du mois en retard colore la chambre en rouge', async () => {
  const { db } = await maison();
  const situations = [...(await listerSituations(db, '2026-10-08')).values()];
  expect(situations).toHaveLength(1);
  expect(situations[0]).toMatchObject({ niveau: 'retard', loyer: { joursRetard: 3 } });
});
