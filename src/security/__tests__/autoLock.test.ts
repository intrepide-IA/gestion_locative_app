import { LOCK_AFTER_BACKGROUND_MS, shouldLockOnResume } from '../autoLock';

test('reverrouille après 2 minutes en arrière-plan, pas avant', () => {
  expect(shouldLockOnResume(null, 10_000)).toBe(false);
  expect(shouldLockOnResume(0, LOCK_AFTER_BACKGROUND_MS - 1)).toBe(false);
  expect(shouldLockOnResume(0, LOCK_AFTER_BACKGROUND_MS)).toBe(true);
});
