/** Lecture d'un fichier choisi par l'utilisateur (téléphone). */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

/** Ouvre le sélecteur de fichiers ; renvoie le contenu texte, ou null si l'utilisateur annule. */
export async function choisirFichierTexte(): Promise<{ nom: string; contenu: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  const fichier = r.assets[0];
  return { nom: fichier.name, contenu: await FileSystem.readAsStringAsync(fichier.uri) };
}
