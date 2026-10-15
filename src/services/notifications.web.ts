/** Aperçu web : les notifications locales n'existent que sur le téléphone. */
export async function demanderPermissionNotifications(): Promise<boolean> {
  return false;
}

export async function synchroniserNotifications(): Promise<void> {}

export async function reinitialiserNotifications(): Promise<void> {}

export async function annulerRappelsDeLaMaison(): Promise<void> {}

export async function envoyerNotificationTest(): Promise<'programmee' | 'refusee'> {
  return 'refusee';
}

export interface EtatRappels {
  autorisees: boolean;
  programmes: number;
  prochain: { titre: string; date: Date } | null;
}

export async function etatRappels(): Promise<EtatRappels> {
  return { autorisees: false, programmes: 0, prochain: null };
}
