/** Aperçu web : Alert de react-native n'existe pas sur le web, on utilise les boîtes du navigateur. */
export function confirmer(titre: string, message: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${titre}\n\n${message}`));
}

export function informer(titre: string, message: string): void {
  window.alert(`${titre}\n\n${message}`);
}
