/** Comparaison de numéros de version « 1.0.11 » (chiffre par chiffre, pas en texte). */
export function versionPlusRecente(candidate: string, actuelle: string): boolean {
  const a = candidate.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const b = actuelle.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
