/**
 * Initialisation de la base avec données par défaut si vide
 */
import { db } from '../database/db';
import { getFirstProprietaire } from '../services/proprietaireService';

export async function initDatabaseIfEmpty(): Promise<void> {
  const count = await db.proprietaires.count();
  if (count === 0) {
    await db.proprietaires.add({
      nom: 'Amadou Ndiaye',
      telephone: '+221 77 123 45 67',
      adresse: 'Dakar, Sénégal',
      created_at: new Date().toISOString(),
    } as import('../types').Proprietaire & { id: number });
  }
}
