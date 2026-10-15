/**
 * Implémentation de SqlDatabase sur node:sqlite, pour exécuter le vrai schéma et les vraies requêtes dans Jest.
 * Elle passe par `serialize`, comme la version téléphone : les transactions sont donc testées pour de vrai.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { serialize } from '../serialized';
import type { SqlDatabase, SqlValue } from '../types';

export function createNodeDatabase(): SqlDatabase {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys = ON;');
  // Laisse la main à la boucle d'événements, comme le pont natif d'expo-sqlite.
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

  return serialize({
    exec: async (sql) => {
      await tick();
      native.exec(sql);
    },
    run: async (sql, params: SqlValue[] = []) => {
      await tick();
      const result = native.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    all: async <T>(sql: string, params: SqlValue[] = []) => {
      await tick();
      return native.prepare(sql).all(...params) as T[];
    },
    get: async <T>(sql: string, params: SqlValue[] = []) => {
      await tick();
      return (native.prepare(sql).get(...params) as T | undefined) ?? null;
    },
  });
}

export async function createMigratedDatabase(): Promise<SqlDatabase> {
  const db = createNodeDatabase();
  await migrate(db);
  return db;
}
