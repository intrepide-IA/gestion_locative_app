/**
 * @deprecated Pont temporaire pour les anciens services pendant la refonte.
 * Il pointe vers la nouvelle base `onile.db`, mais les anciens services utilisent encore
 * des colonnes de l'ancien schéma : ils seront remplacés service par service (lots 3 à 6),
 * puis ce fichier sera supprimé. Tout nouveau code passe par `src/db`.
 */
import { getDatabase } from '../db/client';
import type { SqlValue } from '../db/types';

type LegacyParam = SqlValue | undefined;

const normalize = (params: LegacyParam[]): SqlValue[] => params.map((value) => (value === undefined ? null : value));

export const nativeDb = {
  async query<T>(sql: string, params: LegacyParam[] = []): Promise<T[]> {
    return (await getDatabase()).all<T>(sql, normalize(params));
  },
  async exec(sql: string, params: LegacyParam[] = []): Promise<void> {
    await (await getDatabase()).run(sql, normalize(params));
  },
  async getOne<T>(sql: string, params: LegacyParam[] = []): Promise<T | null> {
    return (await getDatabase()).get<T>(sql, normalize(params));
  },
};
