import { MIGRATIONS, type Migration } from './schema';
import type { SqlDatabase } from './types';

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applique les migrations manquantes, chacune dans sa propre transaction :
 * un échec annule la migration en cours et laisse la base à la version précédente.
 */
export async function migrate(db: SqlDatabase, migrations: readonly Migration[] = MIGRATIONS): Promise<number> {
  let version = await getSchemaVersion(db);
  const latest = migrations.length ? migrations[migrations.length - 1].version : 0;
  if (version > latest) {
    throw new Error(`Base en version ${version}, plus récente que l'application (${latest}).`);
  }
  for (const migration of migrations) {
    if (migration.version <= version) continue;
    if (migration.version !== version + 1) {
      throw new Error(`Migration ${version + 1} manquante.`);
    }
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
    });
    version = migration.version;
  }
  return version;
}
