/**
 * Aperçu web : déclare la famille « Inter » avec ses 4 graisses (@font-face), comme la famille Android.
 */
import { Asset } from 'expo-asset';

export const FONT_FAMILY = 'Inter';

const FICHIERS: [number, number][] = [
  [400, require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf')],
  [500, require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf')],
  [600, require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf')],
  [700, require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf')],
];

export async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || document.getElementById('onile-fonts')) return;
  const regles = FICHIERS.map(
    ([poids, module]) =>
      `@font-face{font-family:'${FONT_FAMILY}';font-weight:${poids};font-display:swap;src:url('${Asset.fromModule(module).uri}') format('truetype');}`
  ).join('\n');
  const style = document.createElement('style');
  style.id = 'onile-fonts';
  style.textContent = regles;
  document.head.appendChild(style);
  await Promise.all(FICHIERS.map(([poids]) => document.fonts.load(`${poids} 16px ${FONT_FAMILY}`)));
}
