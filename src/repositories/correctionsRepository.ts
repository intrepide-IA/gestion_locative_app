/**
 * Corrections sensibles d'un locataire, réservées au propriétaire (code PIN vérifié par l'écran) et
 * toujours motivées : modification de toutes les informations du contrat, ou suppression définitive.
 * Chaque action est inscrite au journal des modifications, qui n'est jamais effacé.
 */
import type { SqlDatabase } from '../db/types';
import { ErreurMetier, exigerDate, exigerMontant, texteOuNull } from '../domain/erreurs';
import { dateEcheance, premierMoisFacture } from '../domain/echeances';
import { genererEcheances } from './loyerRepository';
import { modifierFicheLocataire, type FicheLocataire } from './locataireRepository';

export interface EntreeJournal {
  id: number;
  quand: string;
  objet: string;
  action: string;
  motif: string;
  details: string | null;
}

async function journaliser(tx: SqlDatabase, objet: string, objetId: number, action: string, motif: string, details: unknown, quand: string) {
  await tx.run('INSERT INTO journal_modifications (quand, objet, objet_id, action, motif, details) VALUES (?, ?, ?, ?, ?, ?)', [
    quand,
    objet,
    objetId,
    action,
    motif,
    JSON.stringify(details),
  ]);
}

function exigerMotif(motif: string): string {
  const m = motif.trim();
  if (m.length < 3) throw new ErreurMetier('Indiquez le motif de la modification.');
  return m;
}

export interface CorrectionContrat {
  date_debut: string;
  loyer: number;
  toilettes: number;
  caution: number;
  caution_electricite: number;
  caution_eau: number;
  jour_echeance: number;
  prix_kwh: number;
  releve_initial: number;
}

/**
 * Corrige toutes les informations d'un locataire et de son contrat (date d'entrée, loyer, cautions,
 * relevé initial…). Les échéances déjà réglées (même en partie) ne changent pas ; les autres sont
 * recalculées avec les nouvelles conditions. La caution en trésorerie suit les nouveaux montants.
 */
export async function corrigerLocataire(
  db: SqlDatabase,
  contratId: number,
  fiche: FicheLocataire,
  c: CorrectionContrat,
  motif: string,
  aujourdhui: string,
  maintenant = new Date().toISOString()
): Promise<void> {
  const raison = exigerMotif(motif);
  exigerDate(c.date_debut, 'Date d’entrée');
  for (const [cle, libelle] of [
    ['loyer', 'Loyer'],
    ['toilettes', 'Toilettes'],
    ['caution', 'Caution'],
    ['caution_electricite', 'Caution électricité'],
    ['caution_eau', 'Caution eau'],
  ] as const) {
    exigerMontant(c[cle], libelle);
  }
  exigerMontant(c.prix_kwh, 'Prix du kWh', { strictementPositif: true });
  if (!Number.isInteger(c.jour_echeance) || c.jour_echeance < 1 || c.jour_echeance > 28) throw new ErreurMetier('Jour d’échéance entre 1 et 28.');
  if (!Number.isFinite(c.releve_initial) || c.releve_initial < 0) throw new ErreurMetier('Relevé initial invalide.');

  const avant = await db.get<Record<string, unknown> & { locataire_id: number; logement_id: number; date_fin: string | null }>(
    'SELECT * FROM contrats WHERE id = ?',
    [contratId]
  );
  if (!avant) throw new ErreurMetier('Contrat introuvable.');
  if (avant.date_fin && avant.date_fin < c.date_debut) throw new ErreurMetier('La date d’entrée dépasse la date de fin du contrat.');
  await modifierFicheLocataire(db, avant.locataire_id, fiche);

  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE contrats SET date_debut = ?, loyer = ?, toilettes = ?, caution = ?, caution_electricite = ?, caution_eau = ?,
         jour_echeance = ?, prix_kwh = ?, releve_initial = ? WHERE id = ?`,
      [c.date_debut, c.loyer, c.toilettes, c.caution, c.caution_electricite, c.caution_eau, c.jour_echeance, c.prix_kwh, c.releve_initial, contratId]
    );
    // Caution en trésorerie : même date d'entrée, total des cautions.
    const total = c.caution + c.caution_electricite + c.caution_eau;
    await tx.run(
      "UPDATE mouvements_financiers SET date_operation = ?, montant = ?, statut = CASE WHEN ? > 0 THEN 'valide' ELSE 'annule' END WHERE origine_type = 'caution' AND origine_id = ?",
      [c.date_debut, Math.max(1, total), total, contratId]
    );

    // Échéances sans aucun règlement : supprimées (si sans facture) puis recréées, ou mises à jour.
    const premier = premierMoisFacture(c.date_debut);
    const libres = await tx.all<{ id: number; annee: number; mois: number; factures: number }>(
      `SELECT e.id, e.annee, e.mois, (SELECT count(*) FROM factures f WHERE f.echeance_id = e.id) AS factures
       FROM echeances e WHERE e.contrat_id = ? AND NOT EXISTS (SELECT 1 FROM affectations a WHERE a.echeance_id = e.id)`,
      [contratId]
    );
    for (const e of libres) {
      const ym = `${e.annee}-${String(e.mois).padStart(2, '0')}`;
      if (e.factures === 0) {
        await tx.run('DELETE FROM echeances WHERE id = ?', [e.id]);
      } else if (ym >= premier) {
        await tx.run('UPDATE echeances SET loyer = ?, toilettes = ?, montant_du = ?, date_echeance = ? WHERE id = ?', [
          c.loyer,
          c.toilettes,
          c.loyer + c.toilettes,
          dateEcheance(e.annee, e.mois, c.jour_echeance, c.date_debut),
          e.id,
        ]);
        await tx.run("UPDATE factures SET statut = 'annulee', motif_annulation = ? WHERE echeance_id = ? AND statut = 'emise'", [
          `Contrat corrigé : ${raison}`,
          e.id,
        ]);
      }
    }
    await journaliser(tx, 'contrat', contratId, 'correction', raison, { avant, apres: { ...c, fiche } }, maintenant);
  });
  await genererEcheances(db, aujourdhui, maintenant);
}

/**
 * Supprime définitivement un locataire et tout ce qui le concerne : contrats, échéances, paiements,
 * reçus, factures, électricité, contrat de bail, états des lieux et leurs écritures en trésorerie.
 * Seule une ligne du journal (nom, motif, montants) en garde la trace.
 */
export async function supprimerLocataireDefinitivement(db: SqlDatabase, locataireId: number, motif: string, maintenant = new Date().toISOString()): Promise<void> {
  const raison = exigerMotif(motif);
  await db.transaction(async (tx) => {
    const t = await tx.get<{ nom_complet: string; telephone: string | null }>('SELECT nom_complet, telephone FROM locataires WHERE id = ?', [locataireId]);
    if (!t) throw new ErreurMetier('Locataire introuvable.');
    const contrats = (await tx.all<{ id: number }>('SELECT id FROM contrats WHERE locataire_id = ?', [locataireId])).map((c) => c.id);
    const paiements = (await tx.all<{ id: number }>('SELECT id FROM paiements WHERE locataire_id = ?', [locataireId])).map((p) => p.id);
    const achats = contrats.length
      ? (await tx.all<{ id: number }>(`SELECT id FROM achats_electricite WHERE contrat_id IN (${contrats.map(() => '?').join(',')})`, contrats)).map(
          (a) => a.id
        )
      : [];
    const bilan = await tx.get<{ paye: number }>('SELECT COALESCE(SUM(montant), 0) AS paye FROM paiements WHERE locataire_id = ? AND annule_le IS NULL', [
      locataireId,
    ]);

    const dans = (ids: number[]) => ids.map(() => '?').join(',');
    // Écritures de trésorerie liées (et leurs justificatifs).
    const origines: [string, number[]][] = [
      ['paiement', paiements],
      ['caution', contrats],
      ['achat_electricite', achats],
    ];
    for (const [type, ids] of origines) {
      if (!ids.length) continue;
      const condition = `origine_type = ? AND origine_id IN (${dans(ids)})`;
      await tx.run(`DELETE FROM justificatifs WHERE mouvement_id IN (SELECT id FROM mouvements_financiers WHERE ${condition})`, [type, ...ids]);
      await tx.run(`DELETE FROM mouvements_financiers WHERE ${condition}`, [type, ...ids]);
    }
    if (paiements.length) {
      await tx.run(`DELETE FROM affectations WHERE paiement_id IN (${dans(paiements)})`, paiements);
      await tx.run(`DELETE FROM recus WHERE paiement_id IN (${dans(paiements)})`, paiements);
    }
    await tx.run('DELETE FROM factures WHERE locataire_id = ?', [locataireId]);
    if (paiements.length) await tx.run(`DELETE FROM paiements WHERE id IN (${dans(paiements)})`, paiements);
    if (contrats.length) {
      const c = dans(contrats);
      await tx.run(`DELETE FROM affectations WHERE echeance_id IN (SELECT id FROM echeances WHERE contrat_id IN (${c}))`, contrats);
      await tx.run(`DELETE FROM echeances WHERE contrat_id IN (${c})`, contrats);
      await tx.run(`DELETE FROM achats_electricite WHERE contrat_id IN (${c})`, contrats);
      await tx.run(`DELETE FROM releves WHERE contrat_id IN (${c})`, contrats);
      await tx.run(`DELETE FROM baux WHERE contrat_id IN (${c})`, contrats);
      await tx.run(`DELETE FROM etats_des_lieux WHERE contrat_id IN (${c})`, contrats);
      await tx.run(`DELETE FROM contrats WHERE id IN (${c})`, contrats);
    }
    // Les rappels déjà programmés pour ce locataire seront retirés à la prochaine synchronisation.
    await tx.run('DELETE FROM locataires WHERE id = ?', [locataireId]);
    await journaliser(
      tx,
      'locataire',
      locataireId,
      'suppression',
      raison,
      { nom: t.nom_complet, telephone: texteOuNull(t.telephone), contrats: contrats.length, paiements: paiements.length, total_paye: bilan?.paye ?? 0 },
      maintenant
    );
  });
}

export async function journalDesModifications(db: SqlDatabase, limite = 100): Promise<EntreeJournal[]> {
  return db.all<EntreeJournal>('SELECT id, quand, objet, action, motif, details FROM journal_modifications ORDER BY id DESC LIMIT ?', [limite]);
}
