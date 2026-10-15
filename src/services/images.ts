/**
 * Photos et images : appareil photo ou galerie, puis réduction et conversion en image « data: »
 * (stockée dans la base chiffrée, donc incluse dans les sauvegardes).
 */
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export type SourceImage = 'camera' | 'galerie';

export interface OptionsImage {
  /** Largeur maximale en pixels après réduction. */
  largeur: number;
  /** PNG garde la transparence (signature) ; JPEG est plus léger (photo). */
  format: 'png' | 'jpeg';
}

/** Ouvre l'appareil photo ou la galerie ; renvoie l'image réduite, ou null si l'utilisateur annule. */
export async function choisirImage(source: SourceImage, options: OptionsImage): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Autorisez l’appareil photo d’Onílé dans les réglages Android.');
  }
  const lancer = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
  const resultat = await lancer({ mediaTypes: ['images'], quality: 1, allowsEditing: source === 'camera' });
  if (resultat.canceled || !resultat.assets[0]) return null;
  const image = resultat.assets[0];
  const largeur = Math.min(options.largeur, image.width || options.largeur);
  const reduite = await manipulateAsync(image.uri, [{ resize: { width: largeur } }], {
    compress: 0.7,
    format: options.format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG,
    base64: true,
  });
  if (!reduite.base64) throw new Error('Image illisible.');
  return `data:image/${options.format};base64,${reduite.base64}`;
}
