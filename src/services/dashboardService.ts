/**
 * Données agrégées pour le Dashboard
 */
import { nativeDb as db } from '../database/db.native';
import { getContratActif } from './contratService';
import { getPaiementMois, calculerStatutPaiement } from './paiementService';
import { getStockActuel, getTotalKwhVendus } from './electriciteService';
import type { Logement, Locataire, PaiementLoyer } from '../types';

const now = new Date();
const moisActuel = now.getMonth() + 1;
const anneeActuelle = now.getFullYear();

export interface DashboardStats {
  logementsOccupes: number;
  logementsLibres: number;
  totalLogements: number;
  locatairesActifs: number;
  loyersEnAttente: number;
  revenusDuMois: number;
  impayes: number;
  alertesActives: number;
  totalKwhVendus: number;
  tauxRecouvrement: number;
  prochainesEcheances: { nom: string; montant: number; date: string }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [logements, locataires, , totalKwh] = await Promise.all([
    db.query<Logement>('SELECT * FROM logements'),
    db.query<Locataire>("SELECT * FROM locataires WHERE statut = 'actif'"),
    db.query<PaiementLoyer>('SELECT * FROM paiements_loyer WHERE mois = ? AND annee = ?', [moisActuel, anneeActuelle]),
    getTotalKwhVendus(),
  ]);

  const logementsOccupes = logements.filter((l) => l.statut === 'occupe').length;
  const logementsLibres = logements.filter((l) => l.statut === 'libre').length;
  const totalLogements = logements.length;

  let revenusDuMois = 0;
  let impayes = 0;
  let payeCount = 0;
  let totalCount = locataires.length;
  const prochainesEcheances: { nom: string; montant: number; date: string }[] = [];
  let alertesActives = 0;

  for (const loc of locataires) {
    const contrat = await getContratActif(loc.id!);
    if (!contrat) continue;
    const montantDu = (contrat.montant_loyer || 0) + (contrat.montant_toilettes || 0);
    const paiement = await getPaiementMois(loc.id!, moisActuel, anneeActuelle);
    const montantPaye = paiement?.montant_paye ?? 0;
    revenusDuMois += montantPaye;

    if (montantPaye < montantDu) {
      impayes += montantDu - montantPaye;
      const dernierJour = new Date(anneeActuelle, moisActuel, 0);
      const statut = calculerStatutPaiement(montantDu, montantPaye, dernierJour);
      if (statut === 'retard') alertesActives++;
      prochainesEcheances.push({
        nom: loc.nom_complet,
        montant: montantDu - montantPaye,
        date: `Échéance ${moisActuel}/${anneeActuelle}`,
      });
    }
    if (montantPaye >= montantDu) payeCount++;
  }

  const tauxRecouvrement = totalCount > 0 ? Math.round((payeCount / totalCount) * 100) : 100;

  for (const loc of locataires) {
    const kwh = await getStockActuel(loc.id!);
    if (kwh < 2 && kwh > 0) alertesActives++;
  }

  return {
    logementsOccupes,
    logementsLibres,
    totalLogements,
    locatairesActifs: locataires.length,
    loyersEnAttente: prochainesEcheances.length,
    revenusDuMois,
    impayes,
    alertesActives,
    totalKwhVendus: totalKwh,
    tauxRecouvrement,
    prochainesEcheances: prochainesEcheances.slice(0, 5),
  };
}

export async function getPaiementsRecents(): Promise<{ name: string; amount: number; date: string }[]> {
  const paiements = await db.query<PaiementLoyer>('SELECT * FROM paiements_loyer ORDER BY id DESC LIMIT 10');
  const result: { name: string; amount: number; date: string }[] = [];

  for (const p of paiements) {
    const loc = await db.getOne<Locataire>('SELECT nom_complet FROM locataires WHERE id = ?', [p.locataire_id]);
    if (!loc) continue;
    const dateStr = p.date_paiement
      ? new Date(p.date_paiement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      : '-';
    result.push({ name: loc.nom_complet, amount: p.montant_paye, date: dateStr });
  }
  return result.slice(0, 5);
}
