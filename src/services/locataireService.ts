import { nativeDb as db } from '../database/db.native';
import type { Locataire } from '../types';

export async function getAllLocataires(): Promise<Locataire[]> {
  return db.query<Locataire>('SELECT * FROM locataires ORDER BY nom_complet');
}

export async function getLocatairesActifs(): Promise<Locataire[]> {
  return db.query<Locataire>("SELECT * FROM locataires WHERE statut = 'actif'");
}

export async function getLocataire(id: number): Promise<Locataire | undefined> {
  const result = await db.getOne<Locataire>('SELECT * FROM locataires WHERE id = ?', [id]);
  return result || undefined;
}

export async function getLocataireByLogement(logementId: number): Promise<Locataire | undefined> {
  const result = await db.getOne<Locataire>("SELECT * FROM locataires WHERE logement_id = ? AND statut = 'actif'", [logementId]);
  return result || undefined;
}

export async function createLocataire(data: Omit<Locataire, 'id' | 'created_at'>): Promise<number> {
  const created_at = new Date().toISOString();
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');

  await db.exec(
    `INSERT INTO locataires (${keys.join(', ')}, created_at) VALUES (${placeholders}, ?)`,
    [...values, created_at]
  );

  const lastId = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return lastId?.id || 0;
}

export async function updateLocataire(id: number, data: Partial<Locataire>): Promise<void> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(k => `${k} = ?`).join(', ');

  await db.exec(`UPDATE locataires SET ${setClause} WHERE id = ?`, [...values, id]);
}

export async function marquerLocataireParti(id: number): Promise<void> {
  const loc = await getLocataire(id);
  if (!loc) return;

  await db.exec("UPDATE locataires SET statut = 'parti' WHERE id = ?", [id]);

  if (loc.logement_id) {
    const counts = await db.getOne<{ count: number }>(
      "SELECT count(*) as count FROM locataires WHERE logement_id = ? AND statut = 'actif' AND id != ?",
      [loc.logement_id, id]
    );

    if (counts?.count === 0) {
      await db.exec("UPDATE logements SET statut = 'libre' WHERE id = ?", [loc.logement_id]);
    }
  }
}

export async function assignerLogement(locataireId: number, logementId: number): Promise<void> {
  const logement = await db.getOne('SELECT id FROM logements WHERE id = ?', [logementId]);
  if (!logement) throw new Error("Logement introuvable");

  const locataire = await db.getOne('SELECT id FROM locataires WHERE id = ?', [locataireId]);
  if (!locataire) throw new Error("Locataire introuvable");

  const existingActive = await getLocataireByLogement(logementId);
  if (existingActive && existingActive.id !== locataireId) {
    await db.exec("UPDATE locataires SET statut = 'parti' WHERE id = ?", [existingActive.id!]);
  }

  await db.exec("UPDATE locataires SET logement_id = ?, statut = 'actif' WHERE id = ?", [logementId, locataireId]);
  await db.exec("UPDATE logements SET statut = 'occupe' WHERE id = ?", [logementId]);
}

export async function deleteLocataire(id: number): Promise<void> {
  const loc = await getLocataire(id);
  if (!loc) return;

  if (loc.logement_id) {
    const counts = await db.getOne<{ count: number }>(
      "SELECT count(*) as count FROM locataires WHERE logement_id = ? AND statut = 'actif' AND id != ?",
      [loc.logement_id, id]
    );
    if (counts?.count === 0) {
      await db.exec("UPDATE logements SET statut = 'libre' WHERE id = ?", [loc.logement_id]);
    }
  }

  await db.exec('DELETE FROM locataires WHERE id = ?', [id]);
  await db.exec('DELETE FROM contrats WHERE locataire_id = ?', [id]);
}

export async function marquerContratEchu(id: number): Promise<void> {
  const loc = await getLocataire(id);
  if (!loc) return;

  await db.exec("UPDATE locataires SET statut = 'contrat_echu' WHERE id = ?", [id]);

  if (loc.logement_id) {
    const counts = await db.getOne<{ count: number }>(
      "SELECT count(*) as count FROM locataires WHERE logement_id = ? AND statut = 'actif' AND id != ?",
      [loc.logement_id, id]
    );
    if (counts?.count === 0) {
      await db.exec("UPDATE logements SET statut = 'libre' WHERE id = ?", [loc.logement_id]);
    }
  }
}
