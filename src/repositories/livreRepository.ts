/**
 * Livre de tenue de la maison : tout l'historique d'une période, chambre par chambre
 * (occupants, échéances, paiements), situations irrégulières, électricité et finances.
 * Sert au PDF (livre relié) et au classeur Excel.
 */
import type { SqlDatabase } from '../db/types';
import { situationsDesContrats } from '../domain/rappels';
import { listerSituationsElectricite } from './electriciteRepository';
import { soldeTresorerie } from './financesRepository';
import { genererEcheances } from './loyerRepository';

export interface PeriodeLivre {
  debut: string;
  fin: string;
  libelle: string;
}

export interface OccupantLivre {
  contrat_id: number;
  nom: string;
  telephone: string | null;
  date_debut: string;
  date_fin: string | null;
  date_sortie: string | null;
  loyer: number;
  caution: number;
  statut: 'actif' | 'termine';
}

export interface EcheanceLivre {
  contrat_id: number;
  locataire: string;
  annee: number;
  mois: number;
  date_echeance: string;
  du: number;
  paye: number;
  reste: number;
  statut: 'Payé' | 'Partiel' | 'Impayé' | 'À venir';
}

export interface PaiementLivre {
  id: number;
  date: string;
  locataire: string;
  chambre: string;
  montant: number;
  mode: string;
  reference: string | null;
  /** Mois réglés par ce paiement, ex. « oct. 2026, nov. 2026 ». */
  periodes: { annee: number; mois: number }[];
}

export interface ChambreLivre {
  id: number;
  reference: string;
  type: string;
  loyer_indicatif: number;
  archive: boolean;
  occupants: OccupantLivre[];
  echeances: EcheanceLivre[];
  paiements: PaiementLivre[];
  totalDu: number;
  totalPaye: number;
  /** Reste dû aujourd'hui (échéances passées non réglées). */
  impaye: number;
  situation: 'ok' | 'attention' | 'retard' | 'libre';
}

export interface IrregulariteLivre {
  chambre: string;
  locataire: string;
  nature: string;
  detail: string;
  montant: number;
}

export interface AchatElectriciteLivre {
  date: string;
  client: string;
  chambre: string;
  kwh: number;
  montant: number;
  mode: string;
}

export interface MouvementLivre {
  date: string;
  sens: 'entree' | 'sortie';
  categorie: string;
  description: string;
  chambre: string | null;
  montant: number;
  mode: string;
}

export interface LivreDeTenue {
  maison: string;
  proprietaire: { nom: string; telephone: string | null; adresse: string | null };
  periode: PeriodeLivre;
  genereLe: string;
  synthese: {
    chambres: number;
    occupees: number;
    locatairesActifs: number;
    loyersAttendus: number;
    loyersEncaisses: number;
    tauxRecouvrement: number;
    impayesAujourdhui: number;
    electriciteKwh: number;
    electriciteMontant: number;
    entrees: number;
    sorties: number;
    soldeDebut: number;
    soldeFin: number;
  };
  parMois: { annee: number; mois: number; attendu: number; encaisse: number; depenses: number }[];
  chambres: ChambreLivre[];
  paiements: PaiementLivre[];
  irregularites: IrregulariteLivre[];
  electricite: AchatElectriciteLivre[];
  mouvements: MouvementLivre[];
}

const MODES: Record<string, string> = { especes: 'Espèces', mobile_money: 'Mobile Money', virement: 'Virement', autre: 'Autre' };
const TYPES: Record<string, string> = { entree_couchee: 'Entrée-couchée', chambre_salon: 'Chambre-salon', autre: 'Autre' };

/** Mois de la période, du premier au dernier. */
function moisDe(debut: string, fin: string): { annee: number; mois: number }[] {
  const r: { annee: number; mois: number }[] = [];
  let a = Number(debut.slice(0, 4));
  let m = Number(debut.slice(5, 7));
  const af = Number(fin.slice(0, 4));
  const mf = Number(fin.slice(5, 7));
  while (a < af || (a === af && m <= mf)) {
    r.push({ annee: a, mois: m });
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return r;
}

/** Périodes proposées : cette année, l'an dernier, 12 derniers mois, depuis le début. */
export async function periodesLivre(db: SqlDatabase, jour: string): Promise<PeriodeLivre[]> {
  const annee = Number(jour.slice(0, 4));
  const premier = await db.get<{ d: string | null }>(
    `SELECT MIN(d) AS d FROM (SELECT MIN(date_debut) AS d FROM contrats UNION ALL SELECT MIN(date_operation) FROM mouvements_financiers)`
  );
  const ilYaUnAn = `${annee - 1}-${jour.slice(5, 7)}-01`;
  return [
    { debut: `${annee}-01-01`, fin: jour, libelle: `Année ${annee}` },
    { debut: `${annee - 1}-01-01`, fin: `${annee - 1}-12-31`, libelle: `Année ${annee - 1}` },
    { debut: ilYaUnAn, fin: jour, libelle: '12 derniers mois' },
    { debut: premier?.d ?? `${annee}-01-01`, fin: jour, libelle: 'Depuis le début' },
  ];
}

export async function donneesLivre(db: SqlDatabase, maison: string, periode: PeriodeLivre, jour: string): Promise<LivreDeTenue> {
  await genererEcheances(db, jour);
  const { debut, fin } = periode;
  const proprietaire = (await db.get<LivreDeTenue['proprietaire']>('SELECT nom, telephone, adresse FROM proprietaire WHERE id = 1')) ?? {
    nom: '',
    telephone: null,
    adresse: null,
  };

  const logements = await db.all<{ id: number; reference: string; type: string; loyer_indicatif: number; archive: number }>(
    `SELECT id, reference, type, loyer_indicatif + toilettes AS loyer_indicatif, archive FROM logements WHERE usage = 'location' ORDER BY reference`
  );
  const contrats = await db.all<OccupantLivre & { logement_id: number }>(
    `SELECT c.id AS contrat_id, c.logement_id, t.nom_complet AS nom, t.telephone, c.date_debut, c.date_fin, c.date_sortie,
            c.loyer + c.toilettes AS loyer, c.caution, c.statut
     FROM contrats c JOIN locataires t ON t.id = c.locataire_id
     WHERE c.type = 'bail' AND c.date_debut <= ? AND (c.date_sortie IS NULL OR c.date_sortie >= ?)
     ORDER BY c.date_debut`,
    [fin, debut]
  );
  const echeances = await db.all<Omit<EcheanceLivre, 'statut' | 'reste'> & { logement_id: number }>(
    `SELECT e.contrat_id, c.logement_id, t.nom_complet AS locataire, e.annee, e.mois, e.date_echeance, e.montant_du AS du,
            COALESCE((SELECT SUM(a.montant) FROM affectations a JOIN paiements p ON p.id = a.paiement_id
                      WHERE a.echeance_id = e.id AND p.annule_le IS NULL), 0) AS paye
     FROM echeances e JOIN contrats c ON c.id = e.contrat_id JOIN locataires t ON t.id = c.locataire_id
     WHERE c.type = 'bail' AND e.date_echeance BETWEEN ? AND ?
     ORDER BY e.date_echeance`,
    [debut, fin]
  );
  const paiementsBruts = await db.all<{
    id: number;
    date: string;
    locataire: string;
    montant: number;
    mode: string;
    reference: string | null;
    chambre: string | null;
    logement_id: number | null;
  }>(
    `SELECT p.id, p.date_paiement AS date, t.nom_complet AS locataire, p.montant, p.mode, p.reference,
            (SELECT l.reference FROM affectations a JOIN echeances e ON e.id = a.echeance_id JOIN contrats c ON c.id = e.contrat_id
               JOIN logements l ON l.id = c.logement_id WHERE a.paiement_id = p.id LIMIT 1) AS chambre,
            (SELECT c.logement_id FROM affectations a JOIN echeances e ON e.id = a.echeance_id JOIN contrats c ON c.id = e.contrat_id
               WHERE a.paiement_id = p.id LIMIT 1) AS logement_id
     FROM paiements p JOIN locataires t ON t.id = p.locataire_id
     WHERE p.annule_le IS NULL AND p.date_paiement BETWEEN ? AND ?
     ORDER BY p.date_paiement, p.id`,
    [debut, fin]
  );
  const affectations = await db.all<{ paiement_id: number; annee: number; mois: number }>(
    `SELECT a.paiement_id, e.annee, e.mois FROM affectations a JOIN echeances e ON e.id = a.echeance_id
     JOIN paiements p ON p.id = a.paiement_id WHERE p.annule_le IS NULL AND p.date_paiement BETWEEN ? AND ?
     ORDER BY e.annee, e.mois`,
    [debut, fin]
  );
  const paiements: (PaiementLivre & { logement_id: number | null })[] = paiementsBruts.map((p) => ({
    ...p,
    chambre: p.chambre ?? '—',
    mode: MODES[p.mode] ?? p.mode,
    periodes: affectations.filter((a) => a.paiement_id === p.id).map(({ annee, mois }) => ({ annee, mois })),
  }));

  // Situation actuelle (retards de loyer, électricité), pour les irrégularités et les pastilles.
  const impayes = await db.all<{
    id: number;
    contrat_id: number;
    date_echeance: string;
    reste: number;
    locataire_nom: string;
    logement_reference: string;
  }>(
    `SELECT e.id, e.contrat_id, e.date_echeance, e.montant_du - COALESCE(pe.paye, 0) AS reste, t.nom_complet AS locataire_nom, l.reference AS logement_reference
     FROM echeances e JOIN contrats c ON c.id = e.contrat_id JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id
     LEFT JOIN (SELECT a.echeance_id, SUM(a.montant) AS paye FROM affectations a JOIN paiements p ON p.id = a.paiement_id
                WHERE p.annule_le IS NULL GROUP BY a.echeance_id) pe ON pe.echeance_id = e.id
     WHERE c.statut = 'actif' AND e.montant_du - COALESCE(pe.paye, 0) > 0`
  );
  const stocks = await listerSituationsElectricite(db);
  const actifs = contrats.filter((c) => c.statut === 'actif').map((c) => c.contrat_id);
  const situations = situationsDesContrats({ echeancesImpayees: impayes, stocks }, actifs, jour);

  const chambres: ChambreLivre[] = logements.map((l) => {
    const occupants = contrats.filter((c) => c.logement_id === l.id).map(({ logement_id: _, ...c }) => c);
    const ech: EcheanceLivre[] = echeances
      .filter((e) => e.logement_id === l.id)
      .map(({ logement_id: _, ...e }) => {
        const reste = e.du - e.paye;
        const statut: EcheanceLivre['statut'] = reste <= 0 ? 'Payé' : e.date_echeance > jour ? 'À venir' : e.paye > 0 ? 'Partiel' : 'Impayé';
        return { ...e, reste: Math.max(0, reste), statut };
      });
    const actuel = occupants.find((o) => o.statut === 'actif');
    return {
      id: l.id,
      reference: l.reference,
      type: TYPES[l.type] ?? l.type,
      loyer_indicatif: l.loyer_indicatif,
      archive: l.archive === 1,
      occupants,
      echeances: ech,
      paiements: paiements.filter((p) => p.logement_id === l.id),
      totalDu: ech.reduce((s, e) => s + e.du, 0),
      totalPaye: ech.reduce((s, e) => s + e.paye, 0),
      impaye: ech.filter((e) => e.statut === 'Impayé' || e.statut === 'Partiel').reduce((s, e) => s + e.reste, 0),
      situation: actuel ? (situations.get(actuel.contrat_id)?.niveau ?? 'ok') : 'libre',
    };
  });

  const irregularites: IrregulariteLivre[] = [];
  for (const [contratId, s] of situations) {
    const occupant = contrats.find((c) => c.contrat_id === contratId);
    const chambre = logements.find((l) => l.id === occupant?.logement_id)?.reference ?? '';
    if (occupant && s.loyer?.niveau === 'retard') {
      irregularites.push({
        chambre,
        locataire: occupant.nom,
        nature: 'Loyer impayé',
        detail: `Retard de ${s.loyer.joursRetard} jour(s)`,
        montant: s.loyer.enRetard,
      });
    }
    if (s.electricite && s.electricite.niveau === 'retard') {
      const st = stocks.find((x) => x.contrat_id === contratId);
      irregularites.push({
        chambre: st?.logement_reference ?? chambre,
        locataire: st?.locataire_nom ?? occupant?.nom ?? '',
        nature: s.electricite.etat === 'deficit' ? 'Électricité consommée non payée' : 'Crédit d’électricité épuisé',
        detail: `${String(Math.round(s.electricite.stock * 10) / 10).replace('.', ',')} kWh`,
        montant: s.electricite.montantDu,
      });
    }
  }
  irregularites.sort((a, b) => b.montant - a.montant);

  const electricite = (
    await db.all<AchatElectriciteLivre>(
      `SELECT a.date_achat AS date, t.nom_complet AS client, l.reference AS chambre, a.kwh, a.montant_facture AS montant, a.mode
       FROM achats_electricite a JOIN contrats c ON c.id = a.contrat_id JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id
       WHERE a.annule_le IS NULL AND a.date_achat BETWEEN ? AND ? ORDER BY a.date_achat`,
      [debut, fin]
    )
  ).map((a) => ({ ...a, mode: MODES[a.mode] ?? a.mode }));

  const mouvements = (
    await db.all<MouvementLivre>(
      `SELECT m.date_operation AS date, m.sens, k.nom AS categorie, COALESCE(m.description, '') AS description, l.reference AS chambre,
              m.montant, COALESCE(m.mode, '') AS mode
       FROM mouvements_financiers m JOIN categories_financieres k ON k.id = m.categorie_id LEFT JOIN logements l ON l.id = m.logement_id
       WHERE m.statut = 'valide' AND m.date_operation BETWEEN ? AND ? ORDER BY m.date_operation, m.id`,
      [debut, fin]
    )
  ).map((m) => ({ ...m, mode: MODES[m.mode] ?? m.mode }));

  const loyersAttendus = echeances.filter((e) => e.date_echeance <= jour).reduce((s, e) => s + e.du, 0);
  const loyersEncaisses = paiements.reduce((s, p) => s + p.montant, 0);
  const regleSurAttendus = echeances.filter((e) => e.date_echeance <= jour).reduce((s, e) => s + Math.min(e.paye, e.du), 0);
  const entrees = mouvements.filter((m) => m.sens === 'entree').reduce((s, m) => s + m.montant, 0);
  const sorties = mouvements.filter((m) => m.sens === 'sortie').reduce((s, m) => s + m.montant, 0);
  const veille = new Date(Date.UTC(Number(debut.slice(0, 4)), Number(debut.slice(5, 7)) - 1, Number(debut.slice(8, 10)) - 1))
    .toISOString()
    .slice(0, 10);

  const parMois = moisDe(debut, fin).map(({ annee, mois }) => {
    const ym = `${annee}-${String(mois).padStart(2, '0')}`;
    return {
      annee,
      mois,
      attendu: echeances.filter((e) => e.date_echeance.startsWith(ym)).reduce((s, e) => s + e.du, 0),
      encaisse: paiements.filter((p) => p.date.startsWith(ym)).reduce((s, p) => s + p.montant, 0),
      depenses: mouvements.filter((m) => m.sens === 'sortie' && m.date.startsWith(ym)).reduce((s, m) => s + m.montant, 0),
    };
  });

  return {
    maison,
    proprietaire,
    periode,
    genereLe: jour,
    synthese: {
      chambres: logements.filter((l) => !l.archive).length,
      occupees: chambres.filter((c) => c.situation !== 'libre').length,
      locatairesActifs: actifs.length,
      loyersAttendus,
      loyersEncaisses,
      tauxRecouvrement: loyersAttendus ? Math.round((regleSurAttendus / loyersAttendus) * 100) : 100,
      impayesAujourdhui: irregularites.filter((i) => i.nature === 'Loyer impayé').reduce((s, i) => s + i.montant, 0),
      electriciteKwh: Math.round(electricite.reduce((s, a) => s + a.kwh, 0) * 10) / 10,
      electriciteMontant: electricite.reduce((s, a) => s + a.montant, 0),
      entrees,
      sorties,
      soldeDebut: await soldeTresorerie(db, veille),
      soldeFin: await soldeTresorerie(db, fin),
    },
    parMois,
    chambres,
    paiements: paiements.map(({ logement_id: _, ...p }) => p),
    irregularites,
    electricite,
    mouvements,
  };
}
