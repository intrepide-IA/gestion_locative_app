/** Aperçu web : sélection d'un fichier via le navigateur. */
export function choisirFichierTexte(): Promise<{ nom: string; contenu: string } | null> {
  return new Promise((resolve) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = '.json,application/json';
    champ.onchange = async () => {
      const f = champ.files?.[0];
      resolve(f ? { nom: f.name, contenu: await f.text() } : null);
    };
    champ.click();
  });
}
