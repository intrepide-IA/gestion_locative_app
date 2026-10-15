import type { SqlDatabase } from '../db/types';

export type CleParametreNombre = 'jour_echeance_defaut' | 'prix_kwh_defaut' | 'seuil_kwh_bas' | 'delai_verrouillage_secondes';

const DEFAUTS: Record<CleParametreNombre, number> = {
  jour_echeance_defaut: 5,
  prix_kwh_defaut: 250,
  seuil_kwh_bas: 5,
  delai_verrouillage_secondes: 120,
};

export async function lireParametreNombre(db: SqlDatabase, cle: CleParametreNombre): Promise<number> {
  const row = await db.get<{ valeur: string }>('SELECT valeur FROM parametres WHERE cle = ?', [cle]);
  const n = Number(row?.valeur);
  return Number.isFinite(n) ? n : DEFAUTS[cle];
}
