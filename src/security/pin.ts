/**
 * Code PIN : format, hachage, limitation des essais.
 * Logique pure, sans module natif : le stockage, le hachage et l'horloge sont injectés (testables sous Node).
 */

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
/** Échecs autorisés avant le premier blocage. */
export const MAX_ATTEMPTS_BEFORE_LOCK = 5;
/** Paliers de blocage, en minutes, comme sur un iPhone : 5 min, 10 min, 15 min… jusqu'à 3 h. */
export const LOCK_STEPS_MINUTES = [5, 10, 15, 30, 60, 180] as const;
export const MAX_LOCK_SECONDS = LOCK_STEPS_MINUTES[LOCK_STEPS_MINUTES.length - 1] * 60;
/** Échecs à partir desquels le blocage de 3 h a été atteint : la récupération des données est proposée. */
export const FAILURES_FOR_RECOVERY = MAX_ATTEMPTS_BEFORE_LOCK + LOCK_STEPS_MINUTES.length - 1;

/** Stockage clé/valeur sécurisé (expo-secure-store sur le téléphone, mémoire dans les tests). */
export interface SecureKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface PinDependencies {
  store: SecureKeyValueStore;
  /** SHA-256 en hexadécimal. */
  sha256: (data: string) => Promise<string>;
  /** Octets aléatoires cryptographiques, en hexadécimal. */
  randomHex: (byteCount: number) => string;
  now: () => number;
}

const KEYS = {
  record: 'onile.pin.v1',
  attempts: 'onile.pin.attempts.v1',
} as const;

interface PinRecord {
  salt: string;
  hash: string;
  length: number;
}

interface AttemptsState {
  failures: number;
  lockedUntil: number;
}

export type PinFormatError = 'longueur' | 'chiffres' | 'trop_simple';

/** Vérifie le format d'un nouveau PIN. Refuse les suites évidentes (1234, 0000…). */
export function validateNewPin(pin: string): PinFormatError | null {
  if (!/^\d+$/.test(pin)) return 'chiffres';
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) return 'longueur';
  const digits = pin.split('').map(Number);
  const allSame = digits.every((d) => d === digits[0]);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  if (allSame || ascending || descending) return 'trop_simple';
  return null;
}

export const PIN_FORMAT_MESSAGES: Record<PinFormatError, string> = {
  longueur: `Le code doit contenir de ${PIN_MIN_LENGTH} à ${PIN_MAX_LENGTH} chiffres.`,
  chiffres: 'Le code ne doit contenir que des chiffres.',
  trop_simple: 'Code trop simple (suite ou chiffres identiques) : choisissez-en un autre.',
};

/** Durée de blocage après `failures` échecs consécutifs : 0 avant le 5e, puis les paliers, plafonnés à 3 h. */
export function lockSecondsAfter(failures: number): number {
  if (failures < MAX_ATTEMPTS_BEFORE_LOCK) return 0;
  const palier = Math.min(failures - MAX_ATTEMPTS_BEFORE_LOCK, LOCK_STEPS_MINUTES.length - 1);
  return LOCK_STEPS_MINUTES[palier] * 60;
}

export type VerifyResult =
  | { status: 'ok' }
  | { status: 'wrong'; remainingBeforeLock: number; lockedUntil: number | null }
  | { status: 'locked'; lockedUntil: number }
  | { status: 'no_pin' };

export function createPinService(deps: PinDependencies) {
  const { store, sha256, randomHex, now } = deps;

  const hashPin = (pin: string, salt: string) => sha256(`${salt}:${pin}`);

  async function readRecord(): Promise<PinRecord | null> {
    const raw = await store.getItem(KEYS.record);
    return raw ? (JSON.parse(raw) as PinRecord) : null;
  }

  async function readAttempts(): Promise<AttemptsState> {
    const raw = await store.getItem(KEYS.attempts);
    return raw ? (JSON.parse(raw) as AttemptsState) : { failures: 0, lockedUntil: 0 };
  }

  async function writeAttempts(state: AttemptsState): Promise<void> {
    if (state.failures === 0) await store.deleteItem(KEYS.attempts);
    else await store.setItem(KEYS.attempts, JSON.stringify(state));
  }

  async function savePin(pin: string): Promise<void> {
    const error = validateNewPin(pin);
    if (error) throw new Error(PIN_FORMAT_MESSAGES[error]);
    const salt = randomHex(16);
    const record: PinRecord = { salt, hash: await hashPin(pin, salt), length: pin.length };
    await store.setItem(KEYS.record, JSON.stringify(record));
    await writeAttempts({ failures: 0, lockedUntil: 0 });
  }

  return {
    async hasPin(): Promise<boolean> {
      return (await readRecord()) !== null;
    },

    /** Longueur du PIN enregistré : l'écran valide automatiquement dès qu'elle est atteinte. */
    async pinLength(): Promise<number | null> {
      return (await readRecord())?.length ?? null;
    },

    /** Blocage en cours (horodatage de fin), ou null. Survit au redémarrage de l'app. */
    async currentLock(): Promise<number | null> {
      const { lockedUntil } = await readAttempts();
      return lockedUntil > now() ? lockedUntil : null;
    },

    /**
     * Code oublié : après le blocage de 3 h, la personne peut récupérer ses données
     * (confirmation par le verrouillage du téléphone, puis export chiffré).
     */
    async recoveryAvailable(): Promise<boolean> {
      const { failures, lockedUntil } = await readAttempts();
      return failures >= FAILURES_FOR_RECOVERY && lockedUntil <= now();
    },

    /**
     * Code oublié, après le blocage de 3 h et la confirmation par le verrouillage du téléphone :
     * un nouveau code remplace l'ancien. Refusé tant que la récupération n'est pas ouverte.
     */
    async replaceForgottenPin(newPin: string): Promise<void> {
      if (!(await this.recoveryAvailable())) throw new Error('La récupération n’est pas encore possible.');
      await savePin(newPin);
    },

    /** Déverrouillage par empreinte ou visage réussi : les erreurs de code sont oubliées. */
    async resetAttempts(): Promise<void> {
      await writeAttempts({ failures: 0, lockedUntil: 0 });
    },

    /** Premier lancement uniquement : refuse d'écraser un PIN existant. */
    async createPin(pin: string): Promise<void> {
      if (await readRecord()) throw new Error('Un code PIN existe déjà.');
      await savePin(pin);
    },

    async verify(pin: string): Promise<VerifyResult> {
      const record = await readRecord();
      if (!record) return { status: 'no_pin' };
      const attempts = await readAttempts();
      if (attempts.lockedUntil > now()) return { status: 'locked', lockedUntil: attempts.lockedUntil };

      if ((await hashPin(pin, record.salt)) === record.hash) {
        await writeAttempts({ failures: 0, lockedUntil: 0 });
        return { status: 'ok' };
      }

      const failures = attempts.failures + 1;
      const lockSeconds = lockSecondsAfter(failures);
      const lockedUntil = lockSeconds > 0 ? now() + lockSeconds * 1000 : 0;
      await writeAttempts({ failures, lockedUntil });
      return {
        status: 'wrong',
        remainingBeforeLock: Math.max(0, MAX_ATTEMPTS_BEFORE_LOCK - failures),
        lockedUntil: lockedUntil || null,
      };
    },

    /** Change le PIN après vérification de l'ancien (soumise à la même limitation des essais). */
    async changePin(currentPin: string, newPin: string): Promise<VerifyResult> {
      const result = await this.verify(currentPin);
      if (result.status === 'ok') await savePin(newPin);
      return result;
    },
  };
}

export type PinService = ReturnType<typeof createPinService>;
