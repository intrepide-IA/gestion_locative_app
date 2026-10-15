/** Règles de calcul des échéances, sans accès à la base (cahier des charges, section 7). */

export type StatutEcheance = 'payee' | 'partielle' | 'en_attente' | 'en_retard';

export interface EtatEcheance {
  statut: StatutEcheance;
  /** Vrai dès que la date d'échéance est dépassée et qu'il reste un montant dû (y compris « partielle »). */
  enRetard: boolean;
  reste: number;
}

/** La date d'échéance est dépassée le lendemain : dû le 5, en retard à partir du 6. */
export function etatEcheance(montantDu: number, paye: number, dateEcheance: string, aujourdhui: string): EtatEcheance {
  const reste = Math.max(0, montantDu - paye);
  if (reste === 0) return { statut: 'payee', enRetard: false, reste: 0 };
  const enRetard = aujourdhui > dateEcheance;
  if (paye > 0) return { statut: 'partielle', enRetard, reste };
  return { statut: enRetard ? 'en_retard' : 'en_attente', enRetard, reste };
}

export const LIBELLES_STATUT: Record<StatutEcheance, string> = {
  payee: 'Payée',
  partielle: 'Partielle',
  en_attente: 'En attente',
  en_retard: 'En retard',
};

/** Mois (année, mois) de `debut` à `fin` inclus, au format AAAA-MM-JJ ou AAAA-MM. */
export function moisEntre(debut: string, fin: string): { annee: number; mois: number }[] {
  let [annee, mois] = debut.split('-').map(Number);
  const [anneeFin, moisFin] = fin.split('-').map(Number);
  const resultat: { annee: number; mois: number }[] = [];
  while (annee < anneeFin || (annee === anneeFin && mois <= moisFin)) {
    resultat.push({ annee, mois });
    mois += 1;
    if (mois > 12) {
      mois = 1;
      annee += 1;
    }
  }
  return resultat;
}

/**
 * Date d'échéance d'un mois : le jour prévu au contrat, mais jamais avant la date d'entrée
 * (un locataire entré le 15 n'est pas en retard le 16 pour une échéance « du 5 »).
 */
export function dateEcheance(annee: number, mois: number, jour: number, dateDebutContrat: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${annee}-${p(mois)}-${p(jour)}`;
  return date < dateDebutContrat ? dateDebutContrat : date;
}

/**
 * Premier mois facturé : celui qui suit l'entrée. À l'entrée, le locataire verse la caution et reçoit
 * les clés ; il paie son premier loyer le même jour du mois suivant (entré le 15 octobre → dû le 15 novembre).
 */
export function premierMoisFacture(dateDebutContrat: string): string {
  const [annee, mois] = dateDebutContrat.split('-').map(Number);
  return mois === 12 ? `${annee + 1}-01` : `${annee}-${String(mois + 1).padStart(2, '0')}`;
}

/** Jour d'échéance proposé pour une entrée : le jour de l'entrée (28 au plus, pour exister chaque mois). */
export function jourEcheanceParDefaut(dateDebutContrat: string): number {
  return Math.min(28, Number(dateDebutContrat.slice(8, 10)));
}
