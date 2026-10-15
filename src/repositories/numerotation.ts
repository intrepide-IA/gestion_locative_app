import type { SqlDatabase } from '../db/types';

export type TypeDocument = 'FAC' | 'REC' | 'DEP';

/**
 * Prochain numéro de document (FAC-2026-00001…), séquence annuelle tenue dans la base.
 * À appeler dans la transaction qui crée le document : le numéro n'est jamais réutilisé, même après annulation.
 */
export async function prochainNumero(tx: SqlDatabase, type: TypeDocument, annee: number): Promise<string> {
  await tx.run(
    `INSERT INTO sequences (type, annee, dernier_numero) VALUES (?, ?, 1)
     ON CONFLICT (type, annee) DO UPDATE SET dernier_numero = dernier_numero + 1`,
    [type, annee]
  );
  const row = await tx.get<{ dernier_numero: number }>('SELECT dernier_numero FROM sequences WHERE type = ? AND annee = ?', [type, annee]);
  return `${type}-${annee}-${String(row!.dernier_numero).padStart(5, '0')}`;
}
