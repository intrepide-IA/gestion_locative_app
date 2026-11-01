/**
 * Rappels à programmer (cahier des charges, section 13), calculés à partir des données — sans module natif.
 * Chaque rappel a une clé unique : un même événement ne produit jamais deux notifications.
 */
import { formatDate, formatFCFA, formatMois } from './format';
import { ajouterJours, LIBELLES_STOCK, type EtatStock } from './electricite';

export interface RappelSouhaite {
  cle: string;
  type: 'loyer' | 'fin_contrat' | 'electricite' | 'sauvegarde';
  titre: string;
  corps: string;
  date: Date;
}

export interface DonneesRappels {
  echeancesImpayees: {
    id: number;
    date_echeance: string;
    reste: number;
    locataire_nom: string;
    logement_reference: string;
    contrat_id?: number;
    locataire_id?: number;
    montant_du?: number;
    annee?: number;
    mois?: number;
  }[];
  contratsAvecFin: { id: number; date_fin: string; locataire_nom: string; logement_reference: string; locataire_id?: number }[];
  stocks: {
    contrat_id: number;
    locataire_id?: number;
    logement_reference?: string;
    prix_kwh?: number;
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

  // Chaque 1er du mois à 10 h, programmé 3 mois à l'avance : le rappel arrive même si l'application
  // n'est pas ouverte pendant un moment. Libre à la personne de l'ignorer.
  for (let n = 1; n <= 3; n++) {
    const mois = new Date(maintenant.getFullYear(), maintenant.getMonth() + n, 1, 10, 0, 0, 0);
    rappels.push({
      cle: `sauvegarde-${mois.getFullYear()}-${String(mois.getMonth() + 1).padStart(2, '0')}`,
      type: 'sauvegarde',
      titre: 'Sauvegarde du mois',
      corps: 'Téléphone perdu, volé ou en panne : sans sauvegarde, vos données sont perdues. Faites votre sauvegarde du mois. Touchez ici.',
      date: mois,
    });
  }

  return rappels;
}

/* ---------- Alertes en cours (page Notifications) ---------- */

export type GraviteAlerte = 'urgent' | 'attention' | 'info';
export type TypeAlerte = RappelSouhaite['type'] | 'mise_a_jour';

export interface Alerte {
  cle: string;
  type: TypeAlerte;
  gravite: GraviteAlerte;
  /** Locataire concerné (null pour un conseil général). */
  qui: string | null;
  titre: string;
  /** Résumé court : montant, chambre… */
  detail: string;
  /** Explication complète : ce qui se passe et ce qu'il faut faire. */
  description: string;
  /** Jour de référence AAAA-MM-JJ (échéance, fin de contrat…), pour le tri. */
  jour: string;
  /** Pour ouvrir directement la fiche ou le compteur concernés. */
  locataireId?: number;
  contratId?: number;
}

/** Nombre de jours de `de` à `a` (dates AAAA-MM-JJ). */
export function ecartJours(de: string, a: string): number {
  const t = (j: string) => Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10)));
  return Math.round((t(a) - t(de)) / 86_400_000);
}

const ORDRE: Record<GraviteAlerte, number> = { urgent: 0, attention: 1, info: 2 };
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const kwh = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} kWh`;
const prenom = (nom: string) => nom.trim().split(/\s+/)[0];

/**
 * Ce qui demande l'attention du propriétaire aujourd'hui : loyers en retard ou proches, fins de contrat
 * dans les 30 jours, stocks d'électricité, sauvegarde absente ou vieille de plus de 30 jours.
 */
export function alertesEnCours(d: DonneesRappels & { derniereSauvegarde: string | null }, jour: string): Alerte[] {
  const alertes: Alerte[] = [];

  for (const e of d.echeancesImpayees) {
    const ecart = ecartJours(jour, e.date_echeance);
    const qui = e.locataire_nom;
    const leLoyer = e.mois && e.annee ? `Le loyer de ${formatMois(e.mois, e.annee)}` : 'Le loyer';
    const dejaVerse = e.montant_du && e.montant_du > e.reste ? ` ${formatFCFA(e.montant_du - e.reste)} déjà versés sur ${formatFCFA(e.montant_du)}.` : '';
    const commun = { qui, locataireId: e.locataire_id, contratId: e.contrat_id, jour: e.date_echeance, detail: `${formatFCFA(e.reste)} · ${e.logement_reference}` };
    if (ecart < 0) {
      alertes.push({
        ...commun,
        cle: `loyer-${e.id}`,
        type: 'loyer',
        gravite: 'urgent',
        titre: `Loyer en retard de ${pluriel(-ecart, 'jour')}`,
        description: `${leLoyer} (${e.logement_reference}) était attendu le ${formatDate(e.date_echeance)}. Il reste ${formatFCFA(e.reste)} à payer.${dejaVerse} Relancez ${prenom(qui)} ou encaissez le paiement depuis sa fiche.`,
      });
    } else if (ecart <= 3) {
      alertes.push({
        ...commun,
        cle: `loyer-${e.id}`,
        type: 'loyer',
        gravite: 'attention',
        titre: ecart === 0 ? 'Loyer à percevoir aujourd’hui' : `Loyer attendu dans ${pluriel(ecart, 'jour')}`,
        description: `${leLoyer} (${e.logement_reference}) est attendu le ${formatDate(e.date_echeance)} : ${formatFCFA(e.reste)}.${dejaVerse} Vous pouvez envoyer un petit rappel à ${prenom(qui)} sur WhatsApp.`,
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
      description:
        ecart < 0
          ? `Le contrat de ${c.locataire_nom} pour ${c.logement_reference} a pris fin le ${formatDate(c.date_fin)}. Prolongez-le, ou enregistrez la sortie avec l’état des lieux.`
          : `Le contrat de ${c.locataire_nom} pour ${c.logement_reference} se termine le ${formatDate(c.date_fin)}. Voyez avec ${prenom(c.locataire_nom)} s’il renouvelle, sinon préparez l’état des lieux de sortie.`,
      jour: c.date_fin,
      locataireId: c.locataire_id,
      contratId: c.id,
    });
  }

  for (const s of d.stocks) {
    const ou = s.logement_reference ? ` (${s.logement_reference})` : '';
    const coupure = s.index_coupure !== undefined ? ` Coupure à l’index ${String(s.index_coupure).replace('.', ',')}.` : '';
    const commun = { qui: s.locataire_nom, locataireId: s.locataire_id, contratId: s.contrat_id };
    if (s.etat === 'ok' && s.achetes > 0 && s.epuisement_estime) {
      const reste = ecartJours(jour, s.epuisement_estime);
      if (reste <= 2) {
        alertes.push({
          ...commun,
          cle: `kwh-${s.contrat_id}`,
          type: 'electricite',
          gravite: 'attention',
          titre: reste <= 0 ? 'Électricité : crédit estimé épuisé' : `Électricité : épuisement estimé dans ${pluriel(reste, 'jour')}`,
          detail: s.index_coupure !== undefined ? `Coupure à l’index ${String(s.index_coupure).replace('.', ',')}` : '',
          description: `D’après sa consommation, le crédit de ${s.locataire_nom}${ou} devrait finir ${
            reste <= 0 ? 'aujourd’hui' : `le ${formatDate(s.epuisement_estime)}`
          } (${kwh(s.stock)} restants au dernier relevé).${coupure} Passez relever le compteur ou prévenez votre locataire.`,
          jour: s.epuisement_estime,
        });
      }
      continue;
    }
    if (s.etat === 'ok' || s.achetes === 0) continue;
    const du = s.etat === 'deficit' && s.prix_kwh ? Math.ceil(-s.stock * s.prix_kwh) : 0;
    alertes.push({
      ...commun,
      cle: `kwh-${s.contrat_id}`,
      type: 'electricite',
      gravite: s.etat === 'bas' ? 'attention' : 'urgent',
      titre: `Électricité : ${LIBELLES_STOCK[s.etat].toLowerCase()}`,
      detail: `${kwh(s.stock)} restants${s.index_coupure !== undefined ? ` · coupure à l’index ${String(s.index_coupure).replace('.', ',')}` : ''}`,
      description:
        s.etat === 'bas'
          ? `Il ne reste que ${kwh(s.stock)} à ${s.locataire_nom}${ou} sur ${kwh(s.achetes)} achetés.${coupure} Prévenez votre locataire pour qu’une recharge soit faite à temps.`
          : s.etat === 'epuise'
            ? `Le crédit d’électricité de ${s.locataire_nom}${ou} est épuisé.${coupure} Une recharge est nécessaire avant de continuer à consommer.`
            : `${s.locataire_nom}${ou} a consommé ${kwh(-s.stock)} de plus que ce qui a été payé${du ? `, soit ${formatFCFA(du)} à régler` : ''}.${coupure} Envoyez-lui l’avis d’électricité depuis le compteur.`,
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
      description: `${
        ancienne === null ? 'Vous n’avez encore jamais sauvegardé vos données.' : `Votre dernière sauvegarde date du ${formatDate(d.derniereSauvegarde!.slice(0, 10))}.`
      } Si le téléphone est perdu, volé ou en panne, la sauvegarde est le seul moyen de tout récupérer. Envoyez-la sur WhatsApp à vous-même ou sur Google Drive.`,
      jour,
    });
  }

  return alertes.sort((a, b) => ORDRE[a.gravite] - ORDRE[b.gravite] || a.jour.localeCompare(b.jour));
}

/* ---------- Situation de chaque contrat (indicateurs des logements et locataires) ---------- */

export type NiveauSituation = 'ok' | 'attention' | 'retard';

export interface SituationContrat {
  niveau: NiveauSituation;
  loyer: { niveau: NiveauSituation; enRetard: number; joursRetard: number; prochain: { montant: number; dans: number } | null } | null;
  electricite: { niveau: NiveauSituation; etat: EtatStock; stock: number; montantDu: number } | null;
}

const PIRE: Record<NiveauSituation, number> = { ok: 0, attention: 1, retard: 2 };
const pire = (...n: (NiveauSituation | undefined)[]): NiveauSituation =>
  n.reduce<NiveauSituation>((a, b) => (b && PIRE[b] > PIRE[a] ? b : a), 'ok');

/**
 * Pour chaque contrat actif : loyer (à jour, échéance dans 5 jours, en retard) et électricité
 * (suffisante, bientôt épuisée, épuisée ou consommée sans payer). Sert aux pastilles de couleur.
 */
export function situationsDesContrats(
  d: Pick<DonneesRappels, 'echeancesImpayees' | 'stocks'>,
  contratsLoyer: number[],
  jour: string
): Map<number, SituationContrat> {
  const resultat = new Map<number, SituationContrat>();
  const obtenir = (id: number) => {
    let s = resultat.get(id);
    if (!s) resultat.set(id, (s = { niveau: 'ok', loyer: null, electricite: null }));
    return s;
  };
  for (const id of contratsLoyer) obtenir(id).loyer = { niveau: 'ok', enRetard: 0, joursRetard: 0, prochain: null };
  for (const e of d.echeancesImpayees) {
    if (e.contrat_id === undefined) continue;
    const s = obtenir(e.contrat_id);
    const l = (s.loyer ??= { niveau: 'ok', enRetard: 0, joursRetard: 0, prochain: null });
    const ecart = ecartJours(jour, e.date_echeance);
    if (ecart < 0) {
      l.enRetard += e.reste;
      l.joursRetard = Math.max(l.joursRetard, -ecart);
      l.niveau = 'retard';
    } else if (ecart <= 5 && (!l.prochain || ecart < l.prochain.dans)) {
      l.prochain = { montant: e.reste, dans: ecart };
      if (l.niveau === 'ok') l.niveau = 'attention';
    }
  }
  for (const st of d.stocks) {
    if (st.achetes === 0) continue;
    const bientot = st.etat === 'ok' && st.epuisement_estime ? ecartJours(jour, st.epuisement_estime) <= 2 : false;
    obtenir(st.contrat_id).electricite = {
      niveau: st.etat === 'epuise' || st.etat === 'deficit' ? 'retard' : st.etat === 'bas' || bientot ? 'attention' : 'ok',
      etat: st.etat,
      stock: st.stock,
      montantDu: st.etat === 'deficit' && st.prix_kwh ? Math.ceil(-st.stock * st.prix_kwh) : 0,
    };
  }
  for (const s of resultat.values()) s.niveau = pire(s.loyer?.niveau, s.electricite?.niveau);
  return resultat;
}
