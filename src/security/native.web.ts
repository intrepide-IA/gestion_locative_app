/**
 * Version web, réservée à l'aperçu de développement dans un navigateur.
 * expo-secure-store n'existe pas sur le web : le PIN est gardé dans localStorage, SANS protection.
 * L'application distribuée est Android uniquement et utilise `native.ts`.
 */
import * as Crypto from 'expo-crypto';

import { createPinService, type SecureKeyValueStore } from './pin';

const PREFIX = 'onile.apercu-web.';

const webStore: SecureKeyValueStore = {
  getItem: async (key) => globalThis.localStorage?.getItem(PREFIX + key) ?? null,
  setItem: async (key, value) => globalThis.localStorage?.setItem(PREFIX + key, value),
  deleteItem: async (key) => globalThis.localStorage?.removeItem(PREFIX + key),
};

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const pinService = createPinService({
  store: webStore,
  sha256: (data) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data),
  randomHex: (n) => toHex(Crypto.getRandomBytes(n)),
  now: () => Date.now(),
});

/** Pas de SQLCipher sur le web : la base de l'aperçu n'est pas chiffrée. */
export async function getOrCreateDatabaseKey(): Promise<string> {
  return '';
}
