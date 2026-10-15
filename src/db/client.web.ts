/**
 * Version web de l'ouverture de base, réservée à l'aperçu de développement : pas de chiffrement,
 * pas de conversion de l'ancienne base. Le téléphone utilise `client.ts`.
 */
import * as SQLite from 'expo-sqlite';

import { migrate } from './migrate';
import { serialize } from './serialized';
import type { SqlDatabase, SqlValue } from './types';

export const DATABASE_NAME = 'onile-apercu-web.db';

let opening: Promise<SqlDatabase> | null = null;

export function getDatabase(): Promise<SqlDatabase> {
  if (!opening) {
    opening = (async () => {
      const native = await SQLite.openDatabaseAsync(DATABASE_NAME);
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
    })().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}
