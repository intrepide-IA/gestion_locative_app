/** Branchement des services de sécurité sur les modules natifs (expo-secure-store, expo-crypto). */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { createPinService, type SecureKeyValueStore } from './pin';

const secureStore: SecureKeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const pinService = createPinService({
  store: secureStore,
  sha256: (data) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data),
  randomHex: (n) => toHex(Crypto.getRandomBytes(n)),
  now: () => Date.now(),
});

const DATABASE_KEY = 'onile.db.key.v1';

/**
 * Clé de chiffrement SQLCipher (256 bits), créée au premier lancement et gardée dans le Keystore Android.
 * Si elle est perdue (désinstallation), la base chiffrée est illisible : d'où l'importance des sauvegardes.
 */
export async function getOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY);
  if (existing) return existing;
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(DATABASE_KEY, key);
  return key;
}
