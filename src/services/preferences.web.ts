/** Aperçu web : préférences dans localStorage. */
const CLE = 'onile.preferences';

export async function lirePreferences(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(CLE) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export async function ecrirePreferences(valeurs: Record<string, unknown>): Promise<void> {
  try {
    globalThis.localStorage?.setItem(CLE, JSON.stringify(valeurs));
  } catch {
    // Sans stockage : la visite sera proposée à nouveau.
  }
}
