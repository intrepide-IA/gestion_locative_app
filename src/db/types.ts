/** Valeur acceptée comme paramètre lié dans une requête SQL. */
export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * Accès SQL minimal utilisé par toute l'application.
 * Deux implémentations : expo-sqlite sur le téléphone, node:sqlite dans les tests.
 */
export interface SqlDatabase {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /**
   * Exécute `task` dans une transaction exclusive : seules les requêtes passées par `tx` en font partie.
   * Une exception annule toute la transaction.
   */
  transaction<T>(task: (tx: SqlDatabase) => Promise<T>): Promise<T>;
}
