/**
 * Génère un PDF sur le téléphone puis ouvre la feuille de partage Android (WhatsApp, e-mail…).
 * Ouvrir la feuille ne prouve pas l'envoi : l'application ne marque jamais un document « envoyé ».
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function partagerPdf(html: string, nomFichier: string, titre: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const destination = `${FileSystem.cacheDirectory}${nomFichier.replace(/[^\w.-]+/g, '-')}.pdf`;
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: destination });
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
