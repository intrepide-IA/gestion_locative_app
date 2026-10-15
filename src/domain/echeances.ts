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

/* ---------- Échéancier (passé + mois à venir couverts par l'avance) ---------- */

export type StatutLigne = StatutEcheance | 'avance' | 'a_venir';

export interface LigneEcheancier {
  annee: number;
  mois: number;
  date: string;
  montant: number;
  /** Montant réglé (échéance existante) ou couvert par l'avance (mois à venir). */
  regle: number;
  statut: StatutLigne;
  /** Mois pas encore facturé : seule l'avance peut le couvrir. */
  futur: boolean;
}

export interface Echeancier {
  lignes: LigneEcheancier[];
  /** Dernier mois entièrement réglé sans trou depuis le début, ou null. */
  payeJusqua: { annee: number; mois: number } | null;
  /** Prochaine somme attendue : première ligne pas entièrement réglée. */
  prochain: { date: string; montant: number; enRetard: boolean } | null;
}

const moisSuivant = ({ annee, mois }: { annee: number; mois: number }) => (mois === 12 ? { annee: annee + 1, mois: 1 } : { annee, mois: mois + 1 });

/**
 * Échéancier d'un locataire : les échéances déjà créées, puis `moisFuturs` mois à venir que l'avance
 * (trop-perçu) couvre dans l'ordre. Un locataire qui a payé trois mois d'avance apparaît « payé jusqu'à »
 * ce mois-là, et son prochain paiement est celui du mois suivant.
 */
export function echeancier(p: {
  echeances: { annee: number; mois: number; date_echeance: string; montant_du: number; paye: number; statut: StatutEcheance }[];
  credit: number;
  contrat: { date_debut: string; date_fin: string | null; jour_echeance: number; montant: number } | null;
  aujourdhui: string;
  moisFuturs: number;
}): Echeancier {
  const lignes: LigneEcheancier[] = p.echeances.map((e) => ({
    annee: e.annee,
    mois: e.mois,
    date: e.date_echeance,
    montant: e.montant_du,
    regle: Math.min(e.paye, e.montant_du),
    statut: e.statut,
    futur: false,
  }));

  if (p.contrat && p.contrat.montant > 0) {
    const dernier = lignes[lignes.length - 1];
    const [a, m] = premierMoisFacture(p.contrat.date_debut).split('-').map(Number);
    let courant = dernier ? moisSuivant(dernier) : { annee: a, mois: m };
    let credit = Math.max(0, p.credit);
    for (let i = 0; i < p.moisFuturs; i++) {
      const date = dateEcheance(courant.annee, courant.mois, p.contrat.jour_echeance, p.contrat.date_debut);
      if (p.contrat.date_fin && date > p.contrat.date_fin) break;
      const couvert = Math.min(credit, p.contrat.montant);
      credit -= couvert;
      lignes.push({
        ...courant,
        date,
        montant: p.contrat.montant,
        regle: couvert,
        statut: couvert === p.contrat.montant ? 'avance' : couvert > 0 ? 'partielle' : 'a_venir',
        futur: true,
      });
      courant = moisSuivant(courant);
    }
  }

  let payeJusqua: Echeancier['payeJusqua'] = null;
  for (const l of lignes) {
    if (l.regle < l.montant) break;
    payeJusqua = { annee: l.annee, mois: l.mois };
  }
  const suivante = lignes.find((l) => l.regle < l.montant);
  return {
    lignes,
    payeJusqua,
    prochain: suivante ? { date: suivante.date, montant: suivante.montant - suivante.regle, enRetard: suivante.date < p.aujourdhui } : null,
  };
}

/**
 * Effet d'un paiement sur l'échéancier : il règle les mois dans l'ordre (les plus anciens d'abord).
 * Renvoie le dernier mois entièrement réglé après ce paiement, ou null.
 */
export function payeJusquaApres(e: Echeancier, montant: number): { annee: number; mois: number } | null {
  let reste = montant;
  let jusqua = null as { annee: number; mois: number } | null;
  for (const l of e.lignes) {
    const manque = l.montant - l.regle;
    if (manque > reste) break;
    reste -= manque;
    jusqua = { annee: l.annee, mois: l.mois };
  }
  return jusqua;
}
