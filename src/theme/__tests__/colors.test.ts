import { colors } from '../colors';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokens = require('../colors.tokens');

test('les tokens Tailwind et la palette TypeScript sont identiques', () => {
  expect(tokens.colors).toEqual(colors);
});
