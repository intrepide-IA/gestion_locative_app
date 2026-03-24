/**
 * Génère la liste des factures/échéances pour un mois donné
 */
import { getLocatairesActifs } from './locataireService';
import { getContratActif } from './contratService';
import { getPaiementMois } from './paiementService';
import { getLogement } from './logementService';

export interface FactureMois {
  id: number;
  locataireId: number;
  tenantName: string;
  property: string;
  amount: number;
  montantPaye: number;
  status: 'Payée' | 'En attente' | 'En retard';
  date: string;
  paiementId?: number;
}

export async function getFacturesMois(mois: number, annee: number): Promise<FactureMois[]> {
  const locataires = await getLocatairesActifs();
  const result: FactureMois[] = [];
  const now = new Date();
  const dernierJour = new Date(annee, mois, 0);

  for (const loc of locataires) {
    const contrat = await getContratActif(loc.id!);
    if (!contrat) continue;
    const montantDu = contrat.montant_loyer + contrat.montant_toilettes;
    const paiement = await getPaiementMois(loc.id!, mois, annee);
    const montantPaye = paiement?.montant_paye ?? 0;
    const status: 'Payée' | 'En attente' | 'En retard' =
      montantPaye >= montantDu ? 'Payée' : now > dernierJour ? 'En retard' : 'En attente';
    const log = loc.logement_id ? await getLogement(loc.logement_id) : null;
    result.push({
      id: paiement?.id ?? loc.id!,
      locataireId: loc.id!,
      tenantName: loc.nom_complet,
      property: log?.numero ?? '-',
      amount: montantDu,
      montantPaye,
      status,
      date: paiement?.date_paiement
        ? new Date(paiement.date_paiement).toLocaleDateString('fr-FR')
        : `Échéance ${mois}/${annee}`,
      paiementId: paiement?.id,
    });
  }
  return result;
}
