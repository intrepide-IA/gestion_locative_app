import { nativeDb as db } from '../database/db.native';
import type { Proprietaire } from '../types';

export async function getProprietaire(id: number): Promise<Proprietaire | undefined> {
  const result = await db.getOne<Proprietaire>('SELECT * FROM proprietaires WHERE id = ?', [id]);
  return result || undefined;
}

export async function getFirstProprietaire(): Promise<Proprietaire | undefined> {
  const result = await db.getOne<Proprietaire>('SELECT * FROM proprietaires LIMIT 1');
  return result || undefined;
}

export async function getAllProprietaires(): Promise<Proprietaire[]> {
  return db.query<Proprietaire>('SELECT * FROM proprietaires');
}

export async function createProprietaire(data: Omit<Proprietaire, 'id' | 'created_at'>): Promise<number> {
  const created_at = new Date().toISOString();
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');

  await db.exec(
    `INSERT INTO proprietaires (${keys.join(', ')}, created_at) VALUES (${placeholders}, ?)`,
    [...values, created_at]
  );

  const lastId = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return lastId?.id || 0;
}

export async function updateProprietaire(id: number, data: Partial<Proprietaire>): Promise<void> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(k => `${k} = ?`).join(', ');

  await db.exec(`UPDATE proprietaires SET ${setClause} WHERE id = ?`, [...values, id]);
}
