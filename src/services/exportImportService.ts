/**
 * Export / Import de la base de données
 */
import { nativeDb as db } from '../database/db.native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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

/**
 * Désactivé pendant la refonte : l'ancien import vidait les tables hors transaction et reprenait
 * les noms de colonnes du fichier (risque de perte de données et d'injection SQL).
 * Il sera remplacé au lot 8 par un import validé et atomique.
 */
export async function importJSON(): Promise<void> {
  throw new Error('La restauration est indisponible pendant la refonte (prévue au lot 8).');
}
