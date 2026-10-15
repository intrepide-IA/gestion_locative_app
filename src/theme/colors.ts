/**
 * Palette Onílé — source unique des couleurs pour l'app, les PDF et la landing page.
 * Voir le cahier des charges, section 4 « Identité visuelle ».
 */
export const colors = {
  primary: '#0F6B4F',
  secondary: '#2E9E7A',
  accent: '#F5B301',
  background: '#FBF6EF',
  ink: '#1F2937',
  muted: '#6B7280',
  border: '#E5E7EB',
  danger: '#EF4444',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;
