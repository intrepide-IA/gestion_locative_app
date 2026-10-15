/**
 * Électricité prépayée : ventes de kWh, relevés de compteur et stock par contrat.
 * Le stock n'est pas stocké : stock = kWh achetés (non annulés) − consommation relevée.
 */
import type { SqlDatabase } from '../db/types';
import { arrondiKwh, calculerAchat, estimerEpuisement, etatStock, type EtatStock } from '../domain/electricite';
import { ErreurMetier, exigerDate, exigerMontant, texteOuNull } from '../domain/erreurs';
import { LIBELLES_MODE, type ModePaiement } from './loyerRepository';
import { prochainNumero } from './numerotation';
import { lireParametreNombre } from './parametresRepository';

export interface SituationElectricite {
  contrat_id: number;
  locataire_id: number;
  locataire_nom: string;
  logement_reference: string;
  prix_kwh: number;
  releve_initial: number;
  achetes: number;
  consommes: number;
  stock: number;
  dernier_index: number;
  dernier_releve_le: string | null;
  date_debut: string;
  etat: EtatStock;
  /** Index auquel le crédit payé est épuisé : il faut couper le compteur. */
  index_coupure: number;
  kwh_par_jour: number | null;
  /** Date estimée d'épuisement (AAAA-MM-JJ), d'après la consommation moyenne. */
  epuisement_estime: string | null;
}

export interface Achat {
  id: number;
  cree_le: string;
  index_achat: number | null;
  index_coupure: number | null;
  date_achat: string;
  montant_recu: number;
  prix_kwh: number;
  kwh: number;
  montant_facture: number;
  ecart_arrondi: number;
  mode: ModePaiement;
  annule_le: string | null;
  motif_annulation: string | null;
  facture_numero: string | null;
}

export interface Releve {
  id: number;
  date_releve: string;
  ancien_index: number;
  nouvel_index: number;
  consommation: number;
  motif_correction: string | null;
}

const SELECT_SITUATION = `
  SELECT c.id AS contrat_id, c.locataire_id, t.nom_complet AS locataire_nom, l.reference AS logement_reference,
         c.prix_kwh, c.releve_initial, c.date_debut,
         COALESCE((SELECT SUM(kwh) FROM achats_electricite WHERE contrat_id = c.id AND annule_le IS NULL), 0) AS achetes,
         COALESCE((SELECT SUM(consommation) FROM releves WHERE contrat_id = c.id AND compteur = 'electricite'), 0) AS consommes,
         COALESCE((SELECT nouvel_index FROM releves WHERE contrat_id = c.id AND compteur = 'electricite'
                   ORDER BY date_releve DESC, id DESC LIMIT 1), c.releve_initial) AS dernier_index,
         (SELECT date_releve FROM releves WHERE contrat_id = c.id AND compteur = 'electricite'
            ORDER BY date_releve DESC, id DESC LIMIT 1) AS dernier_releve_le
  FROM contrats c JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id`;

type Ligne = Omit<SituationElectricite, 'stock' | 'etat' | 'index_coupure' | 'kwh_par_jour' | 'epuisement_estime'>;

const completer = (seuil: number) => (l: Ligne): SituationElectricite => {
  const achetes = arrondiKwh(l.achetes);
  const consommes = arrondiKwh(l.consommes);
  const stock = arrondiKwh(achetes - consommes);
  const estimation = estimerEpuisement({ stock, consommes, dateDebut: l.date_debut, dernierReleve: l.dernier_releve_le });
  return {
    ...l,
    achetes,
    consommes,
    stock,
    etat: etatStock(stock, seuil),
    index_coupure: arrondiKwh(l.dernier_index + stock),
    kwh_par_jour: estimation.kwhParJour === null ? null : Math.round(estimation.kwhParJour * 100) / 100,
    epuisement_estime: estimation.epuisement,
  };
};

/** Situation électrique des contrats actifs, les plus urgents d'abord. */
export async function listerSituationsElectricite(db: SqlDatabase): Promise<SituationElectricite[]> {
  const seuil = await lireParametreNombre(db, 'seuil_kwh_bas');
  const lignes = await db.all<Ligne>(`${SELECT_SITUATION} WHERE c.statut = 'actif' ORDER BY l.reference COLLATE NOCASE`);
  const ordre: Record<EtatStock, number> = { deficit: 0, epuise: 1, bas: 2, ok: 3 };
  return lignes.map(completer(seuil)).sort((a, b) => ordre[a.etat] - ordre[b.etat]);
}

export async function situationElectricite(db: SqlDatabase, contratId: number): Promise<SituationElectricite | null> {
  const seuil = await lireParametreNombre(db, 'seuil_kwh_bas');
  const ligne = await db.get<Ligne>(`${SELECT_SITUATION} WHERE c.id = ?`, [contratId]);
  return ligne ? completer(seuil)(ligne) : null;
}

export async function achatsDuContrat(db: SqlDatabase, contratId: number): Promise<Achat[]> {
  return db.all<Achat>(
    `SELECT a.*, (SELECT numero FROM factures f WHERE f.achat_electricite_id = a.id ORDER BY f.id DESC LIMIT 1) AS facture_numero
     FROM achats_electricite a WHERE a.contrat_id = ? ORDER BY a.date_achat DESC, a.id DESC`,
    [contratId]
  );
}

export async function relevesDuContrat(db: SqlDatabase, contratId: number): Promise<Releve[]> {
  return db.all<Releve>(
    "SELECT id, date_releve, ancien_index, nouvel_index, consommation, motif_correction FROM releves WHERE contrat_id = ? AND compteur = 'electricite' ORDER BY date_releve DESC, id DESC",
    [contratId]
  );
}

export interface ResultatAchat {
  achatId: number;
  kwh: number;
  /** Index du compteur au moment de la vente (dernier relevé). */
  indexAchat: number;
  /** Index auquel le crédit (reste + kWh achetés) sera épuisé. */
  indexCoupure: number;
  montantFacture: number;
  ecart: number;
  factureNumero: string;
}

/**
 * Vente de kWh : calcul au prix du contrat, facture d'électricité numérotée et encaissement en trésorerie,
 * dans une seule transaction. L'écart d'arrondi (montant reçu − montant facturé) est renvoyé pour être rendu.
 */
export async function acheterElectricite(
  db: SqlDatabase,
  achat: { contratId: number; montantRecu: number; mode: ModePaiement; date: string },
  maintenant = new Date().toISOString()
): Promise<ResultatAchat> {
  const montant = exigerMontant(achat.montantRecu, 'Montant', { strictementPositif: true });
  const date = exigerDate(achat.date, 'Date');
  if (!(achat.mode in LIBELLES_MODE)) throw new ErreurMetier('Mode de paiement inconnu.');

  return db.transaction(async (tx) => {
    const contrat = await tx.get<{ prix_kwh: number; locataire_id: number; statut: string }>(
      'SELECT prix_kwh, locataire_id, statut FROM contrats WHERE id = ?',
      [achat.contratId]
    );
    if (!contrat) throw new ErreurMetier('Contrat introuvable.');
    if (contrat.statut !== 'actif') throw new ErreurMetier('Ce contrat est terminé.');
    const calcul = calculerAchat(montant, contrat.prix_kwh);
    if (calcul.kwh <= 0) {
      throw new ErreurMetier(`Montant insuffisant : il faut au moins ${Math.ceil(contrat.prix_kwh / 10)} FCFA pour 0,1 kWh.`);
    }

    // Index lu au dernier relevé (enregistré juste avant la vente s'il a été saisi) et crédit restant.
    const avant = await tx.get<Ligne>(`${SELECT_SITUATION} WHERE c.id = ?`, [achat.contratId]);
    const indexAchat = arrondiKwh(avant?.dernier_index ?? 0);
    const reste = arrondiKwh((avant?.achetes ?? 0) - (avant?.consommes ?? 0));
    const indexCoupure = arrondiKwh(indexAchat + reste + calcul.kwh);

    const { lastInsertRowId: achatId } = await tx.run(
      `INSERT INTO achats_electricite (contrat_id, date_achat, montant_recu, prix_kwh, kwh, montant_facture, ecart_arrondi, mode, index_achat, index_coupure, cree_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [achat.contratId, date, montant, contrat.prix_kwh, calcul.kwh, calcul.montantFacture, calcul.ecart, achat.mode, indexAchat, indexCoupure, maintenant]
    );
    const factureNumero = await prochainNumero(tx, 'FAC', Number(date.slice(0, 4)));
    await tx.run(
      "INSERT INTO factures (numero, type, locataire_id, achat_electricite_id, montant, statut, cree_le) VALUES (?, 'electricite', ?, ?, ?, 'emise', ?)",
      [factureNumero, contrat.locataire_id, achatId, calcul.montantFacture, maintenant]
    );
    const categorie = await tx.get<{ id: number }>("SELECT id FROM categories_financieres WHERE code = 'electricite'");
    await tx.run(
      `INSERT INTO mouvements_financiers (date_operation, sens, montant, categorie_id, mode, description, origine_type, origine_id, statut, cree_le)
       VALUES (?, 'entree', ?, ?, ?, ?, 'achat_electricite', ?, 'valide', ?)`,
      [date, calcul.montantFacture, categorie!.id, achat.mode, `Vente de ${calcul.kwh} kWh`, achatId, maintenant]
    );
    return { achatId, ...calcul, indexAchat, indexCoupure, factureNumero };
  });
}

/** Annule une vente saisie par erreur : stock, facture et trésorerie sont corrigés, la trace reste. */
export async function annulerAchat(db: SqlDatabase, achatId: number, motif: string, maintenant = new Date().toISOString()): Promise<void> {
  const raison = motif.trim();
  if (!raison) throw new ErreurMetier('Indiquez le motif de l’annulation.');
  await db.transaction(async (tx) => {
    const a = await tx.get<{ annule_le: string | null }>('SELECT annule_le FROM achats_electricite WHERE id = ?', [achatId]);
    if (!a) throw new ErreurMetier('Achat introuvable.');
    if (a.annule_le) throw new ErreurMetier('Cet achat est déjà annulé.');
    await tx.run('UPDATE achats_electricite SET annule_le = ?, motif_annulation = ? WHERE id = ?', [maintenant, raison, achatId]);
    await tx.run("UPDATE factures SET statut = 'annulee', motif_annulation = ? WHERE achat_electricite_id = ? AND statut = 'emise'", [
      raison,
      achatId,
    ]);
    await tx.run(
      "UPDATE mouvements_financiers SET statut = 'annule', motif_annulation = ? WHERE origine_type = 'achat_electricite' AND origine_id = ?",
      [raison, achatId]
    );
  });
}

/**
 * Relevé de compteur : consommation = nouvel index − index précédent (relevé initial du contrat au départ).
 * Un index inférieur est refusé, sauf changement de compteur déclaré (motif) : la consommation est alors 0
 * et le nouvel index sert de nouvelle référence.
 */
export async function enregistrerReleve(
  db: SqlDatabase,
  r: { contratId: number; nouvelIndex: number; date: string; motifCorrection?: string | null },
  maintenant = new Date().toISOString()
): Promise<{ consommation: number }> {
  const date = exigerDate(r.date, 'Date du relevé');
  const nouvel = arrondiKwh(r.nouvelIndex);
  if (!Number.isFinite(nouvel) || nouvel < 0) throw new ErreurMetier('Index du compteur invalide.');
  const motif = texteOuNull(r.motifCorrection);

  return db.transaction(async (tx) => {
    const s = await situationElectricite(tx, r.contratId);
    if (!s) throw new ErreurMetier('Contrat introuvable.');
    const ancien = arrondiKwh(s.dernier_index);
    if (nouvel < ancien && !motif) {
      throw new ErreurMetier(`Le nouvel index (${nouvel}) est inférieur au précédent (${ancien}). S’il s’agit d’un changement de compteur, indiquez-le.`);
    }
    const base = nouvel < ancien ? nouvel : ancien;
    // Différence brute stockée : la contrainte SQL vérifie consommation = nouvel − ancien au bit près.
    const consommationBrute = nouvel - base;
    await tx.run(
      `INSERT INTO releves (contrat_id, compteur, date_releve, ancien_index, nouvel_index, consommation, motif_correction, cree_le)
       VALUES (?, 'electricite', ?, ?, ?, ?, ?, ?)`,
      [r.contratId, date, base, nouvel, consommationBrute, nouvel < ancien ? motif : null, maintenant]
    );
    return { consommation: arrondiKwh(consommationBrute) };
  });
}
