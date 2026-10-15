const { colors } = require('./src/theme/colors.tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.ts', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...colors,
        // Alias conservés pour les écrans existants.
        alert: colors.danger,
      },
      fontFamily: {
        // Inter : famille embarquée dans l'APK (plugin expo-font) ; la graisse vient de font-medium, font-bold…
        sans: ['Inter'],
      },
    },
  },
  plugins: [],
};
