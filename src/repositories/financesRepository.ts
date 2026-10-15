/**
 * Comptabilité de gestion : registre des encaissements et décaissements, solde et rapports.
 * Solde = solde initial + entrées validées − sorties validées. Rien n'est saisi comme solde « définitif ».
 * Les mouvements créés par les loyers et l'électricité se corrigent depuis leur opération d'origine.
 */
import type { SqlDatabase } from '../db/types';
import { moisEntre } from '../domain/echeances';
import { ErreurMetier, exigerDate, exigerMontant, texteOuNull } from '../domain/erreurs';
import { LIBELLES_MODE, type ModePaiement } from './loyerRepository';
import { prochainNumero } from './numerotation';

export type Sens = 'entree' | 'sortie';
export type StatutMouvement = 'brouillon' | 'valide' | 'annule';

export interface Categorie {
  id: number;
  nom: string;
  sens: Sens;
  code: string | null;
}

export interface Mouvement {
  id: number;
  reference: string | null;
  date_operation: string;
  sens: Sens;
  montant: number;
  categorie_id: number;
  categorie_nom: string;
  mode: ModePaiement | null;
  description: string | null;
  beneficiaire: string | null;
  logement_id: number | null;
  logement_reference: string | null;
  origine_type: 'paiement' | 'achat_electricite' | 'caution' | null;
  origine_id: number | null;
  statut: StatutMouvement;
  motif_annulation: string | null;
}

export interface Periode {
  debut: string;
  fin: string;
}

export async function listerCategories(db: SqlDatabase, sens: Sens): Promise<Categorie[]> {
  return db.all<Categorie>('SELECT id, nom, sens, code FROM categories_financieres WHERE sens = ? AND archive = 0 ORDER BY nom', [sens]);
}

const SELECT_MOUVEMENTS = `
  SELECT m.*, c.nom AS categorie_nom, l.reference AS logement_reference
  FROM mouvements_financiers m JOIN categories_financieres c ON c.id = m.categorie_id
  LEFT JOIN logements l ON l.id = m.logement_id`;

export async function listerMouvements(db: SqlDatabase, periode: Periode): Promise<Mouvement[]> {
  return db.all<Mouvement>(`${SELECT_MOUVEMENTS} WHERE m.date_operation BETWEEN ? AND ? ORDER BY m.date_operation DESC, m.id DESC`, [
    periode.debut,
    periode.fin,
  ]);
}

export interface NouveauMouvement {
  sens: Sens;
  date: string;
  montant: number;
  categorieId: number;
  mode?: ModePaiement | null;
  description?: string | null;
  beneficiaire?: string | null;
  logementId?: number | null;
  /** Une dépense seulement prévue reste en brouillon : elle ne touche pas la trésorerie. */
  brouillon?: boolean;
}

/** Saisie manuelle d'une recette ou d'une dépense. Les dépenses reçoivent une référence DEP-AAAA-NNNNN. */
export async function creerMouvement(db: SqlDatabase, m: NouveauMouvement, maintenant = new Date().toISOString()): Promise<number> {
  const montant = exigerMontant(m.montant, 'Montant', { strictementPositif: true });
  const date = exigerDate(m.date, 'Date');
  if (m.mode && !(m.mode in LIBELLES_MODE)) throw new ErreurMetier('Mode de paiement inconnu.');
  return db.transaction(async (tx) => {
    const categorie = await tx.get<Categorie>('SELECT id, nom, sens, code FROM categories_financieres WHERE id = ?', [m.categorieId]);
    if (!categorie || categorie.sens !== m.sens) throw new ErreurMetier('Catégorie invalide.');
    const reference = m.sens === 'sortie' ? await prochainNumero(tx, 'DEP', Number(date.slice(0, 4))) : null;
    const { lastInsertRowId } = await tx.run(
      `INSERT INTO mouvements_financiers (reference, date_operation, sens, montant, categorie_id, mode, description, beneficiaire, logement_id, statut, cree_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        date,
        m.sens,
        montant,
        m.categorieId,
        m.mode ?? null,
        texteOuNull(m.description),
        texteOuNull(m.beneficiaire),
        m.logementId ?? null,
        m.brouillon ? 'brouillon' : 'valide',
        maintenant,
      ]
    );
    return lastInsertRowId;
  });
}

async function mouvementManuel(tx: SqlDatabase, id: number) {
  const m = await tx.get<{ origine_type: string | null; statut: StatutMouvement }>('SELECT origine_type, statut FROM mouvements_financiers WHERE id = ?', [id]);
  if (!m) throw new ErreurMetier('Opération introuvable.');
  if (m.origine_type) {
    throw new ErreurMetier('Cette opération vient d’un paiement ou d’une vente : corrigez-la depuis son origine (Loyers, Électricité).');
  }
  return m;
}

/** Une dépense prévue (brouillon) devient payée : elle entre alors dans la trésorerie. */
export async function validerMouvement(db: SqlDatabase, id: number, datePaiement?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const m = await mouvementManuel(tx, id);
    if (m.statut !== 'brouillon') throw new ErreurMetier('Seule une opération prévue peut être validée.');
    if (datePaiement) {
      await tx.run("UPDATE mouvements_financiers SET statut = 'valide', date_operation = ? WHERE id = ?", [exigerDate(datePaiement, 'Date'), id]);
    } else {
      await tx.run("UPDATE mouvements_financiers SET statut = 'valide' WHERE id = ?", [id]);
    }
  });
}

/** Annulation tracée d'une opération saisie à la main (jamais de suppression). */
export async function annulerMouvement(db: SqlDatabase, id: number, motif: string): Promise<void> {
  const raison = motif.trim();
  if (!raison) throw new ErreurMetier('Indiquez le motif de l’annulation.');
  await db.transaction(async (tx) => {
    const m = await mouvementManuel(tx, id);
    if (m.statut === 'annule') throw new ErreurMetier('Cette opération est déjà annulée.');
    await tx.run("UPDATE mouvements_financiers SET statut = 'annule', motif_annulation = ? WHERE id = ?", [raison, id]);
  });
}

/* ---------- Solde et rapports ---------- */

export async function soldeInitial(db: SqlDatabase): Promise<number> {
  return (await db.get<{ solde_initial: number }>('SELECT solde_initial FROM proprietaire WHERE id = 1'))?.solde_initial ?? 0;
}

export async function definirSoldeInitial(db: SqlDatabase, montant: number): Promise<void> {
  if (!Number.isInteger(montant)) throw new ErreurMetier('Montant invalide.');
  const { changes } = await db.run('UPDATE proprietaire SET solde_initial = ? WHERE id = 1', [montant]);
  if (changes === 0) throw new ErreurMetier('Profil du propriétaire introuvable.');
}

/** Trésorerie à une date (incluse) : solde initial + entrées − sorties validées. */
export async function soldeTresorerie(db: SqlDatabase, auPlusTard = '9999-12-31'): Promise<number> {
  const row = await db.get<{ net: number }>(
    `SELECT COALESCE(SUM(CASE WHEN sens = 'entree' THEN montant ELSE -montant END), 0) AS net
     FROM mouvements_financiers WHERE statut = 'valide' AND date_operation <= ?`,
    [auPlusTard]
  );
  return (await soldeInitial(db)) + (row?.net ?? 0);
}

export interface LigneCategorie {
  categorie: string;
  sens: Sens;
  total: number;
}

export interface Rapport {
  periode: Periode;
  entrees: number;
  sorties: number;
  resultat: number;
  soldeDebut: number;
  soldeFin: number;
  /** Loyers + toilettes dus pour les mois de la période. */
  loyersFactures: number;
  /** Encaissements de la catégorie Loyers sur la période. */
  loyersEncaisses: number;
  /** Reste dû sur les échéances de la période (créance, pas de la trésorerie). */
  impayes: number;
  cautions: number;
  depensesPrevues: number;
  parCategorie: LigneCategorie[];
  parMois: { annee: number; mois: number; entrees: number; sorties: number }[];
}

const veille = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export async function rapport(db: SqlDatabase, periode: Periode): Promise<Rapport> {
  const { debut, fin } = periode;
  const valides = "statut = 'valide' AND date_operation BETWEEN ? AND ?";

  const [totaux, parCategorie, parMoisLignes, loyers, cautions, prevues, soldeDebut, soldeFin] = await Promise.all([
    db.get<{ entrees: number; sorties: number }>(
      `SELECT COALESCE(SUM(CASE WHEN sens = 'entree' THEN montant END), 0) AS entrees,
              COALESCE(SUM(CASE WHEN sens = 'sortie' THEN montant END), 0) AS sorties
       FROM mouvements_financiers WHERE ${valides}`,
      [debut, fin]
    ),
    db.all<LigneCategorie>(
      `SELECT c.nom AS categorie, m.sens, SUM(m.montant) AS total
       FROM mouvements_financiers m JOIN categories_financieres c ON c.id = m.categorie_id
       WHERE m.statut = 'valide' AND m.date_operation BETWEEN ? AND ?
       GROUP BY c.id ORDER BY m.sens, total DESC`,
      [debut, fin]
    ),
    db.all<{ ym: string; entrees: number; sorties: number }>(
      `SELECT substr(date_operation, 1, 7) AS ym,
              COALESCE(SUM(CASE WHEN sens = 'entree' THEN montant END), 0) AS entrees,
              COALESCE(SUM(CASE WHEN sens = 'sortie' THEN montant END), 0) AS sorties
       FROM mouvements_financiers WHERE ${valides} GROUP BY ym`,
      [debut, fin]
    ),
    db.get<{ factures: number; regle: number; encaisses: number }>(
      `SELECT
         (SELECT COALESCE(SUM(e.montant_du), 0) FROM echeances e
            WHERE printf('%04d-%02d', e.annee, e.mois) BETWEEN substr(?, 1, 7) AND substr(?, 1, 7)) AS factures,
         (SELECT COALESCE(SUM(MIN(a.total, e.montant_du)), 0) FROM echeances e
            JOIN (SELECT a.echeance_id, SUM(a.montant) AS total FROM affectations a JOIN paiements p ON p.id = a.paiement_id
                  WHERE p.annule_le IS NULL GROUP BY a.echeance_id) a ON a.echeance_id = e.id
            WHERE printf('%04d-%02d', e.annee, e.mois) BETWEEN substr(?, 1, 7) AND substr(?, 1, 7)) AS regle,
         (SELECT COALESCE(SUM(m.montant), 0) FROM mouvements_financiers m JOIN categories_financieres c ON c.id = m.categorie_id
            WHERE c.code = 'loyer' AND m.statut = 'valide' AND m.date_operation BETWEEN ? AND ?) AS encaisses`,
      [debut, fin, debut, fin, debut, fin]
    ),
    db.get<{ total: number }>(
      `SELECT COALESCE(SUM(m.montant), 0) AS total FROM mouvements_financiers m JOIN categories_financieres c ON c.id = m.categorie_id
       WHERE c.code = 'caution' AND m.statut = 'valide' AND m.date_operation BETWEEN ? AND ?`,
      [debut, fin]
    ),
    db.get<{ total: number }>(
      "SELECT COALESCE(SUM(montant), 0) AS total FROM mouvements_financiers WHERE statut = 'brouillon' AND sens = 'sortie' AND date_operation BETWEEN ? AND ?",
      [debut, fin]
    ),
    soldeTresorerie(db, veille(debut)),
    soldeTresorerie(db, fin),
  ]);

  const parMois = moisEntre(debut, fin).map(({ annee, mois }) => {
    const ligne = parMoisLignes.find((l) => l.ym === `${annee}-${String(mois).padStart(2, '0')}`);
    return { annee, mois, entrees: ligne?.entrees ?? 0, sorties: ligne?.sorties ?? 0 };
  });

  const entrees = totaux?.entrees ?? 0;
  const sorties = totaux?.sorties ?? 0;
  return {
    periode,
    entrees,
    sorties,
    resultat: entrees - sorties,
    soldeDebut,
    soldeFin,
    loyersFactures: loyers?.factures ?? 0,
    loyersEncaisses: loyers?.encaisses ?? 0,
    impayes: (loyers?.factures ?? 0) - (loyers?.regle ?? 0),
    cautions: cautions?.total ?? 0,
    depensesPrevues: prevues?.total ?? 0,
    parCategorie,
    parMois,
  };
}

/** Export CSV (séparateur « ; », lisible dans Excel en français) des opérations d'une période. */
export function mouvementsEnCsv(mouvements: Mouvement[]): string {
  const echapper = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const entete = ['Date', 'Référence', 'Sens', 'Catégorie', 'Montant (FCFA)', 'Mode', 'Description', 'Bénéficiaire', 'Logement', 'Statut'];
  const lignes = mouvements.map((m) =>
    [
      m.date_operation,
      m.reference,
      m.sens === 'entree' ? 'Entrée' : 'Sortie',
      m.categorie_nom,
      m.montant,
      m.mode ? LIBELLES_MODE[m.mode] : '',
      m.description,
      m.beneficiaire,
      m.logement_reference,
      m.statut === 'valide' ? 'Validé' : m.statut === 'brouillon' ? 'Prévu' : 'Annulé',
    ]
      .map(echapper)
      .join(';')
  );
  return [entete.join(';'), ...lignes].join('\r\n');
}
