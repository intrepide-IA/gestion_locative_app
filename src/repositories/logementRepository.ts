import type { SqlDatabase } from '../db/types';
import { ErreurMetier, exigerMontant, texteOuNull } from '../domain/erreurs';

export type TypeLogement = 'entree_couchee' | 'chambre_salon' | 'autre';

export const LIBELLES_TYPE_LOGEMENT: Record<TypeLogement, string> = {
  entree_couchee: 'Entrée-couchée',
  chambre_salon: 'Chambre-salon',
  autre: 'Autre',
};

export interface Logement {
  id: number;
  reference: string;
  type: TypeLogement;
  description: string | null;
  loyer_indicatif: number;
  toilettes: number;
  archive: 0 | 1;
  cree_le: string;
}

/** Logement avec son occupant actuel (contrat actif), s'il y en a un. */
export interface LogementAvecOccupant extends Logement {
  contrat_id: number | null;
  locataire_id: number | null;
  locataire_nom: string | null;
  locataire_telephone: string | null;
  loyer_contrat: number | null;
  toilettes_contrat: number | null;
}

export interface DonneesLogement {
  reference: string;
  type: TypeLogement;
  description?: string | null;
  loyer_indicatif: number;
  toilettes: number;
}

const SELECT_AVEC_OCCUPANT = `
  SELECT l.*, c.id AS contrat_id, c.locataire_id, t.nom_complet AS locataire_nom, t.telephone AS locataire_telephone,
         c.loyer AS loyer_contrat, c.toilettes AS toilettes_contrat
  FROM logements l
  LEFT JOIN contrats c ON c.logement_id = l.id AND c.statut = 'actif'
  LEFT JOIN locataires t ON t.id = c.locataire_id`;

function valider(donnees: DonneesLogement) {
  const reference = donnees.reference.trim();
  if (!reference) throw new ErreurMetier('La référence du logement est obligatoire.');
  if (!(donnees.type in LIBELLES_TYPE_LOGEMENT)) throw new ErreurMetier('Type de logement inconnu.');
  return {
    reference,
    type: donnees.type,
    description: texteOuNull(donnees.description),
    loyer_indicatif: exigerMontant(donnees.loyer_indicatif, 'Loyer'),
    toilettes: exigerMontant(donnees.toilettes, 'Toilettes'),
  };
}

async function exigerReferenceLibre(db: SqlDatabase, reference: string, saufId?: number) {
  const existant = await db.get<{ id: number }>('SELECT id FROM logements WHERE reference = ? COLLATE NOCASE', [reference]);
  if (existant && existant.id !== saufId) throw new ErreurMetier('Un logement porte déjà cette référence.');
}

/**
 * Logements non archivés (ou tous), triés par référence, avec leur occupant.
 * Les compteurs des clients « électricité seule » ne sont pas des logements : ils sont exclus.
 */
export async function listerLogements(db: SqlDatabase, { inclureArchives = false } = {}): Promise<LogementAvecOccupant[]> {
  return db.all<LogementAvecOccupant>(
    `${SELECT_AVEC_OCCUPANT} WHERE l.usage = 'location' ${inclureArchives ? '' : 'AND l.archive = 0'} ORDER BY l.reference COLLATE NOCASE`
  );
}

export async function getLogement(db: SqlDatabase, id: number): Promise<LogementAvecOccupant | null> {
  return db.get<LogementAvecOccupant>(`${SELECT_AVEC_OCCUPANT} WHERE l.id = ?`, [id]);
}

export async function creerLogement(
  db: SqlDatabase,
  donnees: DonneesLogement,
  maintenant: () => string = () => new Date().toISOString()
): Promise<number> {
  const v = valider(donnees);
  await exigerReferenceLibre(db, v.reference);
  const { lastInsertRowId } = await db.run(
    'INSERT INTO logements (reference, type, description, loyer_indicatif, toilettes, cree_le) VALUES (?, ?, ?, ?, ?, ?)',
    [v.reference, v.type, v.description, v.loyer_indicatif, v.toilettes, maintenant()]
  );
  return lastInsertRowId;
}

/** Modifie la fiche. Ne change pas les contrats en cours : leurs montants sont propres au contrat. */
export async function modifierLogement(db: SqlDatabase, id: number, donnees: DonneesLogement): Promise<void> {
  const v = valider(donnees);
  await exigerReferenceLibre(db, v.reference, id);
  const { changes } = await db.run(
    'UPDATE logements SET reference = ?, type = ?, description = ?, loyer_indicatif = ?, toilettes = ? WHERE id = ?',
    [v.reference, v.type, v.description, v.loyer_indicatif, v.toilettes, id]
  );
  if (changes === 0) throw new ErreurMetier('Logement introuvable.');
}

async function aUnContratActif(db: SqlDatabase, id: number) {
  const row = await db.get<{ n: number }>("SELECT count(*) AS n FROM contrats WHERE logement_id = ? AND statut = 'actif'", [id]);
  return (row?.n ?? 0) > 0;
}

/**
 * Retire un logement de la liste. Un logement sans aucun historique est supprimé ;
 * sinon il est archivé, et tout son historique est conservé.
 */
export async function retirerLogement(db: SqlDatabase, id: number): Promise<'supprime' | 'archive'> {
  return db.transaction(async (tx) => {
    if (await aUnContratActif(tx, id)) {
      throw new ErreurMetier('Ce logement est occupé : terminez d’abord le contrat du locataire.');
    }
    const historique = await tx.get<{ n: number }>('SELECT count(*) AS n FROM contrats WHERE logement_id = ?', [id]);
    if ((historique?.n ?? 0) === 0) {
      await tx.run('DELETE FROM logements WHERE id = ?', [id]);
      return 'supprime';
    }
    await tx.run('UPDATE logements SET archive = 1 WHERE id = ?', [id]);
    return 'archive';
  });
}

export async function desarchiverLogement(db: SqlDatabase, id: number): Promise<void> {
  await db.run('UPDATE logements SET archive = 0 WHERE id = ?', [id]);
}
