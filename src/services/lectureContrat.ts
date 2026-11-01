/**
 * Contrat papier → modèle Onílé : photos (appareil photo ou galerie) ou PDF, lus sur le téléphone
 * (module natif LectureTexte, ML Kit), puis remis en forme (titres, articles, paragraphes, informations à remplir).
 */
import * as DocumentPicker from 'expo-document-picker';

import { LectureTexte, type PageLue } from '../../modules/lecture-texte';
import { ErreurMetier } from '../domain/erreurs';
import { miseEnFormeContrat, type ContratReconnu } from '../domain/miseEnFormeContrat';

export const PAGES_MAX = 15;

function lecteur() {
  if (!LectureTexte) throw new ErreurMetier('La lecture des photos et des PDF n’est disponible que dans l’application Android.');
  return LectureTexte;
}

const expliquer = (error: unknown) => {
  const texte = error instanceof Error ? error.message : String(error);
  return /téléchargement|MODELE_INDISPONIBLE/i.test(texte)
    ? 'Le module de lecture se télécharge (Google Play). Connectez-vous à Internet et réessayez dans une minute.'
    : `Lecture impossible : ${texte}`;
};

function resultat(pages: PageLue[]): ContratReconnu {
  const r = miseEnFormeContrat(pages);
  if (!r.texte.trim()) throw new ErreurMetier('Aucun texte n’a été reconnu. Reprenez une photo plus nette, bien éclairée et sans ombre.');
  return r;
}

/** Lit des photos, dans l'ordre des pages. */
export async function lirePhotos(uris: string[], onPage: (rang: number, total: number) => void): Promise<ContratReconnu> {
  const l = lecteur();
  const pages: PageLue[] = [];
  const liste = uris.slice(0, PAGES_MAX);
  for (const [i, uri] of liste.entries()) {
    onPage(i + 1, liste.length);
    try {
      pages.push(await l.lireImage(uri));
    } catch (error) {
      throw new ErreurMetier(expliquer(error));
    }
  }
  return resultat(pages);
}

/** Lit un PDF : chaque page est transformée en image, puis lue. */
export async function lirePdf(uri: string): Promise<ContratReconnu> {
  const l = lecteur();
  let pages: PageLue[];
  try {
    pages = await l.lirePdf(uri, PAGES_MAX);
  } catch (error) {
    throw new ErreurMetier(expliquer(error));
  }
  return resultat(pages);
}

/** Photos déjà prises (galerie, fichiers), plusieurs à la fois. */
export async function choisirPhotos(): Promise<string[] | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['image/*'], multiple: true, copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  return r.assets.map((a) => a.uri);
}

export async function choisirPdf(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  return r.assets[0].uri;
}
