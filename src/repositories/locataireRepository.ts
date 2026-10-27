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
  caution_electricite: number;
  caution_eau: number;
  prix_kwh: number;
  releve_initial: number;
  jour_echeance: number;
  statut: 'actif' | 'termine';
  cree_le: string;
  caution_retenue_impayes: number;
  caution_retenue_reparations: number;
  motif_retenue: string | null;
  caution_rendue: number;
  caution_retenue_charges: number;
  motif_retenue_charges: string | null;
  /** « bail » : location ; « electricite » : client qui achète seulement l'électricité. */
  type: 'bail' | 'electricite';
}

/** Fonds de garantie total d'un contrat : caution de loyer + électricité + eau. */
export const cautionTotale = (c: Pick<Contrat, 'caution' | 'caution_electricite' | 'caution_eau'>) =>
  c.caution + (c.caution_electricite ?? 0) + (c.caution_eau ?? 0);

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
  contrat_type: 'bail' | 'electricite';
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
  /** Caution de loyer. */
  caution: number;
  /** Caution pour l'électricité (facultative). */
  caution_electricite?: number;
  /** Caution pour l'eau (facultative). */
  caution_eau?: number;
  prix_kwh: number;
  releve_initial: number;
  jour_echeance: number;
}

const SELECT_AVEC_CONTRAT = `
  SELECT t.*, c.id AS contrat_id, c.statut AS contrat_statut, c.logement_id, l.reference AS logement_reference,
         c.loyer, c.toilettes, c.date_debut, c.date_sortie, COALESCE(c.type, 'bail') AS contrat_type
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
    caution_electricite: exigerMontant(c.caution_electricite ?? 0, 'Caution électricité'),
    caution_eau: exigerMontant(c.caution_eau ?? 0, 'Caution eau'),
    prix_kwh: exigerMontant(c.prix_kwh, 'Prix du kWh', { strictementPositif: true }),
    releve_initial: c.releve_initial,
    jour_echeance: c.jour_echeance,
  };
}

/** Locataires non archivés : actifs d'abord, puis par nom. */
export async function listerLocataires(db: SqlDatabase): Promise<LocataireAvecContrat[]> {
  return db.all<LocataireAvecContrat>(
    // Les clients « électricité seule » sont gérés dans l'écran Électricité, pas parmi les locataires.
    `${SELECT_AVEC_CONTRAT} WHERE t.archive = 0 AND COALESCE(c.type, 'bail') = 'bail' ORDER BY t.statut = 'actif' DESC, t.nom_complet COLLATE NOCASE`
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
    const logement = await tx.get<{ archive: number; usage: string }>('SELECT archive, usage FROM logements WHERE id = ?', [logementId]);
    if (!logement || logement.usage !== 'location') throw new ErreurMetier('Logement introuvable.');
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
      `INSERT INTO contrats (locataire_id, logement_id, date_debut, date_fin, loyer, toilettes, caution, caution_electricite, caution_eau,
         prix_kwh, releve_initial, jour_echeance, statut, cree_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif', ?)`,
      [
        locataireId,
        logementId,
        c.date_debut,
        c.date_fin,
        c.loyer,
        c.toilettes,
        c.caution,
        c.caution_electricite,
        c.caution_eau,
        c.prix_kwh,
        c.releve_initial,
        c.jour_echeance,
        now,
      ]
    );
    // Les cautions reçues entrent en trésorerie, distinguées des loyers (catégorie « Cautions reçues »).
    await enregistrerCautionEnTresorerie(tx, contratId, logementId, f.nom_complet, c, c.date_debut, now);
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
      `UPDATE contrats SET date_fin = ?, loyer = ?, toilettes = ?, caution = ?, caution_electricite = ?, caution_eau = ?, prix_kwh = ?,
         jour_echeance = ? WHERE id = ?`,
      [c.date_fin, c.loyer, c.toilettes, c.caution, c.caution_electricite, c.caution_eau, c.prix_kwh, c.jour_echeance, contratId]
    );
    // La trésorerie suit la caution réellement reçue.
    const nom = await tx.get<{ nom_complet: string }>('SELECT nom_complet FROM locataires WHERE id = ?', [contrat.locataire_id]);
    await enregistrerCautionEnTresorerie(tx, contratId, contrat.logement_id, nom?.nom_complet ?? '', c, contrat.date_debut, new Date().toISOString());
  });
}

function libelleCaution(nom: string, c: { caution: number; caution_electricite: number; caution_eau: number }): string {
  const parts = [
    c.caution ? `loyer ${c.caution}` : '',
    c.caution_electricite ? `électricité ${c.caution_electricite}` : '',
    c.caution_eau ? `eau ${c.caution_eau}` : '',
  ].filter(Boolean);
  return parts.length > 1 ? `Caution de ${nom} (${parts.join(', ')} FCFA)` : `Caution de ${nom}`;
}

/** Une seule entrée « Cautions reçues » par contrat, au total des cautions ; créée, ajustée ou annulée. */
async function enregistrerCautionEnTresorerie(
  tx: SqlDatabase,
  contratId: number,
  logementId: number,
  nom: string,
  c: { caution: number; caution_electricite: number; caution_eau: number },
  date: string,
  maintenant: string
): Promise<void> {
  const total = cautionTotale(c);
  const existant = await tx.get<{ id: number }>("SELECT id FROM mouvements_financiers WHERE origine_type = 'caution' AND origine_id = ?", [contratId]);
  if (existant) {
    await tx.run(
      "UPDATE mouvements_financiers SET montant = ?, description = ?, statut = CASE WHEN ? > 0 THEN 'valide' ELSE 'annule' END WHERE id = ?",
      [Math.max(total, 1), libelleCaution(nom, c), total, existant.id]
    );
    return;
  }
  if (total <= 0) return;
  const categorie = await tx.get<{ id: number }>("SELECT id FROM categories_financieres WHERE code = 'caution'");
  await tx.run(
    `INSERT INTO mouvements_financiers (date_operation, sens, montant, categorie_id, description, logement_id, origine_type, origine_id, statut, cree_le)
     VALUES (?, 'entree', ?, ?, ?, ?, 'caution', ?, 'valide', ?)`,
    [date, total, categorie!.id, libelleCaution(nom, c), logementId, contratId, maintenant]
  );
}

/** Décompte de la caution au départ : retenues (impayés, charges, réparations) et somme rendue. */
export interface SoldeCaution {
  /** Part de la caution qui règle les loyers impayés (sans nouvelle entrée en trésorerie). */
  retenueImpayes?: number;
  /** Part gardée pour les charges impayées : électricité consommée sans crédit, eau… */
  retenueCharges?: number;
  motifCharges?: string | null;
  /** Part gardée pour réparer les dégradations. */
  retenueReparations?: number;
  motifReparations?: string | null;
  /** Part rendue au locataire (sortie de trésorerie). */
  cautionRendue?: number;
}

/** Proposition de décompte : loyers impayés, puis charges (électricité, eau), puis réparations ; le reste est rendu. */
export function proposerSoldeCaution(caution: number, dette: number, reparations: number, charges = 0) {
  const retenueImpayes = Math.min(caution, Math.max(0, dette));
  const retenueCharges = Math.min(caution - retenueImpayes, Math.max(0, charges));
  const retenueReparations = Math.min(caution - retenueImpayes - retenueCharges, Math.max(0, reparations));
  const cautionRendue = caution - retenueImpayes - retenueCharges - retenueReparations;
  const resteDu = Math.max(0, dette - retenueImpayes) + Math.max(0, charges - retenueCharges) + Math.max(0, reparations - retenueReparations);
  return { retenueImpayes, retenueCharges, retenueReparations, cautionRendue, resteDu };
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
  const retenueCharges = exigerMontant(d.retenueCharges ?? 0, 'Retenue pour charges');
  if (retenueCharges > 0 && !texteOuNull(d.motifCharges)) throw new ErreurMetier('Précisez les charges retenues sur la caution (électricité, eau…).');
  const cautionRestituee = exigerMontant(d.cautionRendue ?? 0, 'Caution restituée');
  if (retenueReparations > 0 && !texteOuNull(d.motifReparations)) throw new ErreurMetier('Précisez les réparations retenues sur la caution.');
  await db.transaction(async (tx) => {
    const contrat = await tx.get<Contrat>('SELECT * FROM contrats WHERE id = ?', [contratId]);
    if (!contrat) throw new ErreurMetier('Contrat introuvable.');
    if (contrat.statut !== 'actif') throw new ErreurMetier('Ce contrat est déjà terminé.');
    if (sortie < contrat.date_debut) throw new ErreurMetier('La date de sortie précède la date d’entrée.');
    const fonds = cautionTotale(contrat);
    if (retenueImpayes + retenueCharges + retenueReparations + cautionRestituee > fonds) {
      throw new ErreurMetier(`Retenues et somme rendue dépassent les cautions reçues (${fonds} FCFA).`);
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
         motif_retenue = ?, caution_rendue = ?, caution_retenue_charges = ?, motif_retenue_charges = ? WHERE id = ?`,
      [
        sortie,
        retenueImpayes,
        retenueReparations,
        texteOuNull(d.motifReparations),
        cautionRestituee,
        retenueCharges,
        texteOuNull(d.motifCharges),
        contratId,
      ]
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
