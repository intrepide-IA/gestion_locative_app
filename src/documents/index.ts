/**
 * Documents PDF : chaque document est d'abord préparé (HTML), affiché dans l'aperçu de l'application,
 * puis partagé en PDF depuis cet aperçu.
 */
import { getDatabase } from '../db/client';
import { aujourdhui } from '../domain/format';
import { emettreFactureLoyer } from '../repositories/loyerRepository';
import { donneesAvisElectricite, donneesFacture, donneesFactureElectricite, donneesRecu } from './donnees';
import { messageAvisElectricite, messageContrat, messageEtatDesLieux, messageFactureElectricite, messageFactureLoyer, messageRecu } from '../domain/messages';
import { donneesContrat, htmlContrat } from './contrat';
import { donneesEtatDesLieux, htmlEtatDesLieux, sectionEtatDesLieux } from './etatDesLieux';
import { htmlAvisElectricite, htmlFacture, htmlFactureElectricite, htmlRecu } from './gabarits';
import { applicationsWhatsApp, envoyerPdfWhatsApp, partagerPdf } from './partage';

import { numeroWhatsApp } from '../domain/whatsapp';

export interface DocumentPdf {
  html: string;
  /** Nom du fichier PDF, sans extension. */
  nomFichier: string;
  titre: string;
  /** Envoi direct sur WhatsApp : numéro du destinataire et message déjà rédigé. */
  whatsapp?: { telephone: string | null; message: string };
}

export async function preparerRecu(paiementId: number): Promise<DocumentPdf> {
  const d = await donneesRecu(await getDatabase(), paiementId);
  return {
    html: htmlRecu(d),
    nomFichier: `Recu-${d.numero}`,
    titre: `Reçu ${d.numero}`,
    whatsapp: {
      telephone: d.destinataire.telephone,
      message: messageRecu({
        nom: d.destinataire.nom,
        numero: d.numero,
        date: d.date,
        montant: d.montant,
        mois: d.lignes,
        avance: d.credit,
        soldeRestant: d.soldeRestant,
        proprietaire: d.emetteur.nom,
      }),
    },
  };
}

/** Facture d'une échéance (émise à la première préparation, puis réutilisée). */
export async function preparerFactureEcheance(echeanceId: number): Promise<DocumentPdf> {
  const db = await getDatabase();
  const numero = await emettreFactureLoyer(db, echeanceId);
  const d = await donneesFacture(db, numero);
  return {
    html: htmlFacture(d),
    nomFichier: `Facture-${numero}`,
    titre: `Facture ${numero}`,
    whatsapp: {
      telephone: d.destinataire.telephone,
      message: messageFactureLoyer({
        nom: d.destinataire.nom,
        numero,
        periode: d.periode,
        dateEcheance: d.dateEcheance,
        reste: Math.max(0, d.montant - d.regle),
        proprietaire: d.emetteur.nom,
      }),
    },
  };
}

export async function preparerFactureElectricite(achatId: number): Promise<DocumentPdf> {
  const d = await donneesFactureElectricite(await getDatabase(), achatId);
  return {
    html: htmlFactureElectricite(d),
    nomFichier: `Facture-${d.numero}`,
    titre: `Facture ${d.numero}`,
    whatsapp: {
      telephone: d.destinataire.telephone,
      message: messageFactureElectricite({
        nom: d.destinataire.nom,
        numero: d.numero,
        kwh: d.kwh,
        montant: d.montantFacture,
        indexCoupure: d.indexCoupure,
        proprietaire: d.emetteur.nom,
      }),
    },
  };
}

/** Avis d'électricité : situation du compteur, date de coupure, ou somme due en cas de dépassement. */
export async function preparerAvisElectricite(contratId: number, dateLimite: string): Promise<DocumentPdf> {
  const d = await donneesAvisElectricite(await getDatabase(), contratId, aujourdhui(), dateLimite);
  return {
    html: htmlAvisElectricite(d),
    nomFichier: `Avis-electricite-${d.destinataire.nom}-${d.date}`,
    titre: `Avis d’électricité — ${d.destinataire.nom}`,
    whatsapp: { telephone: d.destinataire.telephone, message: messageAvisElectricite(d.avis, d.destinataire.nom, d.emetteur.nom) },
  };
}

/** Contrat de bail, avec la fiche d'état des lieux en annexe si elle existe : un seul PDF à partager. */
export async function preparerContrat(contratId: number): Promise<DocumentPdf> {
  const db = await getDatabase();
  const d = await donneesContrat(db, contratId);
  const edl = await donneesEtatDesLieux(db, contratId, aujourdhui());
  const annexe = edl.entree || edl.sortie ? sectionEtatDesLieux(edl) : '';
  return {
    html: htmlContrat(d, annexe),
    nomFichier: `Contrat-bail-${d.locataire.nom}`,
    titre: `Contrat de bail — ${d.locataire.nom}`,
    whatsapp: {
      telephone: d.locataire.telephone,
      message: messageContrat({ nom: d.locataire.nom, logement: d.logement, signe: !!d.bail.signe_le, proprietaire: d.bailleur.nom }),
    },
  };
}

export async function preparerEtatDesLieux(contratId: number): Promise<DocumentPdf> {
  const db = await getDatabase();
  const d = await donneesEtatDesLieux(db, contratId, aujourdhui());
  const tel = await db.get<{ telephone: string | null }>(
    'SELECT t.telephone FROM contrats c JOIN locataires t ON t.id = c.locataire_id WHERE c.id = ?',
    [contratId]
  );
  return {
    html: htmlEtatDesLieux(d),
    nomFichier: `Etat-des-lieux-${d.locataire}`,
    titre: `État des lieux — ${d.locataire}`,
    whatsapp: {
      telephone: tel?.telephone ?? null,
      message: messageEtatDesLieux({
        nom: d.locataire,
        logement: d.logement,
        type: d.entree && d.sortie ? 'les deux' : d.sortie ? 'sortie' : 'entree',
        proprietaire: d.proprietaire,
      }),
    },
  };
}

export function partagerDocument(doc: DocumentPdf): Promise<void> {
  return partagerPdf(doc.html, doc.nomFichier, doc.titre);
}

/** Numéro WhatsApp du destinataire du document (format international), ou null. */
export const numeroWhatsAppDocument = (doc: DocumentPdf) => numeroWhatsApp(doc.whatsapp?.telephone);

/** Envoie le PDF et son message directement au numéro WhatsApp du locataire. */
export function envoyerDocumentWhatsApp(
  doc: DocumentPdf,
  message = doc.whatsapp?.message ?? '',
  application: string | null = null
): Promise<'pdf' | 'texte'> {
  const numero = numeroWhatsAppDocument(doc);
  if (!numero || !doc.whatsapp) return Promise.reject(new Error('Aucun numéro WhatsApp valide pour ce locataire.'));
  return envoyerPdfWhatsApp(doc.html, doc.nomFichier, numero, message, application);
}
export { applicationsWhatsApp };
