module.exports = {
  projects: [
    {
      // Logique pure (domaine, base de données) : exécutée sous Node avec node:sqlite.
      displayName: 'domaine',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      transform: { '^.+\.tsx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
    },
  ],
};
