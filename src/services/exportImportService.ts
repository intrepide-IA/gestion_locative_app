/**
 * Export / Import de la base de données
 */
import { nativeDb as db } from '../database/db.native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type {
  Proprietaire,
  Logement,
  Locataire,
  Contrat,
  PaiementLoyer,
  ElectriciteStock,
  ConsommationElectricite,
  Facture,
} from '../types';

export interface ExportData {
  version: number;
  exportDate: string;
  proprietaires: (Proprietaire & { id: number })[];
  logements: (Logement & { id: number })[];
  locataires: (Locataire & { id: number })[];
  contrats: (Contrat & { id: number })[];
  paiements_loyer: (PaiementLoyer & { id: number })[];
  electricite_stock: (ElectriciteStock & { id: number })[];
  consommation_electricite: (ConsommationElectricite & { id: number })[];
  factures: (Facture & { id: number })[];
}

export async function exportJSON(): Promise<void> {
  const [proprietaires, logements, locataires, contrats, paiements_loyer, electricite_stock, consommation_electricite, factures] =
    await Promise.all([
      db.query<Proprietaire & { id: number }>('SELECT * FROM proprietaires'),
      db.query<Logement & { id: number }>('SELECT * FROM logements'),
      db.query<Locataire & { id: number }>('SELECT * FROM locataires'),
      db.query<Contrat & { id: number }>('SELECT * FROM contrats'),
      db.query<PaiementLoyer & { id: number }>('SELECT * FROM paiements_loyer'),
      db.query<ElectriciteStock & { id: number }>('SELECT * FROM electricite_stock'),
      db.query<ConsommationElectricite & { id: number }>('SELECT * FROM consommation_electricite'),
      db.query<Facture & { id: number }>('SELECT * FROM factures'),
    ]);

  const data: ExportData = {
    version: 1,
    exportDate: new Date().toISOString(),
    proprietaires,
    logements,
    locataires,
    contrats,
    paiements_loyer,
    electricite_stock,
    consommation_electricite,
    factures,
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const fileUri = FileSystem.cacheDirectory + 'gestiloc_export.json';

  await FileSystem.writeAsStringAsync(fileUri, jsonStr);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri);
  }
}

export async function importJSON(): Promise<void> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
  });

  if (result.canceled) return;

  const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
  const data: ExportData = JSON.parse(fileContent);

  // Clear all tables (Manual SQLite implementation)
  const tables = [
    'proprietaires', 'logements', 'locataires', 'contrats',
    'paiements_loyer', 'electricite_stock', 'consommation_electricite', 'factures'
  ];

  for (const table of tables) {
    await db.exec(`DELETE FROM ${table}`);
  }

  // Helper for batch insert
  const batchInsert = async (table: string, items: any[]) => {
    if (!items || items.length === 0) return;
    for (const item of items) {
      const keys = Object.keys(item);
      const values = Object.values(item);
      const placeholders = keys.map(() => '?').join(', ');
      await db.exec(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, values);
    }
  };

  await batchInsert('proprietaires', data.proprietaires);
  await batchInsert('logements', data.logements);
  await batchInsert('locataires', data.locataires);
  await batchInsert('contrats', data.contrats);
  await batchInsert('paiements_loyer', data.paiements_loyer);
  await batchInsert('electricite_stock', data.electricite_stock);
  await batchInsert('consommation_electricite', data.consommation_electricite);
  await batchInsert('factures', data.factures);
}
