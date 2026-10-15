/** Constantes de l'application */

export const APP_NAME = 'Onílé';
export const APP_VERSION = '0.3.0';

/** Préférences non sensibles (AsyncStorage). Le PIN et la clé de la base sont dans expo-secure-store. */
export const STORAGE_KEYS = {
  NOTIFICATIONS: 'gestiloc_notifications',
  FACTURE_COUNTER: 'gestiloc_facture_counter',
} as const;
