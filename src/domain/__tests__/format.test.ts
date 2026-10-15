import { aujourdhui, formatDate, formatFCFA, formatMois, initiales, lireMontant } from '../format';

test('montants en FCFA avec espaces fines', () => {
  expect(formatFCFA(1250000)).toBe('1 250 000 FCFA');
  expect(formatFCFA(0)).toBe('0 FCFA');
  expect(formatFCFA(-11000)).toBe('−11 000 FCFA');
});

test('dates et mois en français', () => {
  expect(formatDate('2026-10-01')).toBe('1 oct. 2026');
  expect(formatDate('2026-12-31T22:00:00.000Z')).toBe('31 déc. 2026');
  expect(formatMois(8, 2026)).toBe('août 2026');
  expect(aujourdhui(new Date(2026, 0, 5))).toBe('2026-01-05');
});

test('initiales', () => {
  expect(initiales(' moussa  adéyèmi koné ')).toBe('MA');
});

test('lecture stricte des montants saisis', () => {
  expect(lireMontant('25 000')).toBe(25000);
  expect(lireMontant('25000')).toBe(25000);
  expect(lireMontant('12abc')).toBeNull();
  expect(lireMontant('12,5')).toBeNull();
  expect(lireMontant('')).toBeNull();
});
