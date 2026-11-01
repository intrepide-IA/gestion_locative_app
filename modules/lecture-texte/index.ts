import { requireOptionalNativeModule } from 'expo-modules-core';

/** Une ligne reconnue, avec sa position sur la page (en pixels de l'image). */
export interface LigneLue {
  texte: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** Bloc (paragraphe) auquel ML Kit rattache la ligne. */
  bloc: number;
}

export interface PageLue {
  largeur: number;
  hauteur: number;
  lignes: LigneLue[];
}

interface ModuleLecture {
  /** Photo (file:// ou content://) : texte reconnu ligne par ligne. */
  lireImage(uri: string): Promise<PageLue>;
  /** PDF : chaque page est rendue en image puis lue (au plus `pagesMax` pages). */
  lirePdf(uri: string, pagesMax: number): Promise<PageLue[]>;
}

/** Module natif Android (absent sur le web et dans Expo Go : null). */
export const LectureTexte = requireOptionalNativeModule<ModuleLecture>('LectureTexte');
