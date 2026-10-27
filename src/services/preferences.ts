/**
 * Petites préférences de l'appareil (hors base de données de la maison) : fichier JSON privé de l'application.
 * Ex. étapes de la visite guidée déjà vues. Jamais de donnée sensible ici.
 */
import * as FileSystem from 'expo-file-system/legacy';

const FICHIER = `${FileSystem.documentDirectory}preferences.json`;

export async function lirePreferences(): Promise<Record<string, unknown>> {
  try {
    const info = await FileSystem.getInfoAsync(FICHIER);
    if (!info.exists) return {};
    const contenu = JSON.parse(await FileSystem.readAsStringAsync(FICHIER));
    return contenu && typeof contenu === 'object' ? contenu : {};
  } catch {
    return {};
  }
}

export async function ecrirePreferences(valeurs: Record<string, unknown>): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(FICHIER, JSON.stringify(valeurs));
  } catch {
    // Préférence perdue au pire : la visite sera simplement proposée à nouveau.
  }
}
