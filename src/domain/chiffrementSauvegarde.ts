/**
 * Chiffrement d'un fichier de sauvegarde par mot de passe : PBKDF2-SHA256 (sel aléatoire) → clé AES-256-GCM.
 * L'AES est injecté (expo-crypto sur le téléphone, node:crypto dans les tests).
 */
import { ErreurMetier } from './erreurs';
import { pbkdf2Sha256 } from './pbkdf2';

export const FORMAT_CHIFFRE = 'onile-sauvegarde-chiffree';
export const ITERATIONS = 30000;
export const LONGUEUR_MIN_MOT_DE_PASSE = 6;

export interface Aes {
  chiffrer(cle: Uint8Array, clair: Uint8Array): Promise<{ iv: Uint8Array; donnees: Uint8Array }>;
  /** Doit échouer si la clé est fausse ou les données modifiées (tag GCM). */
  dechiffrer(cle: Uint8Array, iv: Uint8Array, donnees: Uint8Array): Promise<Uint8Array>;
  aleatoire(n: number): Uint8Array;
}

export interface FichierChiffre {
  format: typeof FORMAT_CHIFFRE;
  version: 1;
  kdf: { algo: 'PBKDF2-SHA256'; iterations: number; sel: string };
  iv: string;
  donnees: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function versBase64(octets: Uint8Array): string {
  let s = '';
  for (let i = 0; i < octets.length; i += 3) {
    const n = (octets[i] << 16) | ((octets[i + 1] ?? 0) << 8) | (octets[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < octets.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < octets.length ? B64[n & 63] : '=');
  }
  return s;
}

export function depuisBase64(texte: string): Uint8Array {
  const propre = texte.replace(/[^A-Za-z0-9+/]/g, '');
  const sortie = new Uint8Array(Math.floor((propre.length * 3) / 4));
  let j = 0;
  for (let i = 0; i < propre.length; i += 4) {
    const n = (B64.indexOf(propre[i]) << 18) | (B64.indexOf(propre[i + 1]) << 12) | ((B64.indexOf(propre[i + 2]) & 63) << 6) | (B64.indexOf(propre[i + 3]) & 63);
    if (j < sortie.length) sortie[j++] = (n >> 16) & 255;
    if (j < sortie.length) sortie[j++] = (n >> 8) & 255;
    if (j < sortie.length) sortie[j++] = n & 255;
  }
  return sortie;
}

const encodeur = new TextEncoder();

/**
 * Décodage UTF-8 écrit à la main : le TextDecoder du téléphone (Hermes) peut lire au-delà
 * d'une vue Uint8Array renvoyée par le module natif et ajouter des octets parasites.
 */
export function depuisUtf8(vue: Uint8Array): string {
  const o = Uint8Array.from(vue);
  let s = '';
  let morceau: number[] = [];
  for (let i = 0; i < o.length; ) {
    const c = o[i];
    let point: number;
    if (c < 0x80) {
      point = c;
      i += 1;
    } else if (c >= 0xc0 && c < 0xe0) {
      point = ((c & 0x1f) << 6) | (o[i + 1] & 0x3f);
      i += 2;
    } else if (c >= 0xe0 && c < 0xf0) {
      point = ((c & 0x0f) << 12) | ((o[i + 1] & 0x3f) << 6) | (o[i + 2] & 0x3f);
      i += 3;
    } else if (c >= 0xf0) {
      point = ((c & 0x07) << 18) | ((o[i + 1] & 0x3f) << 12) | ((o[i + 2] & 0x3f) << 6) | (o[i + 3] & 0x3f);
      i += 4;
    } else {
      point = 0xfffd;
      i += 1;
    }
    morceau.push(point);
    if (morceau.length >= 8192) {
      s += String.fromCodePoint(...morceau);
      morceau = [];
    }
  }
  return s + String.fromCodePoint(...morceau);
}

export function deriverCle(motDePasse: string, sel: Uint8Array, iterations = ITERATIONS): Uint8Array {
  return pbkdf2Sha256(encodeur.encode(motDePasse), sel, iterations, 32);
}

export async function chiffrerSauvegarde(json: string, motDePasse: string, aes: Aes, iterations = ITERATIONS): Promise<FichierChiffre> {
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new ErreurMetier(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`);
  }
  const sel = aes.aleatoire(16);
  const { iv, donnees } = await aes.chiffrer(deriverCle(motDePasse, sel, iterations), encodeur.encode(json));
  return {
    format: FORMAT_CHIFFRE,
    version: 1,
    kdf: { algo: 'PBKDF2-SHA256', iterations, sel: versBase64(sel) },
    iv: versBase64(iv),
    donnees: versBase64(donnees),
  };
}

export function estFichierChiffre(v: unknown): v is FichierChiffre {
  return typeof v === 'object' && v !== null && (v as { format?: unknown }).format === FORMAT_CHIFFRE;
}

export async function dechiffrerSauvegarde(fichier: FichierChiffre, motDePasse: string, aes: Aes): Promise<string> {
  if (fichier.version !== 1 || fichier.kdf?.algo !== 'PBKDF2-SHA256' || !Number.isInteger(fichier.kdf.iterations)) {
    throw new ErreurMetier('Format de sauvegarde chiffrée non pris en charge.');
  }
  const cle = deriverCle(motDePasse, depuisBase64(fichier.kdf.sel), fichier.kdf.iterations);
  try {
    const clair = await aes.dechiffrer(cle, depuisBase64(fichier.iv), depuisBase64(fichier.donnees));
    return depuisUtf8(clair);
  } catch {
    throw new ErreurMetier('Mot de passe incorrect ou fichier endommagé.');
  }
}

/**
 * Lit le texte d'un fichier de sauvegarde. Tolère ce que les transferts ajoutent parfois :
 * marque d'ordre des octets (BOM), espaces ou retours à la ligne autour du JSON.
 */
export function lireTexteSauvegarde(texte: string): unknown {
  // Caract\u00E8res de contr\u00F4le (octets nuls\u2026) : jamais pr\u00E9sents tels quels dans un JSON valide.
  const propre = texte
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  const debut = propre.indexOf('{');
  const fin = propre.lastIndexOf('}');
  if (debut === -1 || fin < debut) throw new Error('Pas de JSON');
  return JSON.parse(propre.slice(debut, fin + 1));
}
