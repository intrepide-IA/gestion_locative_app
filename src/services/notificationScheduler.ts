/**
 * Planificateur de notifications locales
 * Vérifie les échéances et envoie des notifications
 */
import { getFacturesMois } from './facturesMoisService';
import { getLocatairesActifs } from './locataireService';
import { getStockActuel } from './electriciteService';
import { envoyerNotification } from './notificationService';

export function demarrerPlanificateur() {
  const check = async () => {
    const now = new Date();
    const jourSemaine = now.getDay();
    const mois = now.getMonth() + 1;
    const annee = now.getFullYear();

    const factures = await getFacturesMois(mois, annee);
    const nonPayees = factures.filter((f) => f.status !== 'Payée');

    const echeanceJour = 5;
    for (const f of nonPayees) {
      const echeance = new Date(annee, mois - 1, echeanceJour);
      const diff = Math.ceil((echeance.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === 3) {
        await envoyerNotification(
          'Rappel loyer',
          `Loyer de ${f.tenantName} à payer dans 3 jours (${f.amount.toLocaleString()} FCFA)`
        );
      } else if (diff === 0) {
        await envoyerNotification(
          'Échéance loyer',
          `Loyer de ${f.tenantName} à payer aujourd'hui (${f.amount.toLocaleString()} FCFA)`
        );
      } else if (diff === -3) {
        await envoyerNotification(
          'Retard de paiement',
          `${f.tenantName} est en retard de 3 jours (${f.amount.toLocaleString()} FCFA)`
        );
      }
    }

    if (jourSemaine === 1) {
      await envoyerNotification('Rappel hebdomadaire', 'Pensez à vérifier les compteurs électriques');
    }

    const locataires = await getLocatairesActifs();
    for (const loc of locataires) {
      const kwh = await getStockActuel(loc.id!);
      if (kwh > 0 && kwh < 2) {
        await envoyerNotification(
          'Alerte électricité',
          `${loc.nom_complet} a moins de 2 kWh restants`
        );
      }
    }
  };

  check();
  // In React Native, setInterval might be cleared if app is closed.
  // For production, maybe use expo-background-fetch for background tasks.
  setInterval(check, 60 * 60 * 1000);
}
