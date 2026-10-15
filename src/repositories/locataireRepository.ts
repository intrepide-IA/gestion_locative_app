import type { SqlDatabase } from '../db/types';
import { ErreurMetier, exigerDate, exigerMontant, texteOuNull } from '../domain/erreurs';
import { prochainNumero } from './numerotation';
import { enregistrerPaiementDans, situationLocataire } from './loyerRepository';

export type StatutLocataire = 'actif' | 'contrat_termine' | 'parti';

export interface Locataire {
  id: number;
  nom_complet: string;
  telephone: string | null;
  piece_identite: string | null;
  notes: string | null;
  statut: StatutLocataire;
  archive: 0 | 1;
  cree_le: string;
}

export interface Contrat {
  id: number;
  locataire_id: number;
  logement_id: number;
  date_debut: string;
  date_fin: string | null;
  date_sortie: string | null;
  loyer: number;
  toilettes: number;
  caution: number;
  prix_kwh: number;
  releve_initial: number;
  jour_echeance: number;
  statut: 'actif' | 'termine';
  cree_le: string;
  caution_retenue_impayes: number;
  caution_retenue_reparations: number;
  motif_retenue: string | null;
  caution_rendue: number;
}

/** Locataire avec son contrat le plus récent (actif de préférence) et le logement associé. */
export interface LocataireAvecContrat extends Locataire {
  contrat_id: number | null;
  contrat_statut: 'actif' | 'termine' | null;
  logement_id: number | null;
  logement_reference: string | null;
  loyer: number | null;
  toilettes: number | null;
  date_debut: string | null;
  date_sortie: string | null;
}

export interface FicheLocataire {
  nom_complet: string;
  telephone?: string | null;
  piece_identite?: string | null;
  notes?: string | null;
}

export interface ConditionsContrat {
  date_debut: string;
  date_fin?: string | null;
  loyer: number;
  toilettes: number;
  caution: number;
  prix_kwh: number;
  releve_initial: number;
  jour_echeance: number;
}

const SELECT_AVEC_CONTRAT = `
  SELECT t.*, c.id AS contrat_id, c.statut AS contrat_statut, c.logement_id, l.reference AS logement_reference,
         c.loyer, c.toilettes, c.date_debut, c.date_sortie
  FROM locataires t
  LEFT JOIN contrats c ON c.id = (
    SELECT id FROM contrats WHERE locataire_id = t.id ORDER BY statut = 'actif' DESC, date_debut DESC, id DESC LIMIT 1
  )
  LEFT JOIN logements l ON l.id = c.logement_id`;

function validerFiche(fiche: FicheLocataire) {
  const nom = fiche.nom_complet.trim();
  if (!nom) throw new ErreurMetier('Le nom du locataire est obligatoire.');
  return {
    nom_complet: nom,
    telephone: texteOuNull(fiche.telephone),
    piece_identite: texteOuNull(fiche.piece_identite),
    notes: texteOuNull(fiche.notes),
  };
}

function validerConditions(c: ConditionsContrat) {
  const date_debut = exigerDate(c.date_debut, 'Date d’entrée');
  const date_fin = c.date_fin ? exigerDate(c.date_fin, 'Date de fin') : null;
  if (date_fin && date_fin < date_debut) throw new ErreurMetier('La date de fin précède la date d’entrée.');
  if (!Number.isInteger(c.jour_echeance) || c.jour_echeance < 1 || c.jour_echeance > 28) {
    throw new ErreurMetier('Le jour d’échéance doit être compris entre 1 et 28.');
  }
  if (!Number.isFinite(c.releve_initial) || c.releve_initial < 0) {
    throw new ErreurMetier('Relevé initial du compteur invalide.');
  }
  return {
    date_debut,
    date_fin,
    loyer: exigerMontant(c.loyer, 'Loyer'),
    toilettes: exigerMontant(c.toilettes, 'Toilettes'),
    caution: exigerMontant(c.caution, 'Caution'),
    prix_kwh: exigerMontant(c.prix_kwh, 'Prix du kWh', { strictementPositif: true }),
    releve_initial: c.releve_initial,
    jour_echeance: c.jour_echeance,
  };
}

/** Locataires non archivés : actifs d'abord, puis par nom. */
export async function listerLocataires(db: SqlDatabase): Promise<LocataireAvecContrat[]> {
  return db.all<LocataireAvecContrat>(
    `${SELECT_AVEC_CONTRAT} WHERE t.archive = 0 ORDER BY t.statut = 'actif' DESC, t.nom_complet COLLATE NOCASE`
  );
}

export async function getLocataire(db: SqlDatabase, id: number): Promise<LocataireAvecContrat | null> {
  return db.get<LocataireAvecContrat>(`${SELECT_AVEC_CONTRAT} WHERE t.id = ?`, [id]);
}

export async function contratsDuLocataire(db: SqlDatabase, locataireId: number): Promise<(Contrat & { logement_reference: string })[]> {
  return db.all(
    `SELECT c.*, l.reference AS logement_reference FROM contrats c JOIN logements l ON l.id = c.logement_id
     WHERE c.locataire_id = ? ORDER BY c.date_debut DESC, c.id DESC`,
    [locataireId]
  );
}

export async function getContratActif(db: SqlDatabase, locataireId: number): Promise<Contrat | null> {
  return db.get<Contrat>("SELECT * FROM contrats WHERE locataire_id = ? AND statut = 'actif'", [locataireId]);
}

/**
 * Entrée d'un locataire : fiche + contrat sur un logement libre, en une seule transaction.
 * Échoue sans rien écrire si le logement est occupé, archivé ou introuvable.
 */
export async function entrerLocataire(
  db: SqlDatabase,
  fiche: FicheLocataire,
  logementId: number,
  conditions: ConditionsContrat,
  maintenant: () => string = () => new Date().toISOString()
): Promise<{ locataireId: number; contratId: number }> {
  const f = validerFiche(fiche);
  const c = validerConditions(conditions);
  return db.transaction(async (tx) => {
    const logement = await tx.get<{ archive: number }>('SELECT archive FROM logements WHERE id = ?', [logementId]);
    if (!logement) throw new ErreurMetier('Logement introuvable.');
    if (logement.archive) throw new ErreurMetier('Ce logement est archivé.');
    const occupe = await tx.get<{ n: number }>(
      "SELECT count(*) AS n FROM contrats WHERE logement_id = ? AND statut = 'actif'",
      [logementId]
    );
    if ((occupe?.n ?? 0) > 0) throw new ErreurMetier('Ce logement est déjà occupé.');

    const now = maintenant();
    const { lastInsertRowId: locataireId } = await tx.run(
      "INSERT INTO locataires (nom_complet, telephone, piece_identite, notes, statut, cree_le) VALUES (?, ?, ?, ?, 'actif', ?)",
      [f.nom_complet, f.telephone, f.piece_identite, f.notes, now]
    );
    const { lastInsertRowId: contratId } = await tx.run(
      `INSERT INTO contrats (locataire_id, logement_id, date_debut, date_fin, loyer, toilettes, caution, prix_kwh,
         releve_initial, jour_echeance, statut, cree_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif', ?)`,
      [locataireId, logementId, c.date_debut, c.date_fin, c.loyer, c.toilettes, c.caution, c.prix_kwh, c.releve_initial, c.jour_echeance, now]
    );
    // La caution reçue entre en trésorerie, distinguée des loyers (catégorie « Cautions reçues »).
    if (c.caution > 0) {
      const categorie = await tx.get<{ id: number }>("SELECT id FROM categories_financieres WHERE code = 'caution'");
      await tx.run(
        `INSERT INTO mouvements_financiers (date_operation, sens, montant, categorie_id, description, logement_id, origine_type, origine_id, statut, cree_le)
         VALUES (?, 'entree', ?, ?, ?, ?, 'caution', ?, 'valide', ?)`,
        [c.date_debut, c.caution, categorie!.id, `Caution de ${f.nom_complet}`, logementId, contratId, now]
      );
    }
    return { locataireId, contratId };
  });
}

export async function modifierFicheLocataire(db: SqlDatabase, id: number, fiche: FicheLocataire): Promise<void> {
  const f = validerFiche(fiche);
  const { changes } = await db.run(
    'UPDATE locataires SET nom_complet = ?, telephone = ?, piece_identite = ?, notes = ? WHERE id = ?',
    [f.nom_complet, f.telephone, f.piece_identite, f.notes, id]
  );
  if (changes === 0) throw new ErreurMetier('Locataire introuvable.');
}

/**
 * Modifie les conditions d'un contrat actif. Les échéances déjà créées gardent leur montant
 * (elles sont figées à leur création) : seules les suivantes utiliseront le nouveau loyer.
 */
export async function modifierConditionsContrat(
  db: SqlDatabase,
  contratId: number,
  conditions: Omit<ConditionsContrat, 'date_debut' | 'releve_initial'>
): Promise<void> {
  await db.transaction(async (tx) => {
    const contrat = await tx.get<Contrat>('SELECT * FROM contrats WHERE id = ?', [contratId]);
    if (!contrat) throw new ErreurMetier('Contrat introuvable.');
    if (contrat.statut !== 'actif') throw new ErreurMetier('Ce contrat est terminé.');
    const c = validerConditions({ ...conditions, date_debut: contrat.date_debut, releve_initial: contrat.releve_initial });
    await tx.run(
      'UPDATE contrats SET date_fin = ?, loyer = ?, toilettes = ?, caution = ?, prix_kwh = ?, jour_echeance = ? WHERE id = ?',
      [c.date_fin, c.loyer, c.toilettes, c.caution, c.prix_kwh, c.jour_echeance, contratId]
    );
  });
}

/** Décompte de la caution au départ : retenues (impayés, réparations) et somme rendue. */
export interface SoldeCaution {
  /** Part de la caution qui règle les loyers impayés (sans nouvelle entrée en trésorerie). */
  retenueImpayes?: number;
  /** Part gardée pour réparer les dégradations. */
  retenueReparations?: number;
  motifReparations?: string | null;
  /** Part rendue au locataire (sortie de trésorerie). */
  cautionRendue?: number;
}

/** Proposition de décompte : impayés d'abord, puis réparations, le reste est rendu. */
export function proposerSoldeCaution(caution: number, dette: number, reparations: number) {
  const retenueImpayes = Math.min(caution, Math.max(0, dette));
  const retenueReparations = Math.min(caution - retenueImpayes, Math.max(0, reparations));
  const cautionRendue = caution - retenueImpayes - retenueReparations;
  return { retenueImpayes, retenueReparations, cautionRendue, resteDu: Math.max(0, dette - retenueImpayes) };
}

/**
 * Départ du locataire : le contrat est terminé à la date de sortie, le logement redevient libre.
 * La caution n'est jamais comptée comme un loyer : au départ, on en retient les impayés et les
 * réparations, on rend le reste. Rien n'est supprimé : l'historique est conservé.
 */
export async function terminerContrat(
  db: SqlDatabase,
  contratId: number,
  dateSortie: string,
  /** Décompte de la caution (ou, par compatibilité, la seule somme rendue). */
  solde: SoldeCaution | number = 0,
  maintenant = new Date().toISOString()
): Promise<void> {
  const sortie = exigerDate(dateSortie, 'Date de sortie');
  const d: SoldeCaution = typeof solde === 'number' ? { cautionRendue: solde } : solde;
  const retenueImpayes = exigerMontant(d.retenueImpayes ?? 0, 'Retenue pour impayés');
  const retenueReparations = exigerMontant(d.retenueReparations ?? 0, 'Retenue pour réparations');
  const cautionRestituee = exigerMontant(d.cautionRendue ?? 0, 'Caution restituée');
  if (retenueReparations > 0 && !texteOuNull(d.motifReparations)) throw new ErreurMetier('Précisez les réparations retenues sur la caution.');
  await db.transaction(async (tx) => {
    const contrat = await tx.get<Contrat>('SELECT * FROM contrats WHERE id = ?', [contratId]);
    if (!contrat) throw new ErreurMetier('Contrat introuvable.');
    if (contrat.statut !== 'actif') throw new ErreurMetier('Ce contrat est déjà terminé.');
    if (sortie < contrat.date_debut) throw new ErreurMetier('La date de sortie précède la date d’entrée.');
    if (retenueImpayes + retenueReparations + cautionRestituee > contrat.caution) {
      throw new ErreurMetier(`Retenues et somme rendue dépassent la caution reçue (${contrat.caution} FCFA).`);
    }
    if (retenueImpayes > 0) {
      const dette = await situationLocataire(tx, contrat.locataire_id);
      if (retenueImpayes > dette.dette) throw new ErreurMetier('La retenue pour impayés dépasse ce que le locataire doit.');
      await enregistrerPaiementDans(
        tx,
        { locataireId: contrat.locataire_id, montant: retenueImpayes, mode: 'autre', datePaiement: sortie, note: 'Retenue sur la caution' },
        sortie,
        retenueImpayes,
        maintenant,
        { tresorerie: false }
      );
    }
    await tx.run(
      `UPDATE contrats SET statut = 'termine', date_sortie = ?, caution_retenue_impayes = ?, caution_retenue_reparations = ?,
         motif_retenue = ?, caution_rendue = ? WHERE id = ?`,
      [sortie, retenueImpayes, retenueReparations, texteOuNull(d.motifReparations), cautionRestituee, contratId]
    );
    await tx.run("UPDATE locataires SET statut = 'parti' WHERE id = ?", [contrat.locataire_id]);
    if (cautionRestituee > 0) {
      const categorie = await tx.get<{ id: number }>("SELECT id FROM categories_financieres WHERE code = 'restitution_caution'");
      const reference = await prochainNumero(tx, 'DEP', Number(sortie.slice(0, 4)));
      await tx.run(
        `INSERT INTO mouvements_financiers (reference, date_operation, sens, montant, categorie_id, description, logement_id, statut, cree_le)
         VALUES (?, ?, 'sortie', ?, ?, 'Restitution de caution', ?, 'valide', ?)`,
        [reference, sortie, cautionRestituee, categorie!.id, contrat.logement_id, maintenant]
      );
    }
  });
}

/**
 * Retire un locataire de la liste. Une fiche sans contrat est supprimée ; une fiche avec historique
 * est seulement archivée. Refusé tant qu'un contrat est actif.
 */
export async function retirerLocataire(db: SqlDatabase, id: number): Promise<'supprime' | 'archive'> {
  return db.transaction(async (tx) => {
    const actif = await tx.get<{ n: number }>(
      "SELECT count(*) AS n FROM contrats WHERE locataire_id = ? AND statut = 'actif'",
      [id]
    );
    if ((actif?.n ?? 0) > 0) throw new ErreurMetier('Ce locataire a un contrat en cours : enregistrez d’abord son départ.');
    const contrats = await tx.get<{ n: number }>('SELECT count(*) AS n FROM contrats WHERE locataire_id = ?', [id]);
    if ((contrats?.n ?? 0) === 0) {
      await tx.run('DELETE FROM locataires WHERE id = ?', [id]);
      return 'supprime';
    }
    await tx.run('UPDATE locataires SET archive = 1 WHERE id = ?', [id]);
    return 'archive';
  });
}
