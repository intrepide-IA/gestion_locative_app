/** Lecture, dans la base, des données d'un reçu ou d'une facture (toujours les données réelles). */
import type { SqlDatabase } from '../db/types';
import { ErreurMetier } from '../domain/erreurs';
import { LIBELLES_MODE, type ModePaiement } from '../repositories/loyerRepository';
import type { DonneesFacture, DonneesRecu, Emetteur } from './gabarits';

async function emetteur(db: SqlDatabase): Promise<Emetteur> {
  const p = await db.get<Emetteur>('SELECT nom, telephone, adresse FROM proprietaire WHERE id = 1');
  return p ?? { nom: 'Propriétaire', telephone: null, adresse: null };
}

export async function donneesRecu(db: SqlDatabase, paiementId: number): Promise<DonneesRecu> {
  const p = await db.get<{
    numero: string;
    solde_restant: number;
    date_paiement: string;
    montant: number;
    mode: ModePaiement;
    reference: string | null;
    annule_le: string | null;
    motif_annulation: string | null;
    nom_complet: string;
    telephone: string | null;
    locataire_id: number;
  }>(
    `SELECT r.numero, r.solde_restant, p.date_paiement, p.montant, p.mode, p.reference, p.annule_le, p.motif_annulation,
            t.nom_complet, t.telephone, t.id AS locataire_id
     FROM paiements p JOIN recus r ON r.paiement_id = p.id JOIN locataires t ON t.id = p.locataire_id
     WHERE p.id = ?`,
    [paiementId]
  );
  if (!p) throw new ErreurMetier('Reçu introuvable.');
  const lignes = await db.all<{ annee: number; mois: number; montant: number }>(
    'SELECT e.annee, e.mois, a.montant FROM affectations a JOIN echeances e ON e.id = a.echeance_id WHERE a.paiement_id = ? ORDER BY e.annee, e.mois',
    [paiementId]
  );
  const logement = await db.get<{ reference: string }>(
    `SELECT l.reference FROM contrats c JOIN logements l ON l.id = c.logement_id
     WHERE c.locataire_id = ? ORDER BY c.statut = 'actif' DESC, c.date_debut DESC LIMIT 1`,
    [p.locataire_id]
  );
  const affecte = lignes.reduce((s, l) => s + l.montant, 0);
  return {
    numero: p.numero,
    date: p.date_paiement,
    montant: p.montant,
    mode: LIBELLES_MODE[p.mode],
    reference: p.reference,
    lignes,
    credit: p.montant - affecte,
    soldeRestant: p.solde_restant,
    annule: p.annule_le ? { le: p.annule_le, motif: p.motif_annulation ?? '' } : null,
    emetteur: await emetteur(db),
    destinataire: { nom: p.nom_complet, telephone: p.telephone, logement: logement?.reference ?? '—' },
  };
}

export async function donneesFacture(db: SqlDatabase, numero: string): Promise<DonneesFacture> {
  const f = await db.get<{
    numero: string;
    cree_le: string;
    statut: string;
    montant: number;
    echeance_id: number;
    annee: number;
    mois: number;
    loyer: number;
    toilettes: number;
    date_echeance: string;
    nom_complet: string;
    telephone: string | null;
    reference: string;
  }>(
    `SELECT f.numero, f.cree_le, f.statut, f.montant, f.echeance_id, e.annee, e.mois, e.loyer, e.toilettes, e.date_echeance,
            t.nom_complet, t.telephone, l.reference
     FROM factures f JOIN echeances e ON e.id = f.echeance_id JOIN contrats c ON c.id = e.contrat_id
     JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id
     WHERE f.numero = ?`,
    [numero]
  );
  if (!f) throw new ErreurMetier('Facture introuvable.');
  const regle = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(a.montant), 0) AS total FROM affectations a JOIN paiements p ON p.id = a.paiement_id
     WHERE a.echeance_id = ? AND p.annule_le IS NULL`,
    [f.echeance_id]
  );
  return {
    numero: f.numero,
    dateEmission: f.cree_le,
    periode: { annee: f.annee, mois: f.mois },
    dateEcheance: f.date_echeance,
    loyer: f.loyer,
    toilettes: f.toilettes,
    montant: f.montant,
    regle: regle?.total ?? 0,
    annulee: f.statut === 'annulee',
    emetteur: await emetteur(db),
    destinataire: { nom: f.nom_complet, telephone: f.telephone, logement: f.reference },
  };
}
