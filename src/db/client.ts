import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import { getOrCreateDatabaseKey } from '../security/native';
import { migrate } from './migrate';
import { creerGestionMaisons } from './maisons';
import { serialize } from './serialized';
import type { SqlDatabase, SqlValue } from './types';

/** Base chiffrée (SQLCipher). L'ancienne base « GestiLocDB » de la première application n'est ni lue ni effacée. */
export const DATABASE_NAME = 'onile-securise.db';
/** Base non chiffrée créée par les APK de test du lot 1, convertie une fois puis supprimée. */
const PLAINTEXT_DATABASE_NAME = 'onile.db';
const PLAINTEXT_CHECKED_KEY = 'onile.db.plaintext-checked.v1';

const assertKey = (key: string) => {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Clé de chiffrement invalide.');
};

const databasePath = (name: string) =>
  `${String(SQLite.defaultDatabaseDirectory).replace(/^file:\/\//, '').replace(/\/$/, '')}/${name}`;

function fromExpoDatabase(native: SQLite.SQLiteDatabase): SqlDatabase {
  return serialize({
    exec: (sql) => native.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      const result = await native.runAsync(sql, params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    all: (sql, params: SqlValue[] = []) => native.getAllAsync(sql, params),
    get: (sql, params: SqlValue[] = []) => native.getFirstAsync(sql, params),
  });
}

/**
 * Convertit la base non chiffrée du lot 1 (si elle contient quelque chose) vers la base chiffrée,
 * avec `sqlcipher_export`, puis supprime l'ancienne. Ne fait rien si la base chiffrée existe déjà.
 */
async function encryptPlaintextDatabaseOnce(key: string): Promise<void> {
  if (await SecureStore.getItemAsync(PLAINTEXT_CHECKED_KEY)) return;

  const plain = await SQLite.openDatabaseAsync(PLAINTEXT_DATABASE_NAME);
  let exported = false;
  try {
    const tables = await plain.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM sqlite_master');
    if ((tables?.n ?? 0) > 0) {
      const version = (await plain.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
      await plain.execAsync(`ATTACH DATABASE '${databasePath(DATABASE_NAME)}' AS chiffree KEY "x'${key}'";`);
      const target = await plain.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM chiffree.sqlite_master');
      if ((target?.n ?? 0) === 0) {
        await plain.execAsync(`SELECT sqlcipher_export('chiffree'); PRAGMA chiffree.user_version = ${Number(version)};`);
        exported = true;
      }
      await plain.execAsync('DETACH DATABASE chiffree;');
    } else {
      exported = true; // Fichier vide (créé par l'ouverture ci-dessus) : rien à convertir.
    }
  } finally {
    await plain.closeAsync();
  }
  if (exported) {
    await SQLite.deleteDatabaseAsync(PLAINTEXT_DATABASE_NAME);
    await SecureStore.setItemAsync(PLAINTEXT_CHECKED_KEY, '1');
  }
}

const natives = new Map<string, SQLite.SQLiteDatabase>();

/**
 * Ouvre une base chiffrée, active les clés étrangères et applique les migrations.
 * `PRAGMA key` est la toute première instruction après l'ouverture (exigence SQLCipher).
 * La même clé (coffre du téléphone) chiffre toutes les maisons.
 */
async function ouvrirBase(fichier: string): Promise<SqlDatabase> {
  const key = await getOrCreateDatabaseKey();
  assertKey(key);
  if (fichier === DATABASE_NAME) await encryptPlaintextDatabaseOnce(key);

  const native = await SQLite.openDatabaseAsync(fichier);
  await native.execAsync(`PRAGMA key = "x'${key}'";`);
  // Échoue ici (« file is not a database ») si la clé ne correspond pas au fichier.
  await native.getFirstAsync('SELECT count(*) FROM sqlite_master');
  await native.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  natives.set(fichier, native);

  const db = fromExpoDatabase(native);
  await migrate(db);
  return db;
}

/** Les maisons du propriétaire (une base par maison) ; la liste est gardée dans le coffre du téléphone. */
export const maisons = creerGestionMaisons({
  fichierPrincipal: DATABASE_NAME,
  ouvrir: ouvrirBase,
  fermer: async (fichier) => {
    await natives.get(fichier)?.closeAsync();
    natives.delete(fichier);
  },
  supprimerFichier: (fichier) => SQLite.deleteDatabaseAsync(fichier),
  lire: (cle) => SecureStore.getItemAsync(cle),
  ecrire: (cle, valeur) => SecureStore.setItemAsync(cle, valeur),
});

/** Base de la maison active. */
export function getDatabase(): Promise<SqlDatabase> {
  return maisons.base();
}
