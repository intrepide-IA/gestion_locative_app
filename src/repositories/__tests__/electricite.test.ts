import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import type { SqlDatabase } from '../../db/types';
import { calculerAchat, etatStock } from '../../domain/electricite';
import {
  achatsDuContrat,
  acheterElectricite,
  annulerAchat,
  arreterClientElectricite,
  creerClientElectricite,
  enregistrerReleve,
  listerSituationsElectricite,
  relevesDuContrat,
  situationElectricite,
} from '../electriciteRepository';
import { creerLogement, listerLogements } from '../logementRepository';
import { entrerLocataire, listerLocataires, terminerContrat } from '../locataireRepository';
import { genererEcheances } from '../loyerRepository';

async function installer(db: SqlDatabase, releveInitial = 1000) {
  const logementId = await creerLogement(db, { reference: 'Chambre 1', type: 'chambre_salon', loyer_indicatif: 25000, toilettes: 0 });
  return entrerLocataire(db, { nom_complet: 'Awa' }, logementId, {
    date_debut: '2026-09-05',
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

describe('index de coupure et épuisement estimé', () => {
  test('2 000 FCFA à 250 = 8 kWh : coupure à l’index actuel + 8', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db, 1000);
    await vendre(db, contratId, 2000);
    const s = await situationElectricite(db, contratId);
    expect(s).toMatchObject({ stock: 8, index_coupure: 1008, epuisement_estime: null });
  });

  test('épuisement estimé d’après la consommation moyenne depuis l’entrée', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await installer(db, 1000);
    await vendre(db, contratId, 10000); // 40 kWh
    // Entrée le 5 septembre ; 30 kWh consommés en 30 jours = 1 kWh/jour.
    await enregistrerReleve(db, { contratId, nouvelIndex: 1030, date: '2026-10-05' });
    const s = await situationElectricite(db, contratId);
    expect(s).toMatchObject({ stock: 10, index_coupure: 1040, kwh_par_jour: 1, epuisement_estime: '2026-10-15' });
  });
});

describe('clients « électricité seule »', () => {
  const nouveauClient = (db: SqlDatabase, extra: Partial<Parameters<typeof creerClientElectricite>[1]> = {}) =>
    creerClientElectricite(db, { nom_complet: 'Mama Boutique', telephone: '0156784063', prix_kwh: 250, releve_initial: 500, date_debut: '2026-10-01', ...extra });

  test('ni logement ni locataire visibles, ni loyer : seulement l’électricité', async () => {
    const db = await createMigratedDatabase();
    await installer(db);
    const { contratId } = await nouveauClient(db);
    expect((await listerLogements(db)).map((l) => l.reference)).toEqual(['Chambre 1']);
    expect((await listerLocataires(db)).map((l) => l.nom_complet)).toEqual(['Awa']);
    await genererEcheances(db, '2027-01-10');
    const echeances = await db.get<{ n: number }>('SELECT count(*) AS n FROM echeances WHERE contrat_id = ?', [contratId]);
    expect(echeances?.n).toBe(0);
    const situations = await listerSituationsElectricite(db);
    expect(situations.map((s) => [s.locataire_nom, s.type_contrat])).toEqual(
      expect.arrayContaining([
        ['Awa', 'bail'],
        ['Mama Boutique', 'electricite'],
      ])
    );
    const s = await situationElectricite(db, contratId);
    expect(s).toMatchObject({ logement_reference: 'Compteur — Mama Boutique', dernier_index: 500, locataire_telephone: '0156784063' });
  });

  test('ventes, relevés et factures comme pour un locataire', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await nouveauClient(db);
    await vendre(db, contratId, 2500);
    await enregistrerReleve(db, { contratId, nouvelIndex: 504, date: '2026-10-10' });
    expect(await situationElectricite(db, contratId)).toMatchObject({ stock: 6, index_coupure: 510 });
  });

  test('emplacement en double : un numéro est ajouté', async () => {
    const db = await createMigratedDatabase();
    await nouveauClient(db, { emplacement: 'Boutique' });
    const { contratId } = await nouveauClient(db, { nom_complet: 'Autre', emplacement: 'boutique' });
    expect((await situationElectricite(db, contratId))?.logement_reference).toBe('boutique (2)');
  });

  test('arrêt du suivi : dépassement retenu sur la caution, reste rendu, compteur archivé', async () => {
    const db = await createMigratedDatabase();
    const { contratId } = await nouveauClient(db, { caution_electricite: 5000 });
    await vendre(db, contratId, 1000); // 4 kWh
    await enregistrerReleve(db, { contratId, nouvelIndex: 510, date: '2026-10-20' }); // 10 consommés : 6 kWh sans crédit
    const r = await arreterClientElectricite(db, contratId, '2026-10-21');
    expect(r).toEqual({ retenue: 1500, rendue: 3500, resteDu: 0 });
    expect(await listerSituationsElectricite(db)).toEqual([]);
    const sortie = await db.get<{ montant: number }>("SELECT montant FROM mouvements_financiers WHERE sens = 'sortie'");
    expect(sortie?.montant).toBe(3500);
  });

  test('un logement de location ne peut pas recevoir le compteur d’un client', async () => {
    const db = await createMigratedDatabase();
    await nouveauClient(db);
    const compteur = await db.get<{ id: number }>("SELECT id FROM logements WHERE usage = 'electricite'");
    await expect(
      entrerLocataire(db, { nom_complet: 'X' }, compteur!.id, { date_debut: '2026-10-01', loyer: 1, toilettes: 0, caution: 0, prix_kwh: 250, releve_initial: 0, jour_echeance: 5 })
    ).rejects.toThrow('Logement introuvable.');
  });
});
