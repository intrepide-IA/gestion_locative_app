/**
 * Images : réduction et conversion en image « data: » (stockée dans la base chiffrée, donc sauvegardée).
 * La photo se prend avec l'appareil intégré (composant PrisePhoto) ; l'import passe par le sélecteur
 * de fichiers, plus fiable sur Android que le sélecteur de photos.
 */
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

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
