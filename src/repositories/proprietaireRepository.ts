import type { SqlDatabase } from '../db/types';

export interface ProfilProprietaire {
  nom: string;
  telephone: string | null;
  adresse: string | null;
}

export interface Proprietaire extends ProfilProprietaire {
  id: 1;
  logo_uri: string | null;
  /** Signature du bailleur (image « data: »), apposée sur les contrats, reçus et factures. */
  signature: string | null;
  solde_initial: number;
  cree_le: string;
}

export async function getProprietaire(db: SqlDatabase): Promise<Proprietaire | null> {
  return db.get<Proprietaire>('SELECT * FROM proprietaire WHERE id = 1');
}

const nettoyer = (valeur: string | null | undefined) => {
  const v = valeur?.trim();
  return v ? v : null;
};

/** Crée ou met à jour l'unique profil propriétaire. */
export async function enregistrerProprietaire(
  db: SqlDatabase,
  profil: ProfilProprietaire,
  maintenant: () => string = () => new Date().toISOString()
): Promise<Proprietaire> {
  const nom = profil.nom.trim();
  if (!nom) throw new Error('Le nom du propriétaire est obligatoire.');
  await db.run(
    `INSERT INTO proprietaire (id, nom, telephone, adresse, cree_le) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET nom = excluded.nom, telephone = excluded.telephone, adresse = excluded.adresse`,
    [nom, nettoyer(profil.telephone), nettoyer(profil.adresse), maintenant()]
  );
  return (await getProprietaire(db))!;
}

/** Enregistre (image « data: » PNG, JPEG ou SVG) ou retire (null) la signature du propriétaire. */
export async function definirSignature(db: SqlDatabase, image: string | null): Promise<void> {
  if (image !== null && !/^data:image\/(png|jpeg|svg\+xml);/.test(image)) throw new Error('Signature invalide.');
  await db.run('UPDATE proprietaire SET signature = ? WHERE id = 1', [image]);
}
