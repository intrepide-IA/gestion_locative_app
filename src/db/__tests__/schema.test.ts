import { getSchemaVersion, migrate } from '../migrate';
import { SCHEMA_VERSION, type Migration } from '../schema';
import type { SqlDatabase } from '../types';
import { createMigratedDatabase, createNodeDatabase } from './nodeDatabase';

const NOW = '2026-10-15T10:00:00.000Z';

async function insertLogement(db: SqlDatabase, reference: string) {
  const { lastInsertRowId } = await db.run(
    "INSERT INTO logements (reference, type, loyer_indicatif, toilettes, cree_le) VALUES (?, 'chambre_salon', 25000, 1000, ?)",
    [reference, NOW]
  );
  return lastInsertRowId;
}

async function insertLocataire(db: SqlDatabase, nom: string) {
  const { lastInsertRowId } = await db.run('INSERT INTO locataires (nom_complet, cree_le) VALUES (?, ?)', [nom, NOW]);
  return lastInsertRowId;
}

async function insertContrat(db: SqlDatabase, locataireId: number, logementId: number) {
  const { lastInsertRowId } = await db.run(
    'INSERT INTO contrats (locataire_id, logement_id, date_debut, loyer, toilettes, cree_le) VALUES (?, ?, ?, 25000, 1000, ?)',
    [locataireId, logementId, '2026-10-01', NOW]
  );
  return lastInsertRowId;
}

describe('migrations', () => {
  test('une base neuve arrive à la dernière version avec les données de départ', async () => {
    const db = await createMigratedDatabase();
    expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    const parametres = await db.all<{ cle: string; valeur: string }>('SELECT cle, valeur FROM parametres ORDER BY cle');
    expect(parametres).toContainEqual({ cle: 'prix_kwh_defaut', valeur: '250' });
    expect(parametres).toContainEqual({ cle: 'seuil_kwh_bas', valeur: '5' });
    const categories = await db.get<{ n: number }>('SELECT count(*) AS n FROM categories_financieres');
    expect(categories?.n).toBeGreaterThan(10);
  });

  test('relancer les migrations ne change rien', async () => {
    const db = await createMigratedDatabase();
    await expect(migrate(db)).resolves.toBe(SCHEMA_VERSION);
    const categories = await db.get<{ n: number }>("SELECT count(*) AS n FROM categories_financieres WHERE code = 'loyer'");
    expect(categories?.n).toBe(1);
  });

  test('une migration en échec est annulée en entier', async () => {
    const db = createNodeDatabase();
    const migrations: Migration[] = [
      { version: 1, description: 'ok', sql: 'CREATE TABLE a (x INTEGER);' },
      { version: 2, description: 'casse', sql: 'CREATE TABLE b (x INTEGER); INSERT INTO table_absente VALUES (1);' },
    ];
    await expect(migrate(db, migrations)).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(1);
    const tableB = await db.get("SELECT name FROM sqlite_master WHERE name = 'b'");
    expect(tableB).toBeNull();
  });

  test('refuse une base plus récente que l’application', async () => {
    const db = createNodeDatabase();
    await db.exec('PRAGMA user_version = 99');
    await expect(migrate(db)).rejects.toThrow(/plus récente/);
  });
});

describe('contraintes du schéma', () => {
  test('les clés étrangères sont appliquées', async () => {
    const db = await createMigratedDatabase();
    await expect(insertContrat(db, 999, 999)).rejects.toThrow(/FOREIGN KEY/);
  });

  test('un logement ne peut avoir qu’un contrat actif', async () => {
    const db = await createMigratedDatabase();
    const logement = await insertLogement(db, 'A1');
    await insertContrat(db, await insertLocataire(db, 'Moussa'), logement);
    await expect(insertContrat(db, await insertLocataire(db, 'Awa'), logement)).rejects.toThrow(/UNIQUE/);
  });

  test('la référence d’un logement est unique, sans tenir compte de la casse', async () => {
    const db = await createMigratedDatabase();
    await insertLogement(db, 'A1');
    await expect(insertLogement(db, 'a1')).rejects.toThrow(/UNIQUE/);
  });

  test('une seule échéance par contrat et par mois, montant dû = loyer + toilettes', async () => {
    const db = await createMigratedDatabase();
    const contrat = await insertContrat(db, await insertLocataire(db, 'Moussa'), await insertLogement(db, 'A1'));
    const sql =
      'INSERT INTO echeances (contrat_id, annee, mois, loyer, toilettes, montant_du, date_echeance, cree_le) VALUES (?, 2026, 10, 25000, 1000, ?, ?, ?)';
    await db.run(sql, [contrat, 26000, '2026-10-05', NOW]);
    await expect(db.run(sql, [contrat, 26000, '2026-10-05', NOW])).rejects.toThrow(/UNIQUE/);
    await expect(
      db.run(sql.replace('10, 25000', '11, 25000'), [contrat, 30000, '2026-11-05', NOW])
    ).rejects.toThrow(/CHECK/);
  });

  test('les affectations ne dépassent jamais le montant du paiement', async () => {
    const db = await createMigratedDatabase();
    const locataire = await insertLocataire(db, 'Moussa');
    const contrat = await insertContrat(db, locataire, await insertLogement(db, 'A1'));
    const { lastInsertRowId: echeance } = await db.run(
      "INSERT INTO echeances (contrat_id, annee, mois, loyer, toilettes, montant_du, date_echeance, cree_le) VALUES (?, 2026, 10, 25000, 1000, 26000, '2026-10-05', ?)",
      [contrat, NOW]
    );
    const { lastInsertRowId: paiement } = await db.run(
      "INSERT INTO paiements (locataire_id, date_paiement, montant, mode, cree_le) VALUES (?, ?, 15000, 'especes', ?)",
      [locataire, NOW, NOW]
    );
    const affecter = (montant: number) =>
      db.run('INSERT INTO affectations (paiement_id, echeance_id, montant, cree_le) VALUES (?, ?, ?, ?)', [
        paiement,
        echeance,
        montant,
        NOW,
      ]);
    await affecter(10000);
    await affecter(5000);
    await expect(affecter(1)).rejects.toThrow(/affectation_superieure_au_paiement/);
  });

  test('un index de compteur qui recule exige un motif de correction', async () => {
    const db = await createMigratedDatabase();
    const contrat = await insertContrat(db, await insertLocataire(db, 'Moussa'), await insertLogement(db, 'A1'));
    const sql =
      "INSERT INTO releves (contrat_id, compteur, date_releve, ancien_index, nouvel_index, consommation, motif_correction, cree_le) VALUES (?, 'electricite', ?, ?, ?, ?, ?, ?)";
    await db.run(sql, [contrat, NOW, 1000, 1012, 12, null, NOW]);
    await expect(db.run(sql, [contrat, NOW, 1012, 990, -22, null, NOW])).rejects.toThrow(/CHECK/);
    await db.run(sql, [contrat, NOW, 1012, 0, -1012, 'Changement de compteur', NOW]);
  });

  test('une opération d’origine ne produit qu’un mouvement financier', async () => {
    const db = await createMigratedDatabase();
    const categorie = await db.get<{ id: number }>("SELECT id FROM categories_financieres WHERE code = 'loyer'");
    const sql =
      "INSERT INTO mouvements_financiers (date_operation, sens, montant, categorie_id, origine_type, origine_id, cree_le) VALUES (?, 'entree', 15000, ?, 'paiement', 1, ?)";
    await db.run(sql, [NOW, categorie!.id, NOW]);
    await expect(db.run(sql, [NOW, categorie!.id, NOW])).rejects.toThrow(/UNIQUE/);
  });
});

describe('transactions', () => {
  test('une erreur annule toutes les écritures de la transaction', async () => {
    const db = await createMigratedDatabase();
    await expect(
      db.transaction(async (tx) => {
        await insertLogement(tx, 'A1');
        await insertLogement(tx, 'A1');
      })
    ).rejects.toThrow(/UNIQUE/);
    const n = await db.get<{ n: number }>('SELECT count(*) AS n FROM logements');
    expect(n?.n).toBe(0);
  });
});
