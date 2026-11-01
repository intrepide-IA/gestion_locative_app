/** Aperçu web : la lecture des photos et des PDF se fait sur le téléphone (module Android). */
import { ErreurMetier } from '../domain/erreurs';
import type { ContratReconnu } from '../domain/miseEnFormeContrat';

export const PAGES_MAX = 15;

const indisponible = () => new ErreurMetier('La lecture des photos et des PDF n’est disponible que dans l’application Android.');

export async function lirePhotos(_uris: string[], _onPage: (rang: number, total: number) => void): Promise<ContratReconnu> {
  throw indisponible();
}

export async function lirePdf(_uri: string): Promise<ContratReconnu> {
  throw indisponible();
}

export async function choisirPhotos(): Promise<string[] | null> {
  throw indisponible();
}

export async function choisirPdf(): Promise<string | null> {
  throw indisponible();
}
