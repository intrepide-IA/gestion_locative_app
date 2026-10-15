import { getDatabase } from '../db/client';
import { emettreFactureLoyer } from '../repositories/loyerRepository';
import { donneesFacture, donneesRecu } from './donnees';
import { htmlFacture, htmlRecu } from './gabarits';
import { partagerPdf } from './partage';

/** Reçu PDF d'un paiement, partagé via la feuille Android. */
export async function partagerRecu(paiementId: number): Promise<void> {
  const d = await donneesRecu(await getDatabase(), paiementId);
  await partagerPdf(htmlRecu(d), `Recu-${d.numero}`, `Reçu ${d.numero}`);
}

/** Facture PDF d'une échéance (émise au premier partage, puis réutilisée). */
export async function partagerFactureEcheance(echeanceId: number): Promise<string> {
  const db = await getDatabase();
  const numero = await emettreFactureLoyer(db, echeanceId);
  const d = await donneesFacture(db, numero);
  await partagerPdf(htmlFacture(d), `Facture-${numero}`, `Facture ${numero}`);
  return numero;
}
