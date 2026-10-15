/**
 * Contrat de bail numérique : complète le contrat de location (loyer, caution, dates) avec les clauses
 * du modèle du propriétaire, les signatures et la photo de la pièce d'identité du locataire.
 */
import type { SqlDatabase } from '../db/types';
import { ErreurMetier, texteOuNull } from '../domain/erreurs';
import type { TypeLogement } from './logementRepository';

export interface ClausesBail {
  adresse_logement: string | null;
  chambres: number | null;
  salon: number | null;
  cuisine: number | null;
  salle_de_bain: number | null;
  autres: string | null;
  locataire_adresse: string | null;
  duree_annees: number;
  preavis_mois: number;
  mois_impayes: number;
  fait_a: string | null;
}

export interface Bail extends ClausesBail {
  contrat_id: number;
  /** Faux tant que le bail n'a jamais été enregistré (valeurs proposées par défaut). */
  enregistre: boolean;
  signature_bailleur: string | null;
  signature_locataire: string | null;
  photo_piece: string | null;
  signe_le: string | null;
}

const PIECES: Record<TypeLogement, Pick<ClausesBail, 'chambres' | 'salon' | 'cuisine' | 'salle_de_bain'>> = {
  entree_couchee: { chambres: 1, salon: 0, cuisine: 0, salle_de_bain: 1 },
  chambre_salon: { chambres: 1, salon: 1, cuisine: 0, salle_de_bain: 1 },
  autre: { chambres: null, salon: null, cuisine: null, salle_de_bain: null },
};

/** Ville proposée pour « Fait à » : la dernière partie de l'adresse du propriétaire (« Akpakpa, Cotonou » → Cotonou). */
export function villeDeAdresse(adresse: string | null): string | null {
  const morceaux = adresse?.split(',').map((m) => m.trim()).filter(Boolean) ?? [];
  return morceaux.length ? morceaux[morceaux.length - 1] : null;
}

/** Bail du contrat ; s'il n'existe pas encore, des valeurs par défaut tirées du logement et du profil. */
export async function getBail(db: SqlDatabase, contratId: number): Promise<Bail> {
  const ligne = await db.get<Omit<Bail, 'enregistre'>>(
    `SELECT contrat_id, adresse_logement, chambres, salon, cuisine, salle_de_bain, autres, locataire_adresse, duree_annees,
            preavis_mois, mois_impayes, fait_a, signature_bailleur, signature_locataire, photo_piece, signe_le
     FROM baux WHERE contrat_id = ?`,
    [contratId]
  );
  if (ligne) return { ...ligne, enregistre: true };

  const contexte = await db.get<{ type: TypeLogement; adresse: string | null }>(
    `SELECT l.type, p.adresse FROM contrats c JOIN logements l ON l.id = c.logement_id
     LEFT JOIN proprietaire p ON p.id = 1 WHERE c.id = ?`,
    [contratId]
  );
  if (!contexte) throw new ErreurMetier('Contrat introuvable.');
  return {
    contrat_id: contratId,
    enregistre: false,
    adresse_logement: contexte.adresse,
    ...PIECES[contexte.type],
    autres: null,
    locataire_adresse: null,
    duree_annees: 1,
    preavis_mois: 1,
    mois_impayes: 3,
    fait_a: villeDeAdresse(contexte.adresse),
    signature_bailleur: null,
    signature_locataire: null,
    photo_piece: null,
    signe_le: null,
  };
}

const entierOuNull = (n: number | null) => {
  if (n === null) return null;
  if (!Number.isInteger(n) || n < 0) throw new ErreurMetier('Nombre de pièces invalide.');
  return n;
};

/** Enregistre les clauses ; modifier un bail signé efface les signatures (il faut le signer à nouveau). */
export async function enregistrerClauses(db: SqlDatabase, contratId: number, c: ClausesBail, maintenant = new Date().toISOString()): Promise<void> {
  if (!Number.isInteger(c.duree_annees) || c.duree_annees < 1) throw new ErreurMetier('Durée du bail : au moins 1 an.');
  if (!Number.isInteger(c.preavis_mois) || c.preavis_mois < 0) throw new ErreurMetier('Préavis : nombre de mois invalide.');
  if (!Number.isInteger(c.mois_impayes) || c.mois_impayes < 1) throw new ErreurMetier('Impayés avant résiliation : au moins 1 mois.');
  const valeurs = [
    texteOuNull(c.adresse_logement),
    entierOuNull(c.chambres),
    entierOuNull(c.salon),
    entierOuNull(c.cuisine),
    entierOuNull(c.salle_de_bain),
    texteOuNull(c.autres),
    texteOuNull(c.locataire_adresse),
    c.duree_annees,
    c.preavis_mois,
    c.mois_impayes,
    texteOuNull(c.fait_a),
  ];
  await db.run(
    `INSERT INTO baux (contrat_id, adresse_logement, chambres, salon, cuisine, salle_de_bain, autres, locataire_adresse,
                       duree_annees, preavis_mois, mois_impayes, fait_a, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (contrat_id) DO UPDATE SET
       adresse_logement = excluded.adresse_logement, chambres = excluded.chambres, salon = excluded.salon,
       cuisine = excluded.cuisine, salle_de_bain = excluded.salle_de_bain, autres = excluded.autres,
       locataire_adresse = excluded.locataire_adresse, duree_annees = excluded.duree_annees,
       preavis_mois = excluded.preavis_mois, mois_impayes = excluded.mois_impayes, fait_a = excluded.fait_a,
       signature_bailleur = NULL, signature_locataire = NULL, signe_le = NULL, modifie_le = ?`,
    [contratId, ...valeurs, maintenant, maintenant]
  );
}

export type Signataire = 'bailleur' | 'locataire';

const estImage = (v: string) => /^data:image\/(png|jpeg|svg\+xml);/.test(v);

/** Enregistre une signature (image « data: ») ; le bail est signé quand les deux parties ont signé. */
export async function signerBail(db: SqlDatabase, contratId: number, qui: Signataire, image: string, jour: string): Promise<void> {
  if (!estImage(image)) throw new ErreurMetier('Signature invalide.');
  const bail = await getBail(db, contratId);
  if (!bail.enregistre) throw new ErreurMetier('Enregistrez d’abord les clauses du contrat.');
  const colonne = qui === 'bailleur' ? 'signature_bailleur' : 'signature_locataire';
  await db.run(
    `UPDATE baux SET ${colonne} = ?,
       signe_le = CASE WHEN COALESCE(?, signature_bailleur) IS NOT NULL AND COALESCE(?, signature_locataire) IS NOT NULL THEN ? ELSE NULL END
     WHERE contrat_id = ?`,
    [image, qui === 'bailleur' ? image : null, qui === 'locataire' ? image : null, jour, contratId]
  );
}

/** Photo de la pièce d'identité (JPEG « data: », déjà réduite) ou null pour la retirer. */
export async function definirPhotoPiece(db: SqlDatabase, contratId: number, image: string | null): Promise<void> {
  if (image !== null && !estImage(image)) throw new ErreurMetier('Photo invalide.');
  const bail = await getBail(db, contratId);
  if (!bail.enregistre) throw new ErreurMetier('Enregistrez d’abord les clauses du contrat.');
  await db.run('UPDATE baux SET photo_piece = ? WHERE contrat_id = ?', [image, contratId]);
}
