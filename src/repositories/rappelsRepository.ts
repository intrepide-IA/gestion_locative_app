/**
 * Synchronise les notifications programmées sur le téléphone avec les données :
 * programme les nouveaux rappels, annule ceux devenus inutiles (loyer réglé…), ne renvoie jamais
 * un rappel déjà programmé ou déjà affiché (table notifications_programmees).
 */
import type { SqlDatabase } from '../db/types';
import { alertesEnCours, rappelsSouhaites, type Alerte, type DonneesRappels, type RappelSouhaite } from '../domain/rappels';
import { listerSituationsElectricite } from './electriciteRepository';
import { genererEcheances } from './loyerRepository';

export interface Planificateur {
  planifier(rappel: RappelSouhaite): Promise<string>;
  annuler(identifiant: string): Promise<void>;
}

const CLE_ACTIVES = 'notifications_actives';

export async function notificationsActives(db: SqlDatabase): Promise<boolean> {
  const row = await db.get<{ valeur: string }>('SELECT valeur FROM parametres WHERE cle = ?', [CLE_ACTIVES]);
  return row?.valeur !== '0';
}

export async function definirNotificationsActives(db: SqlDatabase, actives: boolean): Promise<void> {
  await db.run('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur', [
    CLE_ACTIVES,
    actives ? '1' : '0',
  ]);
}

async function lireDonnees(db: SqlDatabase, aujourdhui: string): Promise<DonneesRappels> {
  await genererEcheances(db, aujourdhui);
  const echeancesImpayees = await db.all<DonneesRappels['echeancesImpayees'][number]>(
    `SELECT e.id, e.date_echeance, e.montant_du - COALESCE(pe.paye, 0) AS reste, t.nom_complet AS locataire_nom, l.reference AS logement_reference
     FROM echeances e JOIN contrats c ON c.id = e.contrat_id JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id
     LEFT JOIN (SELECT a.echeance_id, SUM(a.montant) AS paye FROM affectations a JOIN paiements p ON p.id = a.paiement_id
                WHERE p.annule_le IS NULL GROUP BY a.echeance_id) pe ON pe.echeance_id = e.id
     WHERE c.statut = 'actif' AND e.montant_du - COALESCE(pe.paye, 0) > 0`
  );
  const contratsAvecFin = await db.all<DonneesRappels['contratsAvecFin'][number]>(
    `SELECT c.id, c.date_fin, t.nom_complet AS locataire_nom, l.reference AS logement_reference
     FROM contrats c JOIN locataires t ON t.id = c.locataire_id JOIN logements l ON l.id = c.logement_id
     WHERE c.statut = 'actif' AND c.date_fin IS NOT NULL`
  );
  const stocks = await listerSituationsElectricite(db);
  return { echeancesImpayees, contratsAvecFin, stocks };
}

/** Alertes affichées sur la page Notifications (et la pastille de la cloche). */
export async function listerAlertes(db: SqlDatabase, aujourdhui: string): Promise<Alerte[]> {
  const donnees = await lireDonnees(db, aujourdhui);
  const sauvegarde = await db.get<{ valeur: string }>("SELECT valeur FROM parametres WHERE cle = 'derniere_sauvegarde'");
  return alertesEnCours({ ...donnees, derniereSauvegarde: sauvegarde?.valeur ?? null }, aujourdhui);
}

export interface BilanSynchronisation {
  programmes: number;
  annules: number;
}

export async function synchroniserRappels(
  db: SqlDatabase,
  planificateur: Planificateur,
  maintenant: Date,
  aujourdhui: string
): Promise<BilanSynchronisation> {
  const actives = await notificationsActives(db);
  const souhaites = actives ? rappelsSouhaites(await lireDonnees(db, aujourdhui), maintenant) : [];
  const parCle = new Map(souhaites.map((r) => [`${r.type}|${r.cle}`, r]));
  const existants = await db.all<{ id: number; type: string; cle_evenement: string; identifiant_systeme: string | null; prevue_le: string }>(
    'SELECT id, type, cle_evenement, identifiant_systeme, prevue_le FROM notifications_programmees'
  );
  const bilan: BilanSynchronisation = { programmes: 0, annules: 0 };

  for (const e of existants) {
    const cle = `${e.type}|${e.cle_evenement}`;
    const aVenir = new Date(e.prevue_le).getTime() > maintenant.getTime();
    if (parCle.has(cle)) {
      parCle.delete(cle); // déjà programmé ou déjà affiché : rien à faire
    } else if (aVenir) {
      // Plus d'actualité (loyer réglé, notifications coupées…) : on retire le rappel.
      if (e.identifiant_systeme) await planificateur.annuler(e.identifiant_systeme);
      await db.run('DELETE FROM notifications_programmees WHERE id = ?', [e.id]);
      bilan.annules += 1;
    }
  }

  for (const r of parCle.values()) {
    const identifiant = await planificateur.planifier(r);
    await db.run(
      'INSERT OR IGNORE INTO notifications_programmees (type, cle_evenement, identifiant_systeme, prevue_le) VALUES (?, ?, ?, ?)',
      [r.type, r.cle, identifiant, r.date.toISOString()]
    );
    bilan.programmes += 1;
  }
  return bilan;
}
