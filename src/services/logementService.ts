import { nativeDb as db } from '../database/db.native';
import type { Logement, StatutLogement } from '../types';
import { TOILETTES_DEFAUT } from '../types';

export async function getAllLogements(): Promise<Logement[]> {
  return db.query<Logement>('SELECT * FROM logements ORDER BY numero');
}

export async function getLogementsByStatut(statut: StatutLogement): Promise<Logement[]> {
  return db.query<Logement>('SELECT * FROM logements WHERE statut = ?', [statut]);
}

export async function getLogement(id: number): Promise<Logement | undefined> {
  const result = await db.getOne<Logement>('SELECT * FROM logements WHERE id = ?', [id]);
  return result || undefined;
}

export async function getLogementLibre(): Promise<Logement[]> {
  return getLogementsByStatut('libre');
}

export async function createLogement(data: Omit<Logement, 'id' | 'created_at'>): Promise<number> {
  const created_at = new Date().toISOString();
  const logement = {
    ...data,
    toilettes_mensuel: data.toilettes_mensuel ?? TOILETTES_DEFAUT,
    created_at,
  };

  const keys = Object.keys(logement);
  const values = Object.values(logement);
  const placeholders = keys.map(() => '?').join(', ');

  await db.exec(
    `INSERT INTO logements (${keys.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const lastId = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return lastId?.id || 0;
}

export async function updateLogement(id: number, data: Partial<Logement>): Promise<void> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(k => `${k} = ?`).join(', ');

  await db.exec(`UPDATE logements SET ${setClause} WHERE id = ?`, [...values, id]);
}

export async function deleteLogement(id: number): Promise<void> {
  const activeTenants = await db.getOne<{ count: number }>(
    "SELECT count(*) as count FROM locataires WHERE logement_id = ? AND statut = 'actif'",
    [id]
  );

  if (activeTenants && activeTenants.count > 0) {
    throw new Error("Impossible de supprimer un logement avec un locataire actif.");
  }

  await db.exec('DELETE FROM logements WHERE id = ?', [id]);
}
