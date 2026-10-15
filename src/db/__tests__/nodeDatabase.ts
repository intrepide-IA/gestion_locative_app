/**
 * Implémentation de SqlDatabase sur node:sqlite, pour exécuter le vrai schéma et les vraies requêtes dans Jest.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import type { SqlDatabase, SqlValue } from '../types';

export function createNodeDatabase(): SqlDatabase {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys = ON;');
  let depth = 0;

  const db: SqlDatabase = {
    exec: async (sql) => {
      native.exec(sql);
    },
    run: async (sql, params: SqlValue[] = []) => {
      const result = native.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    all: async <T>(sql: string, params: SqlValue[] = []) => native.prepare(sql).all(...params) as T[],
    get: async <T>(sql: string, params: SqlValue[] = []) => (native.prepare(sql).get(...params) as T | undefined) ?? null,
    transaction: async (task) => {
      if (depth > 0) return task(db);
      depth++;
      native.exec('BEGIN IMMEDIATE');
      try {
        const result = await task(db);
        native.exec('COMMIT');
        return result;
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },
  };
  return db;
}

export async function createMigratedDatabase(): Promise<SqlDatabase> {
  const db = createNodeDatabase();
  await migrate(db);
  return db;
}
