/** Délai en arrière-plan au-delà duquel le PIN est redemandé (cahier des charges, NF-03). */
export const LOCK_AFTER_BACKGROUND_MS = 2 * 60 * 1000;

/** Faut-il reverrouiller au retour au premier plan ? */
export function shouldLockOnResume(
  backgroundSince: number | null,
  now: number,
  delayMs: number = LOCK_AFTER_BACKGROUND_MS
): boolean {
  return backgroundSince !== null && now - backgroundSince >= delayMs;
}
