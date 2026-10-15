import { getDatabase } from '../db/client';
import { emettreFactureLoyer } from '../repositories/loyerRepository';
import { donneesFacture, donneesFactureElectricite, donneesRecu } from './donnees';
import { donneesContrat, htmlContrat } from './contrat';
import { donneesEtatDesLieux, htmlEtatDesLieux } from './etatDesLieux';
import { htmlFacture, htmlFactureElectricite, htmlRecu } from './gabarits';
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

/** Facture PDF d'une vente d'électricité. */
export async function partagerFactureElectricite(achatId: number): Promise<void> {
  const d = await donneesFactureElectricite(await getDatabase(), achatId);
  await partagerPdf(htmlFactureElectricite(d), `Facture-${d.numero}`, `Facture ${d.numero}`);
}

/** Contrat de bail PDF (signé ou à imprimer), à partager au locataire. */
export async function partagerContrat(contratId: number): Promise<void> {
  const d = await donneesContrat(await getDatabase(), contratId);
  await partagerPdf(htmlContrat(d), `Contrat-bail-${d.locataire.nom}`, `Contrat de bail — ${d.locataire.nom}`);
}

/** Fiche d'état des lieux PDF (entrée, et sortie si elle existe). */
export async function partagerEtatDesLieux(contratId: number, jour: string): Promise<void> {
  const d = await donneesEtatDesLieux(await getDatabase(), contratId, jour);
  await partagerPdf(htmlEtatDesLieux(d), `Etat-des-lieux-${d.locataire}`, `État des lieux — ${d.locataire}`);
}
