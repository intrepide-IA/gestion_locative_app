/**
 * Synchronisation dans le cloud (Supabase) : chaque propriétaire a un compte (e-mail + mot de passe) et
 * ne voit que ses sauvegardes. Les données sont chiffrées sur le téléphone avant l'envoi (même format que
 * la sauvegarde manuelle) : Supabase ne peut pas les lire. On peut les récupérer sur n'importe quel téléphone.
 *
 * Configuration (au moment du build) : EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY.
 */
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { getDatabase, maisons } from '../db/client';
import { SCHEMA_VERSION } from '../db/schema';
import { APP_VERSION } from '../constants';
import { ErreurMetier } from '../domain/erreurs';
import { aujourdhui } from '../domain/format';
import { exporterSauvegarde } from '../repositories/sauvegardeRepository';
import { chiffrerFichier, preparerRestauration } from './sauvegarde';

const URL_SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const CLE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const synchronisationConfiguree = () => URL_SUPABASE.startsWith('https://') && CLE_ANON.length > 20;

/** Session de connexion conservée dans la base chiffrée de l'application (table parametres). */
const stockage = {
  async getItem(cle: string) {
    const db = await getDatabase();
    return (await db.get<{ valeur: string }>('SELECT valeur FROM parametres WHERE cle = ?', [`supabase:${cle}`]))?.valeur ?? null;
  },
  async setItem(cle: string, valeur: string) {
    const db = await getDatabase();
    await db.run('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur', [
      `supabase:${cle}`,
      valeur,
    ]);
  },
  async removeItem(cle: string) {
    const db = await getDatabase();
    await db.run('DELETE FROM parametres WHERE cle = ?', [`supabase:${cle}`]);
  },
};

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!synchronisationConfiguree()) throw new ErreurMetier('La synchronisation n’est pas encore configurée dans cette version.');
  client ??= createClient(URL_SUPABASE, CLE_ANON, {
    auth: { storage: stockage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return client;
}

/** Messages Supabase traduits pour l'utilisateur. */
function traduire(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.';
  if (/already registered|already exists/i.test(message)) return 'Un compte existe déjà avec cet e-mail : connectez-vous.';
  if (/email not confirmed/i.test(message)) return 'Confirmez d’abord votre e-mail (lien reçu par e-mail), puis connectez-vous.';
  if (/password should be at least/i.test(message)) return 'Mot de passe trop court (8 caractères au moins).';
  if (/network|fetch/i.test(message)) return 'Pas de connexion Internet. Réessayez plus tard.';
  return message;
}

function verifier<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new ErreurMetier(traduire(r.error.message));
  return r.data;
}

export async function compteConnecte(): Promise<string | null> {
  if (!synchronisationConfiguree()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user.email ?? null;
}

export async function creerCompte(email: string, motDePasse: string): Promise<'connecte' | 'confirmation'> {
  if (motDePasse.length < 8) throw new ErreurMetier('Mot de passe trop court (8 caractères au moins).');
  const data = verifier(await supabase().auth.signUp({ email: email.trim(), password: motDePasse }));
  return data.session ? 'connecte' : 'confirmation';
}

export async function connecter(email: string, motDePasse: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: motDePasse });
  if (error) throw new ErreurMetier(traduire(error.message));
}

export async function deconnecter(): Promise<void> {
  await supabase().auth.signOut();
}

export interface SauvegardeCloud {
  id: string;
  cree_le: string;
  appareil: string | null;
  version_app: string | null;
  taille: number;
}

/** Chiffre toute la base avec le mot de passe de chiffrement, puis l'envoie dans le compte. */
export async function synchroniserMaintenant(motDePasseChiffrement: string): Promise<void> {
  const db = await getDatabase();
  const fichier = JSON.stringify(await chiffrerFichier(JSON.stringify(await exporterSauvegarde(db)), motDePasseChiffrement));
  verifier(
    await supabase()
      .from('sauvegardes')
      .insert({ donnees: fichier, taille: fichier.length, appareil: `${(await maisons.active()).nom} · ${Platform.OS} ${Platform.Version}`, version_app: APP_VERSION, schema: SCHEMA_VERSION })
  );
  await db.run('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur', [
    'derniere_synchronisation',
    new Date().toISOString(),
  ]);
  await db.run('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur', [
    'derniere_sauvegarde',
    aujourdhui(),
  ]);
}

export async function listerSauvegardesCloud(): Promise<SauvegardeCloud[]> {
  return verifier(
    await supabase().from('sauvegardes').select('id, cree_le, appareil, version_app, taille').order('cree_le', { ascending: false }).limit(20)
  ) as SauvegardeCloud[];
}

/** Télécharge et déchiffre une sauvegarde du compte ; renvoie de quoi confirmer puis restaurer. */
export async function recupererSauvegardeCloud(id: string, motDePasseChiffrement: string) {
  const ligne = verifier(await supabase().from('sauvegardes').select('donnees').eq('id', id).single()) as { donnees: string };
  let brut: unknown;
  try {
    brut = JSON.parse(ligne.donnees);
  } catch {
    throw new ErreurMetier('Sauvegarde illisible.');
  }
  return preparerRestauration(brut, motDePasseChiffrement);
}

export async function derniereSynchronisation(): Promise<string | null> {
  const db = await getDatabase();
  return (await db.get<{ valeur: string }>("SELECT valeur FROM parametres WHERE cle = 'derniere_synchronisation'"))?.valeur ?? null;
}
