import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { aHeure, rappelsSouhaites } from '../../domain/rappels';
import { acheterElectricite, enregistrerReleve } from '../electriciteRepository';
import { creerLogement } from '../logementRepository';
import { entrerLocataire } from '../locataireRepository';
import { enregistrerPaiement } from '../loyerRepository';
import { definirNotificationsActives, synchroniserRappels, type Planificateur } from '../rappelsRepository';

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
    date_debut: '2026-10-01',
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
  expect(premier.programmes).toBe(4); // J-3, J, J+3 + rappel de sauvegarde
  expect((await synchroniserRappels(db, p, maintenant, '2026-10-01')).programmes).toBe(0);

  await enregistrerPaiement(db, { locataireId, montant: 26000, mode: 'especes', datePaiement: '2026-10-01' });
  const bilan = await synchroniserRappels(db, p, maintenant, '2026-10-01');
  expect(bilan).toEqual({ programmes: 0, annules: 3 });
  expect(cles(p)).toEqual(['sauvegarde-2026-11']);
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
  expect(bilan.annules).toBe(4);
  expect(p.programmes.size).toBe(0);
});
