import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { degradations, ELEMENTS_ETAT, enregistrerEtatDesLieux, getEtatDesLieux, signerEtatDesLieux } from '../etatDesLieuxRepository';
import { creerLogement } from '../logementRepository';
import { entrerLocataire } from '../locataireRepository';
import { exporterSauvegarde, restaurerSauvegarde } from '../sauvegardeRepository';

const SIGNATURE = 'data:image/svg+xml;base64,PHN2Zy8+';

async function maison() {
  const db = await createMigratedDatabase();
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

test('grille par défaut : les éléments de la fiche, non notés, datée de l’entrée', async () => {
  const { db, contratId } = await maison();
  const e = await getEtatDesLieux(db, contratId, 'entree', '2026-11-01');
  expect(e).toMatchObject({ enregistre: false, date_etat: '2026-10-15' });
  expect(e.elements.map((l) => l.element)).toEqual([...ELEMENTS_ETAT]);
  expect((await getEtatDesLieux(db, contratId, 'sortie', '2026-11-01')).date_etat).toBe('2026-11-01');
});

test('enregistrement, signatures, effacement des signatures si on modifie, sauvegarde', async () => {
  const { db, contratId } = await maison();
  const e = await getEtatDesLieux(db, contratId, 'entree', '2026-10-15');
  await expect(enregistrerEtatDesLieux(db, contratId, 'entree', { ...e, observations: null })).rejects.toThrow(/au moins un/);
  await expect(signerEtatDesLieux(db, contratId, 'entree', 'locataire', SIGNATURE, '2026-10-15')).rejects.toThrow(/d’abord/);

  const notes = e.elements.map((l, i) => ({ ...l, etat: i === 0 ? ('moyen' as const) : ('bon' as const) }));
  await enregistrerEtatDesLieux(db, contratId, 'entree', {
    date_etat: '2026-10-15',
    elements: [...notes, { element: 'Ventilateur plafond', etat: 'bon' }],
    observations: 'Fissure au salon',
  });
  await signerEtatDesLieux(db, contratId, 'entree', 'locataire', SIGNATURE, '2026-10-15');
  expect((await getEtatDesLieux(db, contratId, 'entree', '2026-10-15')).signe_le).toBeNull();
  await signerEtatDesLieux(db, contratId, 'entree', 'bailleur', SIGNATURE, '2026-10-15');
  const signe = await getEtatDesLieux(db, contratId, 'entree', '2026-10-15');
  expect(signe).toMatchObject({ enregistre: true, signe_le: '2026-10-15', observations: 'Fissure au salon' });
  expect(signe.elements).toHaveLength(ELEMENTS_ETAT.length + 1);

  const autre = await createMigratedDatabase();
  await restaurerSauvegarde(autre, JSON.parse(JSON.stringify(await exporterSauvegarde(db))));
  expect((await getEtatDesLieux(autre, contratId, 'entree', '2026-10-15')).signe_le).toBe('2026-10-15');

  await enregistrerEtatDesLieux(db, contratId, 'entree', { date_etat: '2026-10-15', elements: notes, observations: null });
  expect(await getEtatDesLieux(db, contratId, 'entree', '2026-10-15')).toMatchObject({ signe_le: null, signature_locataire: null });
});

test('dégradations : éléments plus abîmés à la sortie qu’à l’entrée', () => {
  expect(
    degradations(
      [
        { element: 'Mur', etat: 'bon' },
        { element: 'Porte', etat: 'moyen' },
        { element: 'WC', etat: 'bon' },
      ],
      [
        { element: 'Mur', etat: 'mauvais' },
        { element: 'Porte', etat: 'moyen' },
        { element: 'WC', etat: null },
      ]
    )
  ).toEqual([{ element: 'Mur', avant: 'bon', apres: 'mauvais' }]);
});

test('fiche PDF : cases cochées, dégradations signalées, textes échappés', async () => {
  const { donneesEtatDesLieux, htmlEtatDesLieux } = jest.requireActual<typeof import('../../documents/etatDesLieux')>('../../documents/etatDesLieux');
  const { db, contratId } = await maison();
  await enregistrerEtatDesLieux(db, contratId, 'entree', { date_etat: '2026-10-15', elements: [{ element: 'Mur <b>', etat: 'bon' }], observations: null });
  await enregistrerEtatDesLieux(db, contratId, 'sortie', { date_etat: '2027-10-15', elements: [{ element: 'Mur <b>', etat: 'mauvais' }], observations: null });
  const html = htmlEtatDesLieux(await donneesEtatDesLieux(db, contratId, '2027-10-15'));
  expect(html).toContain('Mur &lt;b&gt;');
  expect(html.match(/case cochee/g)).toHaveLength(2);
  expect(html).toContain('Dégradations constatées à la sortie');
  expect(html).toContain('15 oct. 2027');
});
