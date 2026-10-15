import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import type { SqlDatabase } from '../../db/types';
import { calculerAchat, etatStock } from '../../domain/electricite';
import {
  achatsDuContrat,
  acheterElectricite,
  annulerAchat,
  enregistrerReleve,
  listerSituationsElectricite,
  relevesDuContrat,
  situationElectricite,
} from '../electriciteRepository';
import { creerLogement } from '../logementRepository';
import { entrerLocataire, terminerContrat } from '../locataireRepository';

async function installer(db: SqlDatabase, releveInitial = 1000) {
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 0 });
  return entrerLocataire(db, { nom_complet: 'Awa' }, logementId, {
    date_debut: '2026-10-01',
    loyer: 25000,
    toilettes: 0,
    caution: 0,
    prix_kwh: 250,
    releve_initial: releveInitial,
    jour_echeance: 5,
  });
}

const vendre = (db: SqlDatabase, contratId: number, montantRecu: number) =>
  acheterElectricite(db, { contratId, montantRecu, mode: 'especes', date: '2026-10-05' });

describe('calculs', () => {
  test('5 000 FCFA à 250 FCFA/kWh = 20 kWh, sans écart', () => {
    expect(calculerAchat(5000, 250)).toEqual({ kwh: 20, montantFacture: 5000, ecart: 0 });
  });

  test('arrondi à 0,1 kWh inférieur, écart explicite à rendre', () => {
    expect(calculerAchat(1010, 250)).toEqual({ kwh: 4, montantFacture: 1000, ecart: 10 });
    expect(calculerAchat(1030, 250)).toEqual({ kwh: 4.1, montantFacture: 1025, ecart: 5 });
    expect(calculerAchat(1000, 300)).toEqual({ kwh: 3.3, montantFacture: 990, ecart: 10 });
  });

  test('états du stock', () => {
    expect([etatStock(10, 5), etatStock(4.9, 5), etatStock(0, 5), etatStock(-2, 5)]).toEqual(['ok', 'bas', 'epuise', 'deficit']);
  });
});

describe('ventes et relevés', () => {
  test('vente : stock, facture d’électricité et encaissement créés ensemble', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db);
    const r = await vendre(db, contratId, 5000);
    expect(r).toMatchObject({ kwh: 20, montantFacture: 5000, ecart: 0, factureNumero: 'FAC-2026-00001' });
    expect(await situationElectricite(db, contratId)).toMatchObject({ achetes: 20, consommes: 0, stock: 20, etat: 'ok' });
    const mvt = await db.get<{ montant: number }>("SELECT montant FROM mouvements_financiers WHERE origine_type = 'achat_electricite'");
    expect(mvt?.montant).toBe(5000);
  });

  test('premier relevé à partir du relevé initial, consommation déduite du stock', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db, 1000);
    await vendre(db, contratId, 5000);
    expect(await enregistrerReleve(db, { contratId, nouvelIndex: 1012, date: '2026-10-10' })).toEqual({ consommation: 12 });
    expect(await situationElectricite(db, contratId)).toMatchObject({ consommes: 12, stock: 8, dernier_index: 1012, etat: 'ok' });
    await enregistrerReleve(db, { contratId, nouvelIndex: 1016.3, date: '2026-10-12' });
    expect(await situationElectricite(db, contratId)).toMatchObject({ stock: 3.7, etat: 'bas' });
  });

  test('index inférieur refusé, sauf changement de compteur déclaré', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db, 1000);
    await enregistrerReleve(db, { contratId, nouvelIndex: 1012, date: '2026-10-10' });
    await expect(enregistrerReleve(db, { contratId, nouvelIndex: 990, date: '2026-10-11' })).rejects.toThrow(/inférieur/);
    await enregistrerReleve(db, { contratId, nouvelIndex: 0, date: '2026-10-11', motifCorrection: 'Nouveau compteur' });
    await enregistrerReleve(db, { contratId, nouvelIndex: 5, date: '2026-10-12' });
    expect(await situationElectricite(db, contratId)).toMatchObject({ consommes: 17, dernier_index: 5 });
    expect((await relevesDuContrat(db, contratId)).map((r) => r.consommation)).toEqual([5, 0, 12]);
  });

  test('consommation supérieure au stock : déficit explicite', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db, 0);
    await vendre(db, contratId, 1000);
    await enregistrerReleve(db, { contratId, nouvelIndex: 6, date: '2026-10-10' });
    expect(await situationElectricite(db, contratId)).toMatchObject({ stock: -2, etat: 'deficit' });
    expect((await listerSituationsElectricite(db))[0].etat).toBe('deficit');
  });

  test('annulation d’une vente : stock, facture et trésorerie corrigés, trace conservée', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db);
    const r = await vendre(db, contratId, 5000);
    await annulerAchat(db, r.achatId, 'Erreur de montant');
    expect(await situationElectricite(db, contratId)).toMatchObject({ achetes: 0, stock: 0, etat: 'epuise' });
    const [achat] = await achatsDuContrat(db, contratId);
    expect(achat).toMatchObject({ motif_annulation: 'Erreur de montant', facture_numero: 'FAC-2026-00001' });
    const f = await db.get<{ statut: string }>("SELECT statut FROM factures WHERE numero = 'FAC-2026-00001'");
    expect(f?.statut).toBe('annulee');
  });

  test('refus : montant trop faible, contrat terminé', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db);
    await expect(vendre(db, contratId, 20)).rejects.toThrow(/insuffisant/);
    await terminerContrat(db, contratId, '2026-10-20');
    await expect(vendre(db, contratId, 5000)).rejects.toThrow(/terminé/);
  });
});
