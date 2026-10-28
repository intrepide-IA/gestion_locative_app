/**
 * Sauvegarde chiffrée de toute la base dans un fichier partageable (WhatsApp, Drive, e-mail…),
 * restauration validée et atomique, réinitialisation.
 */
import * as Crypto from 'expo-crypto';

import { getDatabase, maisons } from '../db/client';
import { partagerFichierTexte } from '../documents/partage';
import {
  chiffrerSauvegarde,
  dechiffrerSauvegarde,
  estFichierChiffre,
  lireTexteSauvegarde,
  type Aes,
} from '../domain/chiffrementSauvegarde';
import { ErreurMetier } from '../domain/erreurs';
import { aujourdhui } from '../domain/format';
import {
  exporterSauvegarde,
  reinitialiserDonnees,
  restaurerSauvegarde,
  validerSauvegarde,
  type ResumeSauvegarde,
} from '../repositories/sauvegardeRepository';
import { choisirFichierTexte } from './fichiers';
import { annulerRappelsDeLaMaison, synchroniserNotifications } from './notifications';

const aesExpo: Aes = {
  async chiffrer(cle, clair) {
    const key = await Crypto.AESEncryptionKey.import(cle);
    const scelle = await Crypto.aesEncryptAsync(clair, key);
    return { iv: await scelle.iv('bytes'), donnees: await scelle.ciphertext({ includeTag: true, encoding: 'bytes' }) };
  },
  async dechiffrer(cle, iv, donnees) {
    const key = await Crypto.AESEncryptionKey.import(cle);
    return Crypto.aesDecryptAsync(Crypto.AESSealedData.fromParts(iv, donnees, 16), key);
  },
  aleatoire: (n) => Crypto.getRandomBytes(n),
};

const CLE_DERNIERE = 'derniere_sauvegarde';

export async function derniereSauvegarde(): Promise<string | null> {
  const db = await getDatabase();
  return (await db.get<{ valeur: string }>('SELECT valeur FROM parametres WHERE cle = ?', [CLE_DERNIERE]))?.valeur ?? null;
}

/** Exporte toute la base, chiffrée par le mot de passe, puis ouvre la feuille de partage. */
export async function exporterEtPartager(motDePasse: string): Promise<void> {
  const db = await getDatabase();
  const json = JSON.stringify(await exporterSauvegarde(db));
  const fichier = await chiffrerSauvegarde(json, motDePasse, aesExpo);
  await partagerFichierTexte(JSON.stringify(fichier), `Onile-${(await maisons.active()).nom}-${aujourdhui()}.json`, 'application/json', 'Enregistrer la sauvegarde');
  await db.run('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur', [
    CLE_DERNIERE,
    aujourdhui(),
  ]);
}

/** Étape 1 : choisir le fichier. Indique s'il faut un mot de passe. */
export async function choisirSauvegarde(): Promise<{ nom: string; brut: unknown; chiffree: boolean } | null> {
  const f = await choisirFichierTexte();
  if (!f) return null;
  let brut: unknown;
  try {
    brut = lireTexteSauvegarde(f.contenu);
  } catch {
    throw new ErreurMetier('Ce fichier n’est pas une sauvegarde Onílé (contenu illisible).');
  }
  return { nom: f.nom, brut, chiffree: estFichierChiffre(brut) };
}

/** Étapes annoncées à l'écran pendant l'ouverture et la restauration d'une sauvegarde. */
export type EtapeRestauration = 'dechiffrement' | 'extraction' | 'verification' | 'remplacement' | 'rappels';

/** Laisse l'écran afficher l'étape avant un calcul long (le déchiffrement occupe le processeur). */
const laisserAfficher = () => new Promise((resolve) => setTimeout(resolve, 60));

/** Étape 2 : déchiffrer (si besoin) et valider ; renvoie le résumé à montrer avant confirmation. */
export async function preparerRestauration(
  brut: unknown,
  motDePasse: string | null,
  onEtape: (etape: EtapeRestauration) => void = () => undefined
): Promise<{ contenu: unknown; resume: ResumeSauvegarde }> {
  let contenu = brut;
  if (estFichierChiffre(brut)) {
    if (!motDePasse) throw new ErreurMetier('Saisissez le mot de passe de la sauvegarde.');
    onEtape('dechiffrement');
    await laisserAfficher();
    const clair = await dechiffrerSauvegarde(brut, motDePasse, aesExpo);
    onEtape('extraction');
    await laisserAfficher();
    try {
      contenu = lireTexteSauvegarde(clair);
    } catch {
      throw new ErreurMetier('Le contenu déchiffré de cette sauvegarde est illisible.');
    }
  }
  onEtape('verification');
  await laisserAfficher();
  const { resume } = await validerSauvegarde(await getDatabase(), contenu);
  return { contenu, resume };
}

/** Étape 3 : remplacement atomique des données, puis rappels recalculés. */
export async function restaurer(contenu: unknown, onEtape: (etape: EtapeRestauration) => void = () => undefined): Promise<ResumeSauvegarde> {
  onEtape('remplacement');
  await laisserAfficher();
  // Les rappels de l'ancienne version des données sont annulés avant d'être recalculés.
  await annulerRappelsDeLaMaison();
  const resume = await restaurerSauvegarde(await getDatabase(), contenu);
  onEtape('rappels');
  await laisserAfficher();
  await synchroniserNotifications();
  return resume;
}

/**
 * Code PIN oublié : chaque maison est exportée dans un fichier chiffré par le nouveau mot de passe,
 * à garder hors du téléphone avant de désinstaller puis réinstaller l'application.
 */
export async function exporterPourRecuperation(motDePasse: string, onMaison: (nom: string, rang: number, total: number) => void): Promise<number> {
  const liste = await maisons.lister();
  for (const [i, maison] of liste.entries()) {
    onMaison(maison.nom, i + 1, liste.length);
    await laisserAfficher();
    const json = JSON.stringify(await exporterSauvegarde(await maisons.basePour(maison)));
    const fichier = await chiffrerSauvegarde(json, motDePasse, aesExpo);
    await partagerFichierTexte(JSON.stringify(fichier), `Onile-${maison.nom}-${aujourdhui()}.json`, 'application/json', `Enregistrer la sauvegarde « ${maison.nom} »`);
  }
  return liste.length;
}

export async function reinitialiser(): Promise<void> {
  await annulerRappelsDeLaMaison();
  await reinitialiserDonnees(await getDatabase());
  await synchroniserNotifications();
}

/** Chiffre un export (JSON) avec le mot de passe : utilisé aussi par la synchronisation cloud. */
export const chiffrerFichier = (json: string, motDePasse: string) => chiffrerSauvegarde(json, motDePasse, aesExpo);
