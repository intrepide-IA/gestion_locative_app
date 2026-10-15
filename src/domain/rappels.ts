/**
 * Rappels à programmer (cahier des charges, section 13), calculés à partir des données — sans module natif.
 * Chaque rappel a une clé unique : un même événement ne produit jamais deux notifications.
 */
import { formatFCFA } from './format';
import { LIBELLES_STOCK, type EtatStock } from './electricite';

export interface RappelSouhaite {
  cle: string;
  type: 'loyer' | 'fin_contrat' | 'electricite' | 'sauvegarde';
  titre: string;
  corps: string;
  date: Date;
}

export interface DonneesRappels {
  echeancesImpayees: { id: number; date_echeance: string; reste: number; locataire_nom: string; logement_reference: string }[];
  contratsAvecFin: { id: number; date_fin: string; locataire_nom: string; logement_reference: string }[];
  stocks: { contrat_id: number; etat: EtatStock; stock: number; locataire_nom: string; achetes: number; consommes: number }[];
}

/** Date locale à 9 h (ou `heure`) pour un jour AAAA-MM-JJ décalé de `jours`. */
export function aHeure(jour: string, jours = 0, heure = 9): Date {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(a, m - 1, j + jours, heure, 0, 0, 0);
}

export function rappelsSouhaites(d: DonneesRappels, maintenant: Date): RappelSouhaite[] {
  const rappels: RappelSouhaite[] = [];
  const futur = (r: RappelSouhaite) => r.date.getTime() > maintenant.getTime() && rappels.push(r);

  for (const e of d.echeancesImpayees) {
    const quoi = `${e.locataire_nom} (${e.logement_reference}) : ${formatFCFA(e.reste)}`;
    futur({ cle: `loyer-${e.id}-j-3`, type: 'loyer', titre: 'Loyer dans 3 jours', corps: quoi, date: aHeure(e.date_echeance, -3) });
    futur({ cle: `loyer-${e.id}-j`, type: 'loyer', titre: 'Loyer à payer aujourd’hui', corps: quoi, date: aHeure(e.date_echeance) });
    futur({ cle: `loyer-${e.id}-j+3`, type: 'loyer', titre: 'Loyer en retard', corps: `${quoi} — échéance dépassée de 3 jours`, date: aHeure(e.date_echeance, 3) });
  }

  for (const c of d.contratsAvecFin) {
    futur({
      cle: `fin-${c.id}-${c.date_fin}`,
      type: 'fin_contrat',
      titre: 'Fin de contrat dans 7 jours',
      corps: `${c.locataire_nom} (${c.logement_reference})`,
      date: aHeure(c.date_fin, -7),
    });
  }

  // Alerte immédiate, une seule fois par situation (nouvelle vente ou nouveau relevé = nouvelle situation).
  for (const s of d.stocks) {
    // Pas d'alerte pour un locataire qui n'a encore jamais acheté d'électricité prépayée.
    if (s.etat === 'ok' || s.achetes === 0) continue;
    rappels.push({
      cle: `kwh-${s.contrat_id}-${s.etat}-${s.achetes}-${s.consommes}`,
      type: 'electricite',
      titre: `Électricité : ${LIBELLES_STOCK[s.etat].toLowerCase()}`,
      corps: `${s.locataire_nom} : ${String(s.stock).replace('.', ',')} kWh`,
      date: new Date(maintenant.getTime() + 5000),
    });
  }

  const moisSuivant = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1, 10, 0, 0, 0);
  rappels.push({
    cle: `sauvegarde-${moisSuivant.getFullYear()}-${String(moisSuivant.getMonth() + 1).padStart(2, '0')}`,
    type: 'sauvegarde',
    titre: 'Pensez à sauvegarder vos données',
    corps: 'Paramètres → Sauvegarde : exportez une copie et gardez-la hors du téléphone.',
    date: moisSuivant,
  });

  return rappels;
}

/* ---------- Alertes en cours (page Notifications) ---------- */

export type GraviteAlerte = 'urgent' | 'attention' | 'info';

export interface Alerte {
  cle: string;
  type: RappelSouhaite['type'];
  gravite: GraviteAlerte;
  titre: string;
  detail: string;
  /** Jour de référence AAAA-MM-JJ (échéance, fin de contrat…), pour le tri. */
  jour: string;
}

/** Nombre de jours de `de` à `a` (dates AAAA-MM-JJ). */
export function ecartJours(de: string, a: string): number {
  const t = (j: string) => Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10)));
  return Math.round((t(a) - t(de)) / 86_400_000);
}

const ORDRE: Record<GraviteAlerte, number> = { urgent: 0, attention: 1, info: 2 };
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Ce qui demande l'attention du propriétaire aujourd'hui : loyers en retard ou proches, fins de contrat
 * dans les 30 jours, stocks d'électricité, sauvegarde absente ou vieille de plus de 30 jours.
 */
export function alertesEnCours(d: DonneesRappels & { derniereSauvegarde: string | null }, jour: string): Alerte[] {
  const alertes: Alerte[] = [];

  for (const e of d.echeancesImpayees) {
    const ecart = ecartJours(jour, e.date_echeance);
    const qui = `${e.locataire_nom} · ${e.logement_reference}`;
    if (ecart < 0) {
      alertes.push({
        cle: `loyer-${e.id}`,
        type: 'loyer',
        gravite: 'urgent',
        titre: `Loyer en retard de ${pluriel(-ecart, 'jour')}`,
        detail: `${qui} : ${formatFCFA(e.reste)} à percevoir`,
        jour: e.date_echeance,
      });
    } else if (ecart <= 3) {
      alertes.push({
        cle: `loyer-${e.id}`,
        type: 'loyer',
        gravite: 'attention',
        titre: ecart === 0 ? 'Loyer à percevoir aujourd’hui' : `Loyer attendu dans ${pluriel(ecart, 'jour')}`,
        detail: `${qui} : ${formatFCFA(e.reste)}`,
        jour: e.date_echeance,
      });
    }
  }

  for (const c of d.contratsAvecFin) {
    const ecart = ecartJours(jour, c.date_fin);
    if (ecart > 30) continue;
    alertes.push({
      cle: `fin-${c.id}`,
      type: 'fin_contrat',
      gravite: ecart <= 7 ? 'urgent' : 'attention',
      titre: ecart < 0 ? 'Contrat arrivé à échéance' : ecart === 0 ? 'Le contrat se termine aujourd’hui' : `Fin de contrat dans ${pluriel(ecart, 'jour')}`,
      detail: `${c.locataire_nom} · ${c.logement_reference}`,
      jour: c.date_fin,
    });
  }

  for (const s of d.stocks) {
    if (s.etat === 'ok' || s.achetes === 0) continue;
    alertes.push({
      cle: `kwh-${s.contrat_id}`,
      type: 'electricite',
      gravite: s.etat === 'bas' ? 'attention' : 'urgent',
      titre: `Électricité : ${LIBELLES_STOCK[s.etat].toLowerCase()}`,
      detail: `${s.locataire_nom} : ${String(s.stock).replace('.', ',')} kWh restants`,
      jour,
    });
  }

  const ancienne = d.derniereSauvegarde ? ecartJours(d.derniereSauvegarde.slice(0, 10), jour) : null;
  if (ancienne === null || ancienne > 30) {
    alertes.push({
      cle: 'sauvegarde',
      type: 'sauvegarde',
      gravite: 'info',
      titre: ancienne === null ? 'Aucune sauvegarde de vos données' : `Dernière sauvegarde il y a ${ancienne} jours`,
      detail: 'Exportez une copie chiffrée et gardez-la hors du téléphone.',
      jour,
    });
  }

  return alertes.sort((a, b) => ORDRE[a.gravite] - ORDRE[b.gravite] || a.jour.localeCompare(b.jour));
}
