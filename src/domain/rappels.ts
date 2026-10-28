/**
 * Rappels à programmer (cahier des charges, section 13), calculés à partir des données — sans module natif.
 * Chaque rappel a une clé unique : un même événement ne produit jamais deux notifications.
 */
import { formatFCFA } from './format';
import { ajouterJours, LIBELLES_STOCK, type EtatStock } from './electricite';

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
  stocks: {
    contrat_id: number;
    etat: EtatStock;
    stock: number;
    locataire_nom: string;
    achetes: number;
    consommes: number;
    index_coupure?: number;
    epuisement_estime?: string | null;
    dernier_releve_le?: string | null;
  }[];
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
    const montant = `${formatFCFA(e.reste)} (${e.logement_reference})`;
    const qui = e.locataire_nom;
    futur({ cle: `loyer-${e.id}-j-3`, type: 'loyer', titre: qui, corps: `Loyer de ${montant} attendu dans 3 jours.`, date: aHeure(e.date_echeance, -3) });
    futur({ cle: `loyer-${e.id}-j`, type: 'loyer', titre: qui, corps: `Loyer de ${montant} attendu aujourd’hui.`, date: aHeure(e.date_echeance) });
    futur({ cle: `loyer-${e.id}-j+3`, type: 'loyer', titre: qui, corps: `Loyer de ${montant} toujours pas réglé, 3 jours après l’échéance.`, date: aHeure(e.date_echeance, 3) });
  }

  for (const c of d.contratsAvecFin) {
    futur({
      cle: `fin-${c.id}-${c.date_fin}`,
      type: 'fin_contrat',
      titre: c.locataire_nom,
      corps: `Son contrat (${c.logement_reference}) se termine dans 7 jours.`,
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
      titre: s.locataire_nom,
      corps:
        s.etat === 'bas'
          ? `Plus que ${String(s.stock).replace('.', ',')} kWh d’électricité.`
          : s.etat === 'epuise'
            ? 'Crédit d’électricité épuisé.'
            : `Électricité consommée sans crédit : ${String(-s.stock).replace('.', ',')} kWh.`,
      date: new Date(maintenant.getTime() + 5000),
    });
  }

  // Contrôle du compteur : la veille et le jour de l'épuisement estimé (nouvelle vente = nouvelle estimation).
  const kwh = (n: number) => String(n).replace('.', ',');
  for (const s of d.stocks) {
    if (s.achetes === 0 || s.stock <= 0 || !s.epuisement_estime) continue;
    const coupure = s.index_coupure !== undefined ? ` Index de coupure : ${kwh(s.index_coupure)}.` : '';
    const base = `kwh-verif-${s.contrat_id}-${s.achetes}-${s.consommes}`;
    futur({
      cle: `${base}-j-1`,
      type: 'electricite',
      titre: s.locataire_nom,
      corps: `Son crédit d’électricité devrait s’épuiser demain.${coupure}`,
      date: aHeure(s.epuisement_estime, -1, 18),
    });
    futur({
      cle: `${base}-j`,
      type: 'electricite',
      titre: s.locataire_nom,
      corps: `Son crédit d’électricité devrait s’épuiser aujourd’hui : passez voir le compteur.${coupure}`,
      date: aHeure(s.epuisement_estime),
    });
  }

  // Sans relevé depuis 7 jours, on ne peut plus estimer : rappel d'aller relever le compteur.
  for (const s of d.stocks) {
    if (s.achetes === 0 || s.stock <= 0 || !s.dernier_releve_le) continue;
    futur({
      cle: `releve-${s.contrat_id}-${s.dernier_releve_le}`,
      type: 'electricite',
      titre: s.locataire_nom,
      corps: 'Pas de relevé de compteur depuis une semaine.',
      date: aHeure(ajouterJours(s.dernier_releve_le, 7)),
    });
  }

  const moisSuivant = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1, 10, 0, 0, 0);
  rappels.push({
    cle: `sauvegarde-${moisSuivant.getFullYear()}-${String(moisSuivant.getMonth() + 1).padStart(2, '0')}`,
    type: 'sauvegarde',
    titre: 'Onílé',
    corps: 'C’est le moment de sauvegarder vos données : si le téléphone est perdu ou volé, la sauvegarde est le seul moyen de tout récupérer. Touchez ici.',
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
  /** Locataire concerné (null pour un conseil général). */
  qui: string | null;
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
    const qui = e.locataire_nom;
    if (ecart < 0) {
      alertes.push({
        cle: `loyer-${e.id}`,
        type: 'loyer',
        gravite: 'urgent',
        titre: `Loyer en retard de ${pluriel(-ecart, 'jour')}`,
        qui,
        detail: `${formatFCFA(e.reste)} · ${e.logement_reference}`,
        jour: e.date_echeance,
      });
    } else if (ecart <= 3) {
      alertes.push({
        cle: `loyer-${e.id}`,
        type: 'loyer',
        gravite: 'attention',
        titre: ecart === 0 ? 'Loyer à percevoir aujourd’hui' : `Loyer attendu dans ${pluriel(ecart, 'jour')}`,
        qui,
        detail: `${formatFCFA(e.reste)} · ${e.logement_reference}`,
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
      qui: c.locataire_nom,
      detail: c.logement_reference,
      jour: c.date_fin,
    });
  }

  for (const s of d.stocks) {
    if (s.etat === 'ok' && s.achetes > 0 && s.epuisement_estime) {
      const reste = ecartJours(jour, s.epuisement_estime);
      if (reste <= 2) {
        alertes.push({
          cle: `kwh-${s.contrat_id}`,
          type: 'electricite',
          gravite: 'attention',
          titre: reste <= 0 ? 'Électricité : crédit estimé épuisé' : `Électricité : épuisement estimé dans ${pluriel(reste, 'jour')}`,
          qui: s.locataire_nom,
          detail: s.index_coupure !== undefined ? `Coupure à l’index ${String(s.index_coupure).replace('.', ',')}` : '',
          jour: s.epuisement_estime,
        });
      }
      continue;
    }
    if (s.etat === 'ok' || s.achetes === 0) continue;
    alertes.push({
      cle: `kwh-${s.contrat_id}`,
      type: 'electricite',
      gravite: s.etat === 'bas' ? 'attention' : 'urgent',
      titre: `Électricité : ${LIBELLES_STOCK[s.etat].toLowerCase()}`,
      qui: s.locataire_nom,
      detail: `${String(s.stock).replace('.', ',')} kWh restants${
        s.index_coupure !== undefined ? ` · coupure à l’index ${String(s.index_coupure).replace('.', ',')}` : ''
      }`,
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
      qui: null,
      detail: 'Exportez une copie et gardez-la hors du téléphone.',
      jour,
    });
  }

  return alertes.sort((a, b) => ORDRE[a.gravite] - ORDRE[b.gravite] || a.jour.localeCompare(b.jour));
}
