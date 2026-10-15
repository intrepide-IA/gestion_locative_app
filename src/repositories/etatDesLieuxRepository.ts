/**
 * État des lieux d'entrée et de sortie, d'après la fiche du propriétaire : chaque élément est noté
 * bon / moyen / mauvais, puis le document est signé par les deux parties.
 */
import type { SqlDatabase } from '../db/types';
import { ErreurMetier, exigerDate, texteOuNull } from '../domain/erreurs';

export type TypeEtat = 'entree' | 'sortie';
export type Note = 'bon' | 'moyen' | 'mauvais';

export interface LigneEtat {
  element: string;
  etat: Note | null;
}

/** Éléments de la fiche du propriétaire, dans son ordre. */
export const ELEMENTS_ETAT = [
  'Mur',
  'Plafond',
  'Sol / Carrelage',
  'Porte',
  'Serrure',
  'Fenêtre',
  'Vitres',
  'Rideaux / Stores',
  'Électricité (prises, interrupteurs)',
  'Ampoules',
  'Plomberie (robinets)',
  'Douche / Baignoire',
  'Lavabo',
  'WC',
  'Évier cuisine',
  'Placards',
  'Climatiseur / Ventilateur',
  'Compteur eau',
  'Compteur électricité',
  'Clôture / Portail',
  'Cour / Balcon',
] as const;

export const LIBELLES_NOTE: Record<Note, string> = { bon: 'Bon', moyen: 'Moyen', mauvais: 'Mauvais' };
const RANG: Record<Note, number> = { bon: 0, moyen: 1, mauvais: 2 };

export interface EtatDesLieux {
  contrat_id: number;
  type: TypeEtat;
  enregistre: boolean;
  date_etat: string;
  elements: LigneEtat[];
  observations: string | null;
  signature_bailleur: string | null;
  signature_locataire: string | null;
  signe_le: string | null;
}

const estNote = (v: unknown): v is Note => v === 'bon' || v === 'moyen' || v === 'mauvais';

function lireElements(json: string): LigneEtat[] {
  try {
    const brut = JSON.parse(json) as unknown;
    if (!Array.isArray(brut)) return [];
    return brut
      .filter((l): l is { element: string; etat?: unknown } => typeof l === 'object' && l !== null && typeof l.element === 'string')
      .map((l) => ({ element: l.element, etat: estNote(l.etat) ? l.etat : null }));
  } catch {
    return [];
  }
}

export async function getEtatDesLieux(db: SqlDatabase, contratId: number, type: TypeEtat, jour: string): Promise<EtatDesLieux> {
  const ligne = await db.get<Omit<EtatDesLieux, 'enregistre' | 'elements'> & { elements: string }>(
    `SELECT contrat_id, type, date_etat, elements, observations, signature_bailleur, signature_locataire, signe_le
     FROM etats_des_lieux WHERE contrat_id = ? AND type = ?`,
    [contratId, type]
  );
  if (ligne) return { ...ligne, enregistre: true, elements: lireElements(ligne.elements) };
  const contrat = await db.get<{ date_debut: string }>('SELECT date_debut FROM contrats WHERE id = ?', [contratId]);
  if (!contrat) throw new ErreurMetier('Contrat introuvable.');
  return {
    contrat_id: contratId,
    type,
    enregistre: false,
    date_etat: type === 'entree' ? contrat.date_debut : jour,
    elements: ELEMENTS_ETAT.map((element) => ({ element, etat: null })),
    observations: null,
    signature_bailleur: null,
    signature_locataire: null,
    signe_le: null,
  };
}

/** Enregistre la grille ; toute modification efface les signatures (il faut signer à nouveau). */
export async function enregistrerEtatDesLieux(
  db: SqlDatabase,
  contratId: number,
  type: TypeEtat,
  saisie: { date_etat: string; elements: LigneEtat[]; observations: string | null },
  maintenant = new Date().toISOString()
): Promise<void> {
  exigerDate(saisie.date_etat, 'Date de l’état des lieux');
  const elements = saisie.elements
    .map((l) => ({ element: l.element.trim(), etat: estNote(l.etat) ? l.etat : null }))
    .filter((l) => l.element.length > 0);
  if (!elements.some((l) => l.etat !== null)) throw new ErreurMetier('Notez au moins un élément.');
  await db.run(
    `INSERT INTO etats_des_lieux (contrat_id, type, date_etat, elements, observations, cree_le) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (contrat_id, type) DO UPDATE SET date_etat = excluded.date_etat, elements = excluded.elements,
       observations = excluded.observations, signature_bailleur = NULL, signature_locataire = NULL, signe_le = NULL, modifie_le = ?`,
    [contratId, type, saisie.date_etat, JSON.stringify(elements), texteOuNull(saisie.observations), maintenant, maintenant]
  );
}

export async function signerEtatDesLieux(
  db: SqlDatabase,
  contratId: number,
  type: TypeEtat,
  qui: 'bailleur' | 'locataire',
  image: string,
  jour: string
): Promise<void> {
  if (!/^data:image\/(png|jpeg|svg\+xml);/.test(image)) throw new ErreurMetier('Signature invalide.');
  const existe = await db.get('SELECT 1 AS un FROM etats_des_lieux WHERE contrat_id = ? AND type = ?', [contratId, type]);
  if (!existe) throw new ErreurMetier('Enregistrez d’abord l’état des lieux.');
  const colonne = qui === 'bailleur' ? 'signature_bailleur' : 'signature_locataire';
  await db.run(
    `UPDATE etats_des_lieux SET ${colonne} = ?,
       signe_le = CASE WHEN COALESCE(?, signature_bailleur) IS NOT NULL AND COALESCE(?, signature_locataire) IS NOT NULL THEN ? ELSE NULL END
     WHERE contrat_id = ? AND type = ?`,
    [image, qui === 'bailleur' ? image : null, qui === 'locataire' ? image : null, jour, contratId, type]
  );
}

/** Éléments plus abîmés à la sortie qu'à l'entrée (base d'une retenue éventuelle sur la caution). */
export function degradations(entree: LigneEtat[], sortie: LigneEtat[]): { element: string; avant: Note; apres: Note }[] {
  const avant = new Map(entree.map((l) => [l.element, l.etat]));
  const resultat: { element: string; avant: Note; apres: Note }[] = [];
  for (const l of sortie) {
    const a = avant.get(l.element);
    if (a && l.etat && RANG[l.etat] > RANG[a]) resultat.push({ element: l.element, avant: a, apres: l.etat });
  }
  return resultat;
}
