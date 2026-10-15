import { createHash, randomBytes } from 'node:crypto';

import { createPinService, lockSecondsAfter, validateNewPin, type SecureKeyValueStore } from '../pin';

function memoryStore(): SecureKeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => void data.set(key, value),
    deleteItem: async (key) => void data.delete(key),
  };
}

function setup() {
  const store = memoryStore();
  let clock = 1_000_000;
  const service = createPinService({
    store,
    sha256: async (s) => createHash('sha256').update(s).digest('hex'),
    randomHex: (n) => randomBytes(n).toString('hex'),
    now: () => clock,
  });
  return { service, store, advance: (ms: number) => (clock += ms), now: () => clock };
}

describe('format du PIN', () => {
  test.each([
    ['1357', null],
    ['204816', null],
    ['123', 'longueur'],
    ['1234567', 'longueur'],
    ['12a4', 'chiffres'],
    ['1234', 'trop_simple'],
    ['0000', 'trop_simple'],
    ['654321', 'trop_simple'],
  ])('%s → %s', (pin, expected) => {
    expect(validateNewPin(pin)).toBe(expected);
  });
});

test('blocage : rien avant 5 échecs, puis 30 s doublées, plafonné à 1 h', () => {
  expect([1, 4, 5, 6, 7].map(lockSecondsAfter)).toEqual([0, 0, 30, 60, 120]);
  expect(lockSecondsAfter(50)).toBe(3600);
});

describe('service PIN', () => {
  test('le PIN est stocké haché et salé, jamais en clair', async () => {
    const { service, store } = setup();
    await service.createPin('2580');
    const stored = [...store.data.values()].join('');
    expect(stored).not.toContain('2580');
    expect(await service.pinLength()).toBe(4);
    expect(await service.verify('2580')).toEqual({ status: 'ok' });
  });

  test('aucun PIN par défaut : sans création, la vérification échoue', async () => {
    const { service } = setup();
    expect(await service.hasPin()).toBe(false);
    expect(await service.verify('1234')).toEqual({ status: 'no_pin' });
  });

  test('refuse un PIN trop simple et refuse d’écraser un PIN existant', async () => {
    const { service } = setup();
    await expect(service.createPin('1111')).rejects.toThrow(/trop simple/);
    await service.createPin('2580');
    await expect(service.createPin('3691')).rejects.toThrow(/existe déjà/);
  });

  test('5 erreurs bloquent 30 s, le bon code est refusé pendant le blocage, puis accepté', async () => {
    const { service, advance } = setup();
    await service.createPin('2580');
    for (let i = 0; i < 4; i++) {
      expect((await service.verify('0000')).status).toBe('wrong');
    }
    const fifth = await service.verify('0000');
    expect(fifth).toMatchObject({ status: 'wrong', remainingBeforeLock: 0 });
    expect(await service.verify('2580')).toMatchObject({ status: 'locked' });
    advance(30_001);
    expect(await service.verify('2580')).toEqual({ status: 'ok' });
    expect(await service.currentLock()).toBeNull();
  });

  test('le blocage double à chaque nouvel échec et survit à un redémarrage', async () => {
    const { service, advance, now } = setup();
    await service.createPin('2580');
    for (let i = 0; i < 5; i++) await service.verify('0000');
    advance(30_001);
    const sixth = await service.verify('0000');
    expect(sixth.status === 'wrong' && sixth.lockedUntil! - now()).toBe(60_000);
    expect(await service.currentLock()).toBe(now() + 60_000);
  });

  test('changer le PIN exige l’ancien code', async () => {
    const { service } = setup();
    await service.createPin('2580');
    expect((await service.changePin('1357', '3691')).status).toBe('wrong');
    expect(await service.verify('2580')).toEqual({ status: 'ok' });
    expect(await service.changePin('2580', '3691')).toEqual({ status: 'ok' });
    expect((await service.verify('2580')).status).toBe('wrong');
    expect(await service.verify('3691')).toEqual({ status: 'ok' });
  });
});
