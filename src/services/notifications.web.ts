/** Aperçu web : les notifications locales n'existent que sur le téléphone. */
export async function demanderPermissionNotifications(): Promise<boolean> {
  return false;
}

export async function synchroniserNotifications(): Promise<void> {}

export async function reinitialiserNotifications(): Promise<void> {}
