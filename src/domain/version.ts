/** Comparaison de numéros de version « 1.0.11 » (chiffre par chiffre, pas en texte). */
export function versionPlusRecente(candidate: string, actuelle: string): boolean {
  const a = candidate.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const b = actuelle.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** Texte de la notification : ce qui a été corrigé ou ajouté, puis l'invitation à mettre à jour. */
export function texteMiseAJour(notes: string | null): string {
  const propres = (notes ?? '')
    .split('\n')
    .map((l) => l.replace(/^[-*•\s]+/, '').trim())
    .filter(Boolean)
    .join(' · ');
  const resume = propres.length > 280 ? `${propres.slice(0, 277)}…` : propres;
  return `${resume ? `Nouveautés : ${resume}` : 'Corrections et améliorations.'}\nTouchez pour mettre à jour.`;
}
