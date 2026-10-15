/**
 * Police Onílé. Sur Android, Inter est embarquée dans l'APK comme famille « Inter » à 4 graisses
 * (plugin expo-font dans app.json) : `fontFamily: 'Inter'` + `fontWeight` choisit le bon fichier.
 */
export const FONT_FAMILY = 'Inter';

/** Rien à charger sur Android : les polices sont dans l'APK. */
export async function loadFonts(): Promise<void> {}
