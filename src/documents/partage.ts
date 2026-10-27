/**
 * Génère un PDF sur le téléphone puis ouvre la feuille de partage Android (WhatsApp, e-mail…).
 * Ouvrir la feuille ne prouve pas l'envoi : l'application ne marque jamais un document « envoyé ».
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

import { PartageWhatsApp } from '../../modules/partage-whatsapp';

/** Génère le PDF dans un dossier neuf (l'application qui reçoit ne peut pas resservir un ancien fichier). */
async function genererPdf(html: string, nomFichier: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });
  const dossier = `${FileSystem.cacheDirectory}partage-${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  const destination = `${dossier}${nomFichier.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w.-]+/g, '-')}.pdf`;
  await FileSystem.moveAsync({ from: uri, to: destination });
  return destination;
}

/**
 * Envoie le PDF directement dans la discussion WhatsApp du numéro (même absent des contacts),
 * avec le message en légende. Sans WhatsApp, ouvre au moins la discussion avec le message (wa.me).
 * Renvoie « pdf » si le fichier part avec le message, « texte » si seul le message a pu être préparé.
 */
export async function envoyerPdfWhatsApp(html: string, nomFichier: string, numero: string, message: string): Promise<'pdf' | 'texte'> {
  if (PartageWhatsApp) {
    const fichier = await genererPdf(html, nomFichier);
    const contenu = await FileSystem.getContentUriAsync(fichier);
    if (await PartageWhatsApp.envoyer(contenu, 'application/pdf', numero, message)) return 'pdf';
  }
  await Linking.openURL(`https://wa.me/${numero}?text=${encodeURIComponent(message)}`);
  return 'texte';
}

export async function partagerPdf(html: string, nomFichier: string, titre: string): Promise<void> {
  const destination = await genererPdf(html, nomFichier);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(destination, { mimeType: 'application/pdf', dialogTitle: titre, UTI: 'com.adobe.pdf' });
}

/** Partage un fichier texte (CSV…) via la feuille Android. */
export async function partagerFichierTexte(contenu: string, nomFichier: string, mimeType: string, titre: string): Promise<void> {
  const destination = `${FileSystem.cacheDirectory}${nomFichier.replace(/[^\w.-]+/g, '-')}`;
  // BOM UTF-8 : Excel affiche correctement les accents.
  await FileSystem.writeAsStringAsync(destination, `\uFEFF${contenu}`);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(destination, { mimeType, dialogTitle: titre });
}
