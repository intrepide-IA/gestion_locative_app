import * as SQLite from 'expo-sqlite';

export class GestiLocNativeDB {
    private db: SQLite.SQLiteDatabase | null = null;

    async init() {
        if (this.db) return;
        this.db = await SQLite.openDatabaseAsync('GestiLocDB');
        await this.setupTables();
    }

    private async setupTables() {
        if (!this.db) return;

        // Proprietaires
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS proprietaires (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL
      )
    `);

        // Logements
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS logements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        type TEXT,
        adresse TEXT,
        prix_loyer REAL,
        charges REAL,
        statut TEXT,
        details TEXT,
        proprietaire_id INTEGER
      )
    `);

        // Locataires
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS locataires (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom_complet TEXT NOT NULL,
        telephone TEXT,
        email TEXT,
        logement_id INTEGER,
        statut TEXT,
        created_at TEXT,
        caution REAL,
        date_entree TEXT,
        cin TEXT
      )
    `);

        // Contrats
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS contrats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locataire_id INTEGER,
        logement_id INTEGER,
        date_debut TEXT,
        date_fin TEXT,
        montant_loyer REAL,
        conditions TEXT
      )
    `);

        // Paiements
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS paiements_loyer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locataire_id INTEGER,
        logement_id INTEGER,
        montant REAL,
        mois TEXT,
        annee INTEGER,
        date_paiement TEXT,
        statut TEXT,
        methode TEXT
      )
    `);

        // Electricité Stock
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS electricite_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locataire_id INTEGER,
        unites_restantes REAL,
        derniere_recharge_date TEXT
      )
    `);

        // Consommation Electricité
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS consommation_electricite (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locataire_id INTEGER,
        quantite REAL,
        date_consommation TEXT,
        montant REAL
      )
    `);

        // Factures
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS factures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locataire_id INTEGER,
        numero_unique TEXT,
        type TEXT,
        montant REAL,
        date_emission TEXT,
        statut TEXT,
        mois TEXT,
        annee INTEGER
      )
    `);

        // Mouvements Compte
        await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS mouvements_compte (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locataire_id INTEGER,
        type TEXT,
        montant REAL,
        description TEXT,
        date_operation TEXT
      )
    `);
    }

    // Generic helper for queries
    async query<T>(sql: string, params: any[] = []): Promise<T[]> {
        if (!this.db) await this.init();
        return await this.db!.getAllAsync<T>(sql, params);
    }

    async exec(sql: string, params: any[] = []): Promise<void> {
        if (!this.db) await this.init();
        await this.db!.runAsync(sql, params);
    }

    async getOne<T>(sql: string, params: any[] = []): Promise<T | null> {
        if (!this.db) await this.init();
        return await this.db!.getFirstAsync<T>(sql, params);
    }
}

export const nativeDb = new GestiLocNativeDB();
