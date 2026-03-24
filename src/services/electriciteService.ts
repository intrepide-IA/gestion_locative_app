import { nativeDb as db } from '../database/db.native';
import { nativeDb } from '../database/db.native';
import type { ElectriciteStock, ConsommationElectricite, Locataire, Facture } from '../types';
import { PRIX_KWH_DEFAUT } from '../types';

export async function getStockActuel(locataireId: number): Promise<number> {
  const stocks = await db.query<ElectriciteStock>('SELECT * FROM electricite_stock WHERE locataire_id = ?', [locataireId]);
  return stocks.reduce((sum, s) => sum + s.kwh_restant, 0);
}

export async function getDernierReleve(locataireId: number): Promise<ConsommationElectricite | undefined> {
  const result = await db.getOne<ConsommationElectricite>('SELECT * FROM consommation_electricite WHERE locataire_id = ? ORDER BY id DESC', [locataireId]);
  return result || undefined;
}

export async function acheterElectricite(
  locataireId: number,
  montant: number,
  prixKwh: number = PRIX_KWH_DEFAUT
): Promise<number> {
  const kwh_achete = Math.floor(montant / prixKwh);
  const kwh_restant = kwh_achete;
  const date_achat = new Date().toISOString();

  await db.exec(
    'INSERT INTO electricite_stock (locataire_id, kwh_achete, montant_paye, kwh_restant, date_achat) VALUES (?, ?, ?, ?, ?)',
    [locataireId, kwh_achete, montant, kwh_restant, date_achat]
  );

  const lastId = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return lastId?.id || 0;
}

export async function enregistrerReleve(
  locataireId: number,
  nouveauCompteur: number
): Promise<{ id: number; consommation: number; kwhRestant: number }> {
  const dernierReleve = await getDernierReleve(locataireId);
  const ancien_compteur = dernierReleve?.nouveau_compteur ?? 0;
  const consommation = nouveauCompteur - ancien_compteur;

  const stocks = await db.query<ElectriciteStock>(
    'SELECT * FROM electricite_stock WHERE locataire_id = ? AND kwh_restant > 0 ORDER BY date_achat ASC',
    [locataireId]
  );

  let kwhAReste = consommation;
  for (const stock of stocks) {
    if (kwhAReste <= 0) break;
    const aDeduire = Math.min(stock.kwh_restant, kwhAReste);
    await db.exec('UPDATE electricite_stock SET kwh_restant = ? WHERE id = ?', [stock.kwh_restant - aDeduire, stock.id]);
    kwhAReste -= aDeduire;
  }

  const kwhRestant = kwhAReste > 0 ? 0 : await getStockActuel(locataireId);
  const date_releve = new Date().toISOString();

  await db.exec(
    'INSERT INTO consommation_electricite (locataire_id, ancien_compteur, nouveau_compteur, consommation, date_releve) VALUES (?, ?, ?, ?, ?)',
    [locataireId, ancien_compteur, nouveauCompteur, consommation, date_releve]
  );

  const lastId = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return { id: lastId?.id || 0, consommation, kwhRestant };
}

export async function getTotalKwhVendus(): Promise<number> {
  const result = await db.getOne<{ total: number }>('SELECT SUM(kwh_achete) as total FROM electricite_stock');
  return result?.total || 0;
}

export async function getReleveActuel(locataireId: number): Promise<number> {
  const locataire = await db.getOne<Locataire>('SELECT releve_compteur_initial FROM locataires WHERE id = ?', [locataireId]);
  if (!locataire) return 0;

  const facturesElec = await db.query<Facture>(
    "SELECT kwh_consommes FROM factures WHERE locataire_id = ? AND type = 'electricite' AND statut != 'annule'",
    [locataireId]
  );

  const consoTotale = facturesElec.reduce((sum, f) => sum + (f.kwh_consommes ?? 0), 0);
  return (locataire.releve_compteur_initial ?? 0) + consoTotale;
}
