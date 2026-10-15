/**
 * Documents PDF : chaque document est d'abord préparé (HTML), affiché dans l'aperçu de l'application,
 * puis partagé en PDF depuis cet aperçu.
 */
import { getDatabase } from '../db/client';
import { aujourdhui } from '../domain/format';
import { emettreFactureLoyer } from '../repositories/loyerRepository';
import { donneesFacture, donneesFactureElectricite, donneesRecu } from './donnees';
import { donneesContrat, htmlContrat } from './contrat';
import { donneesEtatDesLieux, htmlEtatDesLieux, sectionEtatDesLieux } from './etatDesLieux';
import { htmlFacture, htmlFactureElectricite, htmlRecu } from './gabarits';
import { partagerPdf } from './partage';

export interface DocumentPdf {
  html: string;
  /** Nom du fichier PDF, sans extension. */
  nomFichier: string;
  titre: string;
}

export async function preparerRecu(paiementId: number): Promise<DocumentPdf> {
  const d = await donneesRecu(await getDatabase(), paiementId);
  return { html: htmlRecu(d), nomFichier: `Recu-${d.numero}`, titre: `Reçu ${d.numero}` };
}

/** Facture d'une échéance (émise à la première préparation, puis réutilisée). */
export async function preparerFactureEcheance(echeanceId: number): Promise<DocumentPdf> {
  const db = await getDatabase();
  const numero = await emettreFactureLoyer(db, echeanceId);
  const d = await donneesFacture(db, numero);
  return { html: htmlFacture(d), nomFichier: `Facture-${numero}`, titre: `Facture ${numero}` };
}

export async function preparerFactureElectricite(achatId: number): Promise<DocumentPdf> {
  const d = await donneesFactureElectricite(await getDatabase(), achatId);
  return { html: htmlFactureElectricite(d), nomFichier: `Facture-${d.numero}`, titre: `Facture ${d.numero}` };
}

/** Contrat de bail, avec la fiche d'état des lieux en annexe si elle existe : un seul PDF à partager. */
export async function preparerContrat(contratId: number): Promise<DocumentPdf> {
  const db = await getDatabase();
  const d = await donneesContrat(db, contratId);
  const edl = await donneesEtatDesLieux(db, contratId, aujourdhui());
  const annexe = edl.entree || edl.sortie ? sectionEtatDesLieux(edl) : '';
  return { html: htmlContrat(d, annexe), nomFichier: `Contrat-bail-${d.locataire.nom}`, titre: `Contrat de bail — ${d.locataire.nom}` };
}

export async function preparerEtatDesLieux(contratId: number): Promise<DocumentPdf> {
  const d = await donneesEtatDesLieux(await getDatabase(), contratId, aujourdhui());
  return { html: htmlEtatDesLieux(d), nomFichier: `Etat-des-lieux-${d.locataire}`, titre: `État des lieux — ${d.locataire}` };
}

export function partagerDocument(doc: DocumentPdf): Promise<void> {
  return partagerPdf(doc.html, doc.nomFichier, doc.titre);
}
