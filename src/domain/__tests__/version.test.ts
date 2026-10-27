import { versionPlusRecente } from '../version';

test('compare les versions chiffre par chiffre', () => {
  expect(versionPlusRecente('1.0.11', '1.0.10')).toBe(true);
  expect(versionPlusRecente('1.0.10', '1.0.9')).toBe(true);
  expect(versionPlusRecente('1.0.9', '1.0.10')).toBe(false);
  expect(versionPlusRecente('1.0.11', '1.0.11')).toBe(false);
  expect(versionPlusRecente('2.0', '1.9.9')).toBe(true);
});
