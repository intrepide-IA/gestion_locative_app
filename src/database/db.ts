/**
 * Base de données IndexedDB via Dexie
 * Stockage 100% local, équivalent SQLite pour le web
 */
import Dexie, { type Table } from 'dexie';
import type {
  Proprietaire,
  Logement,
  Locataire,
  Contrat,
  PaiementLoyer,
  ElectriciteStock,
  ConsommationElectricite,
  Facture,
  MouvementCompte,
} from '../types';

export class GestiLocDB extends Dexie {
  proprietaires!: Table<Proprietaire & { id: number }>;
  logements!: Table<Logement & { id: number }>;
  locataires!: Table<Locataire & { id: number }>;
  contrats!: Table<Contrat & { id: number }>;
  paiements_loyer!: Table<PaiementLoyer & { id: number }>;
  electricite_stock!: Table<ElectriciteStock & { id: number }>;
  consommation_electricite!: Table<ConsommationElectricite & { id: number }>;
  factures!: Table<Facture & { id: number }>;
  mouvements_compte!: Table<MouvementCompte & { id: number }>;

  constructor() {
    super('GestiLocDB');

    // Version initiale
    this.version(1).stores({
      proprietaires: '++id, nom',
      logements: '++id, statut, numero',
      locataires: '++id, logement_id, statut, nom_complet',
      contrats: '++id, locataire_id',
      paiements_loyer: '++id, locataire_id, mois, annee, statut',
      electricite_stock: '++id, locataire_id',
      consommation_electricite: '++id, locataire_id',
      factures: '++id, locataire_id, type, numero_unique',
    });

    // Version avec index composé et mouvements de compte
    this.version(2).stores({
      proprietaires: '++id, nom',
      logements: '++id, statut, numero',
      locataires: '++id, logement_id, statut, nom_complet, [logement_id+statut]',
      contrats: '++id, locataire_id',
      paiements_loyer: '++id, locataire_id, mois, annee, statut',
      electricite_stock: '++id, locataire_id',
      consommation_electricite: '++id, locataire_id',
      factures: '++id, locataire_id, type, numero_unique, statut, mois, annee',
      mouvements_compte: '++id, locataire_id, date_operation',
    });
  }

  async resetDatabase() {
    await this.delete();
    // After delete, we need to reopen it to recreate the tables
    await this.open();
  }
}

export const db = new GestiLocDB();
