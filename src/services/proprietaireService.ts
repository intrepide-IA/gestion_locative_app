/**
 * Adaptateur entre l'ancien type `Proprietaire` (écrans, PDF) et le nouveau dépôt.
 * À supprimer quand les écrans utiliseront directement `repositories/proprietaireRepository`.
 */
import { getDatabase } from '../db/client';
import * as repo from '../repositories/proprietaireRepository';
import type { Proprietaire } from '../types';

function versAncienFormat(p: repo.Proprietaire): Proprietaire {
  return {
    id: p.id,
    nom: p.nom,
    telephone: p.telephone ?? '',
    adresse: p.adresse ?? '',
    logo_uri: p.logo_uri ?? undefined,
    created_at: p.cree_le,
  };
}

export async function getFirstProprietaire(): Promise<Proprietaire | undefined> {
  const p = await repo.getProprietaire(await getDatabase());
  return p ? versAncienFormat(p) : undefined;
}

export async function updateProprietaire(data: { nom: string; telephone: string; adresse: string }): Promise<void> {
  await repo.enregistrerProprietaire(await getDatabase(), data);
}
