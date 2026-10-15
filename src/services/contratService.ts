import { nativeDb as db } from '../database/db.native';
import type { Contrat } from '../types';

export async function getContratByLocataire(locataireId: number): Promise<Contrat | undefined> {
  const result = await db.getOne<Contrat>('SELECT * FROM contrats WHERE locataire_id = ? ORDER BY id DESC', [locataireId]);
  return result || undefined;
}

export async function getContratActif(locataireId: number): Promise<Contrat | undefined> {
  const now = new Date().toISOString().slice(0, 10);
  const contrats = await db.query<Contrat>('SELECT * FROM contrats WHERE locataire_id = ?', [locataireId]);
  return contrats.find((c) => c.date_debut <= now && (c.date_fin ? c.date_fin >= now : true));
}

export async function createContrat(data: Omit<Contrat, 'id' | 'created_at'>): Promise<number> {
  const created_at = new Date().toISOString();
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');

  await db.exec(
    `INSERT INTO contrats (${keys.join(', ')}, created_at) VALUES (${placeholders}, ?)`,
    [...values, created_at]
  );

  const lastId = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return lastId?.id || 0;
}

export async function updateContrat(id: number, data: Partial<Contrat>): Promise<void> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(k => `${k} = ?`).join(', ');

  await db.exec(`UPDATE contrats SET ${setClause} WHERE id = ?`, [...values, id]);
}
