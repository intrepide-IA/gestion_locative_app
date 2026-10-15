/**
 * Échéances, paiements, factures et reçus de loyer.
 * Règles : montant dû figé à la création de l'échéance ; paiements jamais supprimés (annulation tracée) ;
 * la part non affectée d'un paiement forme un crédit, affecté ensuite aux échéances suivantes.
 */
import type { SqlDatabase } from '../db/types';
import { dateEcheance, etatEcheance, moisEntre, type EtatEcheance } from '../domain/echeances';
import { ErreurMetier, exigerDate, exigerMontant, texteOuNull } from '../domain/erreurs';
import { prochainNumero } from './numerotation';

export type ModePaiement = 'especes' | 'mobile_money' | 'virement' | 'autre';

export const LIBELLES_MODE: Record<ModePaiement, string> = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  virement: 'Virement',
  autre: 'Autre',
};

export interface EcheanceDetaillee extends EtatEcheance {
  id: number;
  contrat_id: number;
  annee: number;
  mois: number;
  loyer: number;
  toilettes: number;
  montant_du: number;
  paye: number;
  date_echeance: string;
  locataire_id: number;
  locataire_nom: string;
  locataire_telephone: string | null;
  logement_reference: string;
  facture_numero: string | null;
}

export interface PaiementDetaille {
  id: number;
  locataire_id: number;
  date_paiement: string;
  montant: number;
  mode: ModePaiement;
  reference: string | null;
  note: string | null;
  annule_le: string | null;
  motif_annulation: string | null;
  recu_numero: string | null;
  affecte: number;
}

export interface SituationLocataire {
  /** Total dû sur les échéances créées. */
  du: number;
  /** Total affecté aux échéances (paiements non annulés). */
  regle: number;
  /** Reste à payer (dette). */
  dette: number;
  /** Montant reçu non encore affecté (trop-perçu). */
  credit: number;
}

const PAYE_PAR_ECHEANCE = `
  SELECT a.echeance_id, SUM(a.montant) AS paye
  FROM affectations a JOIN paiements p ON p.id = a.paiement_id
  WHERE p.annule_le IS NULL
  GROUP BY a.echeance_id`;

const SELECT_ECHEANCES = `
  SELECT e.*, COALESCE(pe.paye, 0) AS paye, c.locataire_id, t.nom_complet AS locataire_nom,
         t.telephone AS locataire_telephone, l.reference AS logement_reference,
         (SELECT numero FROM factures f WHERE f.echeance_id = e.id AND f.statut = 'emise' ORDER BY f.id DESC LIMIT 1) AS facture_numero
  FROM echeances e
  JOIN contrats c ON c.id = e.contrat_id
  JOIN locataires t ON t.id = c.locataire_id
  JOIN logements l ON l.id = c.logement_id
  LEFT JOIN (${PAYE_PAR_ECHEANCE}) pe ON pe.echeance_id = e.id`;

type LigneEcheance = Omit<EcheanceDetaillee, keyof EtatEcheance>;

const avecEtat = (aujourdhui: string) => (e: LigneEcheance): EcheanceDetaillee => ({
  ...e,
  ...etatEcheance(e.montant_du, e.paye, e.date_echeance, aujourdhui),
});

/* ---------- Génération des échéances ---------- */

/**
 * Crée les échéances manquantes de tous les contrats jusqu'au mois de `aujourdhui` (inclus),
 * et jusqu'au mois de sortie pour un contrat terminé. Idempotent : relancer ne crée aucun doublon.
 * Applique ensuite les crédits disponibles aux nouvelles échéances.
 */
export async function genererEcheances(db: SqlDatabase, aujourdhui: string, maintenant = new Date().toISOString()): Promise<number> {
  return db.transaction(async (tx) => {
    const contrats = await tx.all<{
      id: number;
      locataire_id: number;
      date_debut: string;
      date_sortie: string | null;
      statut: string;
      loyer: number;
      toilettes: number;
      jour_echeance: number;
    }>('SELECT id, locataire_id, date_debut, date_sortie, statut, loyer, toilettes, jour_echeance FROM contrats');

    let creees = 0;
    const locatairesConcernes = new Set<number>();
    for (const c of contrats) {
      const fin = c.statut === 'termine' && c.date_sortie ? (c.date_sortie < aujourdhui ? c.date_sortie : aujourdhui) : aujourdhui;
      if (fin < c.date_debut) continue;
      for (const { annee, mois } of moisEntre(c.date_debut, fin)) {
        const { changes } = await tx.run(
          `INSERT OR IGNORE INTO echeances (contrat_id, annee, mois, loyer, toilettes, montant_du, date_echeance, cree_le)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, annee, mois, c.loyer, c.toilettes, c.loyer + c.toilettes, dateEcheance(annee, mois, c.jour_echeance, c.date_debut), maintenant]
        );
        if (changes > 0) {
          creees += 1;
          locatairesConcernes.add(c.locataire_id);
        }
      }
    }
    for (const id of locatairesConcernes) await appliquerCredits(tx, id, maintenant);
    return creees;
  });
}

/** Affecte la part non utilisée des paiements valides aux échéances impayées, de la plus ancienne à la plus récente. */
async function appliquerCredits(tx: SqlDatabase, locataireId: number, maintenant: string): Promise<void> {
  const paiements = await tx.all<{ id: number; disponible: number }>(
    `SELECT p.id, p.montant - COALESCE((SELECT SUM(montant) FROM affectations WHERE paiement_id = p.id), 0) AS disponible
     FROM paiements p WHERE p.locataire_id = ? AND p.annule_le IS NULL ORDER BY p.date_paiement, p.id`,
    [locataireId]
  );
  for (const p of paiements) {
    if (p.disponible > 0) await affecter(tx, locataireId, p.id, p.disponible, maintenant);
  }
}

/** Répartit `montant` du paiement sur les échéances impayées du locataire ; renvoie ce qui reste non affecté. */
async function affecter(tx: SqlDatabase, locataireId: number, paiementId: number, montant: number, maintenant: string): Promise<number> {
  const impayees = await tx.all<{ id: number; reste: number }>(
    `SELECT e.id, e.montant_du - COALESCE(pe.paye, 0) AS reste
     FROM echeances e JOIN contrats c ON c.id = e.contrat_id
     LEFT JOIN (${PAYE_PAR_ECHEANCE}) pe ON pe.echeance_id = e.id
     WHERE c.locataire_id = ? AND e.montant_du - COALESCE(pe.paye, 0) > 0
     ORDER BY e.annee, e.mois, e.id`,
    [locataireId]
  );
  let disponible = montant;
  for (const e of impayees) {
    if (disponible <= 0) break;
    const part = Math.min(disponible, e.reste);
    await tx.run('INSERT INTO affectations (paiement_id, echeance_id, montant, cree_le) VALUES (?, ?, ?, ?)', [
      paiementId,
      e.id,
      part,
      maintenant,
    ]);
    disponible -= part;
  }
  return disponible;
}

/* ---------- Lecture ---------- */

export async function listerEcheancesDuMois(db: SqlDatabase, annee: number, mois: number, aujourdhui: string): Promise<EcheanceDetaillee[]> {
  const lignes = await db.all<LigneEcheance>(`${SELECT_ECHEANCES} WHERE e.annee = ? AND e.mois = ? ORDER BY l.reference COLLATE NOCASE`, [
    annee,
    mois,
  ]);
  return lignes.map(avecEtat(aujourdhui));
}

export async function echeancesDuLocataire(db: SqlDatabase, locataireId: number, aujourdhui: string): Promise<EcheanceDetaillee[]> {
  const lignes = await db.all<LigneEcheance>(`${SELECT_ECHEANCES} WHERE c.locataire_id = ? ORDER BY e.annee DESC, e.mois DESC`, [
    locataireId,
  ]);
  return lignes.map(avecEtat(aujourdhui));
}

export async function getEcheance(db: SqlDatabase, id: number, aujourdhui: string): Promise<EcheanceDetaillee | null> {
  const ligne = await db.get<LigneEcheance>(`${SELECT_ECHEANCES} WHERE e.id = ?`, [id]);
  return ligne ? avecEtat(aujourdhui)(ligne) : null;
}

export async function paiementsDuLocataire(db: SqlDatabase, locataireId: number): Promise<PaiementDetaille[]> {
  return db.all<PaiementDetaille>(
    `SELECT p.*, r.numero AS recu_numero, COALESCE((SELECT SUM(montant) FROM affectations WHERE paiement_id = p.id), 0) AS affecte
     FROM paiements p LEFT JOIN recus r ON r.paiement_id = p.id
     WHERE p.locataire_id = ? ORDER BY p.date_paiement DESC, p.id DESC`,
    [locataireId]
  );
}

export async function paiementsDeLEcheance(db: SqlDatabase, echeanceId: number): Promise<(PaiementDetaille & { part: number })[]> {
  return db.all(
    `SELECT p.*, r.numero AS recu_numero, a.montant AS part, a.montant AS affecte
     FROM affectations a JOIN paiements p ON p.id = a.paiement_id LEFT JOIN recus r ON r.paiement_id = p.id
     WHERE a.echeance_id = ? ORDER BY p.date_paiement, p.id`,
    [echeanceId]
  );
}

export async function situationLocataire(db: SqlDatabase, locataireId: number): Promise<SituationLocataire> {
  const row = await db.get<{ du: number; regle: number; recu: number }>(
    `SELECT
       (SELECT COALESCE(SUM(e.montant_du), 0) FROM echeances e JOIN contrats c ON c.id = e.contrat_id WHERE c.locataire_id = ?) AS du,
       (SELECT COALESCE(SUM(a.montant), 0) FROM affectations a JOIN paiements p ON p.id = a.paiement_id
          WHERE p.locataire_id = ? AND p.annule_le IS NULL) AS regle,
       (SELECT COALESCE(SUM(montant), 0) FROM paiements WHERE locataire_id = ? AND annule_le IS NULL) AS recu`,
    [locataireId, locataireId, locataireId]
  );
  const du = row?.du ?? 0;
  const regle = row?.regle ?? 0;
  return { du, regle, dette: du - regle, credit: (row?.recu ?? 0) - regle };
}

export interface SyntheseMois {
  attendu: number;
  regle: number;
  reste: number;
  /** Paiements reçus pendant le mois (trésorerie), quelle que soit l'échéance réglée. */
  encaisse: number;
  enRetard: number;
}

export async function syntheseDuMois(db: SqlDatabase, annee: number, mois: number, aujourdhui: string): Promise<SyntheseMois> {
  const echeances = await listerEcheancesDuMois(db, annee, mois, aujourdhui);
  const p = (n: number) => String(n).padStart(2, '0');
  const encaisse = await db.get<{ total: number }>(
    "SELECT COALESCE(SUM(montant), 0) AS total FROM paiements WHERE annule_le IS NULL AND substr(date_paiement, 1, 7) = ?",
    [`${annee}-${p(mois)}`]
  );
  return {
    attendu: echeances.reduce((s, e) => s + e.montant_du, 0),
    regle: echeances.reduce((s, e) => s + Math.min(e.paye, e.montant_du), 0),
    reste: echeances.reduce((s, e) => s + e.reste, 0),
    encaisse: encaisse?.total ?? 0,
    enRetard: echeances.filter((e) => e.enRetard).length,
  };
}

/* ---------- Écritures ---------- */

export interface NouveauPaiement {
  locataireId: number;
  montant: number;
  mode: ModePaiement;
  datePaiement: string;
  reference?: string | null;
  note?: string | null;
}

export interface ResultatPaiement {
  paiementId: number;
  recuNumero: string;
  /** Part du paiement non affectée (trop-perçu conservé en crédit). */
  credit: number;
  /** Dette restante du locataire après le paiement. */
  dette: number;
}

/**
 * Enregistre un paiement : affectation aux échéances impayées (plus anciennes d'abord), crédit pour
 * l'excédent, mouvement de trésorerie et reçu numéroté — le tout dans une seule transaction.
 */
export async function enregistrerPaiement(
  db: SqlDatabase,
  p: NouveauPaiement,
  maintenant = new Date().toISOString()
): Promise<ResultatPaiement> {
  const montant = exigerMontant(p.montant, 'Montant', { strictementPositif: true });
  const date = exigerDate(p.datePaiement, 'Date du paiement');
  if (!(p.mode in LIBELLES_MODE)) throw new ErreurMetier('Mode de paiement inconnu.');

  return db.transaction(async (tx) => {
    const locataire = await tx.get<{ id: number }>('SELECT id FROM locataires WHERE id = ?', [p.locataireId]);
    if (!locataire) throw new ErreurMetier('Locataire introuvable.');

    const { lastInsertRowId: paiementId } = await tx.run(
      'INSERT INTO paiements (locataire_id, date_paiement, montant, mode, reference, note, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.locataireId, date, montant, p.mode, texteOuNull(p.reference), texteOuNull(p.note), maintenant]
    );
    const credit = await affecter(tx, p.locataireId, paiementId, montant, maintenant);

    const categorie = await tx.get<{ id: number }>("SELECT id FROM categories_financieres WHERE code = 'loyer'");
    await tx.run(
      `INSERT INTO mouvements_financiers (date_operation, sens, montant, categorie_id, mode, description, origine_type, origine_id, statut, cree_le)
       VALUES (?, 'entree', ?, ?, ?, 'Paiement de loyer', 'paiement', ?, 'valide', ?)`,
      [date, montant, categorie!.id, p.mode, paiementId, maintenant]
    );

    const situation = await situationLocataire(tx, p.locataireId);
    const recuNumero = await prochainNumero(tx, 'REC', Number(date.slice(0, 4)));
    await tx.run('INSERT INTO recus (numero, paiement_id, montant, solde_restant, cree_le) VALUES (?, ?, ?, ?, ?)', [
      recuNumero,
      paiementId,
      montant,
      situation.dette,
      maintenant,
    ]);
    return { paiementId, recuNumero, credit, dette: situation.dette };
  });
}

/**
 * Annule un paiement (erreur de saisie) : il reste dans l'historique avec son motif, ne compte plus
 * dans les règlements ni dans la trésorerie. Son reçu garde son numéro.
 */
export async function annulerPaiement(db: SqlDatabase, paiementId: number, motif: string, maintenant = new Date().toISOString()): Promise<void> {
  const raison = motif.trim();
  if (!raison) throw new ErreurMetier('Indiquez le motif de l’annulation.');
  await db.transaction(async (tx) => {
    const p = await tx.get<{ locataire_id: number; annule_le: string | null }>('SELECT locataire_id, annule_le FROM paiements WHERE id = ?', [
      paiementId,
    ]);
    if (!p) throw new ErreurMetier('Paiement introuvable.');
    if (p.annule_le) throw new ErreurMetier('Ce paiement est déjà annulé.');
    await tx.run('UPDATE paiements SET annule_le = ?, motif_annulation = ? WHERE id = ?', [maintenant, raison, paiementId]);
    await tx.run(
      "UPDATE mouvements_financiers SET statut = 'annule', motif_annulation = ? WHERE origine_type = 'paiement' AND origine_id = ?",
      [raison, paiementId]
    );
    // Les crédits d'autres paiements peuvent couvrir ce que l'annulation a rouvert.
    await appliquerCredits(tx, p.locataire_id, maintenant);
  });
}

/** Facture de loyer d'une échéance (montant dû). Réutilise la facture existante si elle a déjà été émise. */
export async function emettreFactureLoyer(db: SqlDatabase, echeanceId: number, maintenant = new Date().toISOString()): Promise<string> {
  return db.transaction(async (tx) => {
    const existante = await tx.get<{ numero: string }>("SELECT numero FROM factures WHERE echeance_id = ? AND statut = 'emise'", [echeanceId]);
    if (existante) return existante.numero;
    const e = await tx.get<{ montant_du: number; annee: number; locataire_id: number }>(
      'SELECT e.montant_du, e.annee, c.locataire_id FROM echeances e JOIN contrats c ON c.id = e.contrat_id WHERE e.id = ?',
      [echeanceId]
    );
    if (!e) throw new ErreurMetier('Échéance introuvable.');
    const numero = await prochainNumero(tx, 'FAC', e.annee);
    await tx.run(
      "INSERT INTO factures (numero, type, locataire_id, echeance_id, montant, statut, cree_le) VALUES (?, 'loyer', ?, ?, ?, 'emise', ?)",
      [numero, e.locataire_id, echeanceId, e.montant_du, maintenant]
    );
    return numero;
  });
}

/** Annule une facture : elle reste dans l'historique et son numéro n'est jamais réattribué. */
export async function annulerFacture(db: SqlDatabase, numero: string, motif: string): Promise<void> {
  const raison = motif.trim();
  if (!raison) throw new ErreurMetier('Indiquez le motif de l’annulation.');
  const { changes } = await db.run("UPDATE factures SET statut = 'annulee', motif_annulation = ? WHERE numero = ? AND statut = 'emise'", [
    raison,
    numero,
  ]);
  if (changes === 0) throw new ErreurMetier('Facture introuvable ou déjà annulée.');
}
