import { nativeDb as db } from '../database/db.native';
import type { Facture, TypeFacture } from '../types';
import { STORAGE_KEYS } from '../constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function getNextNumeroFacture(): Promise<string> {
  const stored = await AsyncStorage.getItem(STORAGE_KEYS.FACTURE_COUNTER);
  const count = stored ? parseInt(stored, 10) + 1 : 1;
  await AsyncStorage.setItem(STORAGE_KEYS.FACTURE_COUNTER, count.toString());
  const year = new Date().getFullYear();
  return `FAC-${year}-${String(count).padStart(5, '0')}`;
}

export async function createFacture(
  type: TypeFacture,
  locataireId: number,
  montantTotal: number,
  options?: { mois?: number; annee?: number; statut?: 'en_attente' | 'paye' | 'annule'; kwh_consommes?: number }
): Promise<number> {
  const numero_unique = await getNextNumeroFacture();
  const created_at = new Date().toISOString();
  const { mois, annee, statut = 'en_attente', kwh_consommes } = options ?? {};

  await db.exec(
    'INSERT INTO factures (numero_unique, type, locataire_id, montant_total, statut, mois, annee, kwh_consommes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [numero_unique, type, locataireId, montantTotal, statut, mois, annee, kwh_consommes, created_at]
  );

  const lastId = await db.getOne<{ id: number }>('SELECT last_insert_rowid() as id');
  return lastId?.id || 0;
}

export async function ensureFactureLoyer(
  locataireId: number,
  mois: number,
  annee: number,
  montantTotal: number
): Promise<number> {
  const existante = await db.getOne<Facture>(
    "SELECT id FROM factures WHERE locataire_id = ? AND type = 'loyer' AND mois = ? AND annee = ? AND statut != 'annule'",
    [locataireId, mois, annee]
  );

  if (existante) {
    return existante.id!;
  }

  return createFacture('loyer', locataireId, montantTotal, {
    mois,
    annee,
    statut: 'en_attente',
  });
}

export async function getFacture(id: number): Promise<Facture | undefined> {
  const result = await db.getOne<Facture>('SELECT * FROM factures WHERE id = ?', [id]);
  return result || undefined;
}

export async function getFacturesByLocataire(locataireId: number): Promise<Facture[]> {
  return db.query<Facture>('SELECT * FROM factures WHERE locataire_id = ? ORDER BY id DESC', [locataireId]);
}

export async function getAllFactures(): Promise<Facture[]> {
  return db.query<Facture>('SELECT * FROM factures ORDER BY created_at DESC');
}

export async function updateFacturePdf(id: number, pdf_uri: string): Promise<void> {
  await db.exec('UPDATE factures SET pdf_uri = ? WHERE id = ?', [pdf_uri, id]);
}

export async function annulerFacture(id: number): Promise<void> {
  await db.exec("UPDATE factures SET statut = 'annule' WHERE id = ?", [id]);
}

export async function getFacturesByMonthYear(mois: number, annee: number): Promise<Facture[]> {
  const toutes = await db.query<Facture>('SELECT * FROM factures');
  return toutes.filter((f) => {
    const d = new Date(f.created_at);
    const m = f.mois ?? d.getMonth() + 1;
    const y = f.annee ?? d.getFullYear();
    return m === mois && y === annee;
  });
}
