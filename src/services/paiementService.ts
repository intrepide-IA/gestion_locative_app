import { nativeDb as db } from '../database/db.native';
import type { PaiementLoyer, StatutPaiement } from '../types';
import { getContratActif } from './contratService';
import { getLogement } from './logementService';
import { getLocataire } from './locataireService';

/** Calcule le montant dû pour un mois donné (loyer + toilettes) */
export async function getMontantDuMois(locataireId: number, mois: number, annee: number): Promise<number> {
  const contrat = await getContratActif(locataireId);
  if (!contrat) return 0;
  // Note: Based on previous code, both logic paths returned the same value
  return (contrat.montant_loyer || 0) + (contrat.montant_toilettes || 0);
}

/** Récupère ou crée l'entrée paiement pour un mois */
export async function getPaiementMois(locataireId: number, mois: number, annee: number): Promise<PaiementLoyer | undefined> {
  const result = await db.getOne<PaiementLoyer>(
    'SELECT * FROM paiements_loyer WHERE locataire_id = ? AND mois = ? AND annee = ?',
    [locataireId, mois, annee]
  );
  return result || undefined;
}

/** Calcule le statut d'un paiement */
export function calculerStatutPaiement(
  montant_du: number,
  montant_paye: number,
  dateLimite: Date
): StatutPaiement {
  const now = new Date();
  if (montant_paye >= montant_du) return 'paye';
  if (now > dateLimite) return 'retard';
  return 'partiel';
}

export async function getAllPaiements(): Promise<PaiementLoyer[]> {
  return db.query<PaiementLoyer>('SELECT * FROM paiements_loyer ORDER BY annee DESC, mois DESC');
}

export async function getPaiementsByLocataire(locataireId: number): Promise<PaiementLoyer[]> {
  return db.query<PaiementLoyer>('SELECT * FROM paiements_loyer WHERE locataire_id = ? ORDER BY id DESC', [locataireId]);
}

export async function getPaiementsByMoisAnnee(mois: number, annee: number): Promise<PaiementLoyer[]> {
  return db.query<PaiementLoyer>('SELECT * FROM paiements_loyer WHERE mois = ? AND annee = ?', [mois, annee]);
}

export async function enregistrerPaiement(
  locataireId: number,
  mois: number,
  annee: number,
  montant: number,
  factureId?: number
): Promise<number> {
  const montant_du = await getMontantDuMois(locataireId, mois, annee);
  const dernierJour = new Date(annee, mois, 0);
  const date_paiement = new Date().toISOString();

  // Manual transaction simulation (SQLite version)
  const loc = await db.getOne<{ solde_courant: number, solde_initial: number }>('SELECT solde_courant, solde_initial FROM locataires WHERE id = ?', [locataireId]);
  const solde_avant = loc?.solde_courant ?? loc?.solde_initial ?? 0;
  const solde_apres = solde_avant - montant;

  const existing = await getPaiementMois(locataireId, mois, annee);
  const totalPaye = (existing?.montant_paye ?? 0) + montant;
  const statut = calculerStatutPaiement(montant_du, totalPaye, dernierJour);

  let paiementId: number;
  if (existing) {
    await db.exec(
      `UPDATE paiements_loyer SET montant_paye = ?, statut = ?, date_paiement = ?, facture_id = ?, solde_avant = ?, solde_apres = ? WHERE id = ?`,
      [totalPaye, statut, date_paiement, factureId ?? existing.facture_id, solde_avant, solde_apres, existing.id]
    );
    paiementId = existing.id!;
  } else {
    await db.exec(
      `INSERT INTO paiements_loyer (locataire_id, mois, annee, montant_du, montant_paye, statut, date_paiement, facture_id, solde_avant, solde_apres) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [locataireId, mois, annee, montant_du, montant, statut, date_paiement, factureId, solde_avant, solde_apres]
    );
    const last = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
    paiementId = last?.id || 0;
  }

  // Mouvement de compte
  await db.exec(
    `INSERT INTO mouvements_compte (locataire_id, date_operation, description, montant, solde_avant, solde_apres) VALUES (?, ?, ?, ?, ?, ?)`,
    [locataireId, date_paiement, `Paiement loyer ${mois}/${annee}`, montant, solde_avant, solde_apres]
  );

  // Mise à jour du solde courant du locataire
  await db.exec('UPDATE locataires SET solde_courant = ? WHERE id = ?', [solde_apres, locataireId]);

  // Mise à jour statut facture éventuelle
  if (factureId) {
    const nouveauStatut = totalPaye >= montant_du ? 'paye' : 'en_attente';
    await db.exec('UPDATE factures SET statut = ? WHERE id = ?', [nouveauStatut, factureId]);
  }

  return paiementId;
}
