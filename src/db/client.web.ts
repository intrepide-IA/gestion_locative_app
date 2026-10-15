/**
 * Version web de l'ouverture de base, réservée à l'aperçu de développement : pas de chiffrement,
 * pas de conversion de l'ancienne base. Le téléphone utilise `client.ts`.
 */
import * as SQLite from 'expo-sqlite';

import { creerGestionMaisons } from './maisons';
import { migrate } from './migrate';
import { serialize } from './serialized';
import type { SqlDatabase, SqlValue } from './types';

export const DATABASE_NAME = 'onile-apercu-web.db';

const natives = new Map<string, SQLite.SQLiteDatabase>();

async function ouvrirBase(fichier: string): Promise<SqlDatabase> {
  const native = await SQLite.openDatabaseAsync(fichier);
  natives.set(fichier, native);
  await native.execAsync('PRAGMA foreign_keys = ON;');
  const db = serialize({
    exec: (sql) => native.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      const result = await native.runAsync(sql, params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    all: (sql, params: SqlValue[] = []) => native.getAllAsync(sql, params),
    get: (sql, params: SqlValue[] = []) => native.getFirstAsync(sql, params),
  });
  await migrate(db);
  return db;
}

const stockage = {
  lire: async (cle: string) => {
    try {
      return globalThis.localStorage?.getItem(cle) ?? null;
    } catch {
      return null;
    }
  },
  ecrire: async (cle: string, valeur: string) => {
    try {
      globalThis.localStorage?.setItem(cle, valeur);
    } catch {
      // Stockage indisponible (navigation privée) : la liste des maisons n'est pas conservée.
    }
  },
};

export const maisons = creerGestionMaisons({
  fichierPrincipal: DATABASE_NAME,
  ouvrir: ouvrirBase,
  fermer: async (fichier) => {
    await natives.get(fichier)?.closeAsync();
    natives.delete(fichier);
  },
  supprimerFichier: (fichier) => SQLite.deleteDatabaseAsync(fichier),
  ...stockage,
});

export function getDatabase(): Promise<SqlDatabase> {
  return maisons.base();
}
