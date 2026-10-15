import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { creerLogement, getLogement, listerLogements, modifierLogement, retirerLogement } from '../logementRepository';
import {
  contratsDuLocataire,
  entrerLocataire,
  getLocataire,
  listerLocataires,
  modifierConditionsContrat,
  retirerLocataire,
  terminerContrat,
  type ConditionsContrat,
} from '../locataireRepository';

const conditions: ConditionsContrat = {
  date_debut: '2026-09-05',
  loyer: 25000,
  toilettes: 1000,
  caution: 50000,
  prix_kwh: 250,
  releve_initial: 1000,
  jour_echeance: 5,
};

async function logement(db: SqlDatabase, reference = 'Chambre 1') {
  return creerLogement(db, { reference, type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 1000 });
}

describe('logements', () => {
  test('création, liste triée et occupation déduite des contrats', async () => {
    const db = await createMigratedDatabase();
    const b = await logement(db, 'B2');
    await logement(db, 'A1');
    expect((await listerLogements(db)).map((l) => l.reference)).toEqual(['A1', 'B2']);
    await entrerLocataire(db, { nom_complet: 'Awa' }, b, conditions);
    const l = await getLogement(db, b);
    expect(l).toMatchObject({ locataire_nom: 'Awa', loyer_contrat: 25000 });
  });

  test('refuse une référence vide, un montant négatif ou décimal, une référence en double', async () => {
    const db = await createMigratedDatabase();
    await expect(logement(db, '  ')).rejects.toThrow(/obligatoire/);
    await expect(creerLogement(db, { reference: 'X', type: 'autre', loyer_indicatif: -1, toilettes: 0 })).rejects.toThrow(/invalide/);
    await expect(creerLogement(db, { reference: 'X', type: 'autre', loyer_indicatif: 10.5, toilettes: 0 })).rejects.toThrow(/invalide/);
    await logement(db, 'A1');
    const doublon = await logement(db, 'a1').catch((e: unknown) => e);
    expect(messageErreur(doublon)).toBe('Un logement porte déjà cette référence.');
  });

  test('modifier la fiche ne change pas le loyer du contrat en cours', async () => {
    const db = await createMigratedDatabase();
    const id = await logement(db);
    await entrerLocataire(db, { nom_complet: 'Awa' }, id, conditions);
    await modifierLogement(db, id, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 30000, toilettes: 1000 });
    expect(await getLogement(db, id)).toMatchObject({ loyer_indicatif: 30000, loyer_contrat: 25000 });
  });

  test('retirer : supprime sans historique, archive avec historique, refuse si occupé', async () => {
    const db = await createMigratedDatabase();
    const vide = await logement(db, 'Vide');
    expect(await retirerLogement(db, vide)).toBe('supprime');

    const occupe = await logement(db, 'Occupé');
    const { contratId } = await entrerLocataire(db, { nom_complet: 'Awa' }, occupe, conditions);
    await expect(retirerLogement(db, occupe)).rejects.toThrow(/occupé/);
    await terminerContrat(db, contratId, '2026-12-31');
    expect(await retirerLogement(db, occupe)).toBe('archive');
    expect(await listerLogements(db)).toHaveLength(0);
    expect(await listerLogements(db, { inclureArchives: true })).toHaveLength(1);
  });
});

describe('locataires et contrats', () => {
  test('entrée : fiche + contrat créés ensemble', async () => {
    const db = await createMigratedDatabase();
    const id = await logement(db);
    const { locataireId } = await entrerLocataire(db, { nom_complet: ' Moussa ', telephone: '' }, id, conditions);
    expect(await getLocataire(db, locataireId)).toMatchObject({
      nom_complet: 'Moussa',
      telephone: null,
      statut: 'actif',
      contrat_statut: 'actif',
      logement_reference: 'Chambre 1',
      loyer: 25000,
    });
  });

  test('refuse une seconde attribution du même logement, sans rien écrire', async () => {
    const db = await createMigratedDatabase();
    const id = await logement(db);
    await entrerLocataire(db, { nom_complet: 'Moussa' }, id, conditions);
    await expect(entrerLocataire(db, { nom_complet: 'Awa' }, id, conditions)).rejects.toThrow(/déjà occupé/);
    expect((await listerLocataires(db)).map((l) => l.nom_complet)).toEqual(['Moussa']);
  });

  test('refuse des conditions incohérentes', async () => {
    const db = await createMigratedDatabase();
    const id = await logement(db);
    await expect(entrerLocataire(db, { nom_complet: 'A' }, id, { ...conditions, jour_echeance: 31 })).rejects.toThrow(/entre 1 et 28/);
    await expect(entrerLocataire(db, { nom_complet: 'A' }, id, { ...conditions, prix_kwh: 0 })).rejects.toThrow(/invalide/);
    await expect(
      entrerLocataire(db, { nom_complet: 'A' }, id, { ...conditions, date_fin: '2026-01-01' })
    ).rejects.toThrow(/précède/);
    await expect(entrerLocataire(db, { nom_complet: 'A' }, id, { ...conditions, date_debut: '01/10/2026' })).rejects.toThrow(/date invalide/);
  });

  test('départ : contrat terminé, logement libéré puis réattribuable, historique conservé', async () => {
    const db = await createMigratedDatabase();
    const id = await logement(db);
    const moussa = await entrerLocataire(db, { nom_complet: 'Moussa' }, id, conditions);
    await expect(terminerContrat(db, moussa.contratId, '2026-09-01')).rejects.toThrow(/précède/);
    await terminerContrat(db, moussa.contratId, '2026-12-31');
    await expect(terminerContrat(db, moussa.contratId, '2026-12-31')).rejects.toThrow(/déjà terminé/);

    expect(await getLogement(db, id)).toMatchObject({ contrat_id: null });
    await entrerLocataire(db, { nom_complet: 'Awa' }, id, { ...conditions, date_debut: '2027-01-01' });

    const ancien = await getLocataire(db, moussa.locataireId);
    expect(ancien).toMatchObject({ statut: 'parti', contrat_statut: 'termine', date_sortie: '2026-12-31' });
    expect(await contratsDuLocataire(db, moussa.locataireId)).toHaveLength(1);
  });

  test('modifier les conditions d’un contrat actif uniquement', async () => {
    const db = await createMigratedDatabase();
    const id = await logement(db);
    const { contratId, locataireId } = await entrerLocataire(db, { nom_complet: 'Moussa' }, id, conditions);
    await modifierConditionsContrat(db, contratId, { ...conditions, loyer: 30000 });
    expect(await getLocataire(db, locataireId)).toMatchObject({ loyer: 30000 });
    await terminerContrat(db, contratId, '2026-12-31');
    await expect(modifierConditionsContrat(db, contratId, conditions)).rejects.toThrow(/terminé/);
  });

  test('retirer un locataire : refusé si contrat actif, archivé sinon (jamais supprimé avec historique)', async () => {
    const db = await createMigratedDatabase();
    const id = await logement(db);
    const { contratId, locataireId } = await entrerLocataire(db, { nom_complet: 'Moussa' }, id, conditions);
    await expect(retirerLocataire(db, locataireId)).rejects.toThrow(/contrat en cours/);
    await terminerContrat(db, contratId, '2026-12-31');
    expect(await retirerLocataire(db, locataireId)).toBe('archive');
    expect(await listerLocataires(db)).toHaveLength(0);
    expect(await contratsDuLocataire(db, locataireId)).toHaveLength(1);
  });
});
