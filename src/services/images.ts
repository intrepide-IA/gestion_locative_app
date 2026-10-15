/**
 * Images : réduction et conversion en image « data: » (stockée dans la base chiffrée, donc sauvegardée).
 * La photo se prend avec l'appareil intégré (composant PrisePhoto) ; l'import passe par le sélecteur
 * de fichiers, plus fiable sur Android que le sélecteur de photos.
 */
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import type { Zone } from '../domain/photo';

export { zonePhoto, type Zone } from '../domain/photo';

export interface OptionsImage {
  /** Largeur maximale en pixels après réduction. */
  largeur: number;
  /** PNG garde la transparence (signature) ; JPEG est plus léger (photo). */
  format: 'png' | 'jpeg';
}

export async function reduireImage(uri: string, options: OptionsImage): Promise<string> {
  const reduite = await manipulateAsync(uri, [{ resize: { width: options.largeur } }], {
    compress: 0.7,
    format: options.format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG,
    base64: true,
  });
  if (!reduite.base64) throw new Error('Image illisible.');
  return `data:image/${options.format};base64,${reduite.base64}`;
}

/** Choisit une image dans les fichiers du téléphone ; null si l'utilisateur annule. */
export async function importerImage(options: OptionsImage): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets[0]) return null;
  return reduireImage(r.assets[0].uri, options);
}

export async function recadrerImage(uri: string, zone: Zone, options: OptionsImage): Promise<string> {
  const r = await manipulateAsync(
    uri,
    [{ crop: { originX: zone.x, originY: zone.y, width: zone.largeur, height: zone.hauteur } }, { resize: { width: Math.min(options.largeur, zone.largeur) } }],
    { compress: 0.8, format: options.format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG, base64: true }
  );
  if (!r.base64) throw new Error('Image illisible.');
  return `data:image/${options.format};base64,${r.base64}`;
}

/** Partage (ou enregistre) une image seule : WhatsApp, Drive, Galerie… */
export async function partagerImage(image: string, nomFichier: string): Promise<void> {
  const m = image.match(/^data:(image\/(png|jpeg));base64,(.+)$/);
  if (!m) throw new Error('Image invalide.');
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = image;
    a.download = `${nomFichier}.${m[2] === 'png' ? 'png' : 'jpg'}`;
    a.click();
    return;
  }
  const chemin = `${FileSystem.cacheDirectory}${nomFichier.replace(/[^\w.-]+/g, '-')}-${Date.now()}.${m[2] === 'png' ? 'png' : 'jpg'}`;
  await FileSystem.writeAsStringAsync(chemin, m[3], { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(chemin, { mimeType: m[1], dialogTitle: 'Enregistrer ou partager la photo' });
}
