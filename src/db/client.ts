import * as SQLite from 'expo-sqlite';

import { migrate } from './migrate';
import type { RunResult, SqlDatabase, SqlValue } from './types';

/** Nouveau fichier : l'ancienne base « GestiLocDB » n'est ni lue ni effacée. */
export const DATABASE_NAME = 'onile.db';

type Executor = Pick<SQLite.SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

function wrap(executor: Executor, transaction: SqlDatabase['transaction']): SqlDatabase {
  return {
    exec: (sql) => executor.execAsync(sql),
    run: async (sql, params: SqlValue[] = []): Promise<RunResult> => {
      const result = await executor.runAsync(sql, params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    },
    all: (sql, params: SqlValue[] = []) => executor.getAllAsync(sql, params),
    get: (sql, params: SqlValue[] = []) => executor.getFirstAsync(sql, params),
    transaction,
  };
}

export function fromExpoDatabase(native: SQLite.SQLiteDatabase): SqlDatabase {
  const transaction: SqlDatabase['transaction'] = async (task) => {
    let result: Awaited<ReturnType<typeof task>> | undefined;
    await native.withExclusiveTransactionAsync(async (txn) => {
      // Une transaction imbriquée réutilise simplement la transaction en cours.
      const tx: SqlDatabase = wrap(txn, (inner) => inner(tx));
      result = await task(tx);
    });
    return result as Awaited<ReturnType<typeof task>>;
  };
  return wrap(native, transaction);
}

let opening: Promise<SqlDatabase> | null = null;

/** Ouvre la base (une seule fois), active les clés étrangères et applique les migrations. */
export function getDatabase(): Promise<SqlDatabase> {
  if (!opening) {
    opening = (async () => {
      const native = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await native.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const db = fromExpoDatabase(native);
      await migrate(db);
      return db;
    })().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}
