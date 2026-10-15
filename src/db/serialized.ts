import type { SqlDatabase } from './types';

/** Accès SQL brut sur une seule connexion, sans gestion de transaction. */
export type RawExecutor = Omit<SqlDatabase, 'transaction'>;

/**
 * Sérialise tous les accès à une connexion unique et y ajoute les transactions.
 *
 * Pourquoi : `withExclusiveTransactionAsync` d'expo-sqlite ouvre une seconde connexion, qui n'a ni la clé
 * SQLCipher ni `PRAGMA foreign_keys`. Ici, une transaction garde la connexion principale (donc ses réglages)
 * et les autres requêtes attendent la fin de la transaction au lieu de s'y glisser.
 *
 * Règle : à l'intérieur d'une transaction, n'utiliser que l'objet `tx` reçu ; appeler la base extérieure
 * attendrait la fin de la transaction et la bloquerait.
 */
export function serialize(raw: RawExecutor): SqlDatabase {
  let tail: Promise<unknown> = Promise.resolve();

  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work, work);
    tail = result.catch(() => undefined);
    return result;
  };

  // Objet passé aux tâches : accès direct (le verrou est déjà détenu), transactions imbriquées aplaties.
  const tx: SqlDatabase = {
    exec: (sql) => raw.exec(sql),
    run: (sql, params) => raw.run(sql, params),
    all: (sql, params) => raw.all(sql, params),
    get: (sql, params) => raw.get(sql, params),
    transaction: (task) => task(tx),
  };

  return {
    exec: (sql) => exclusive(() => raw.exec(sql)),
    run: (sql, params) => exclusive(() => raw.run(sql, params)),
    all: (sql, params) => exclusive(() => raw.all(sql, params)),
    get: (sql, params) => exclusive(() => raw.get(sql, params)),
    transaction: (task) =>
      exclusive(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await task(tx);
          await raw.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            await raw.exec('ROLLBACK');
          } catch {
            // SQLite a déjà annulé la transaction (erreur fatale) : rien à faire.
          }
          throw error;
        }
      }),
  };
}
