import { creerGestionMaisons } from '../maisons';
import type { SqlDatabase } from '../types';
import { createMigratedDatabase } from './nodeDatabase';
import { enregistrerProprietaire, getProprietaire } from '../../repositories/proprietaireRepository';
import { creerLogement, listerLogements } from '../../repositories/logementRepository';

function plateforme() {
  const bases = new Map<string, Promise<SqlDatabase>>();
  const stockage = new Map<string, string>();
  const supprimes: string[] = [];
  return {
    supprimes,
    p: {
      fichierPrincipal: 'principale.db',
      ouvrir: (f: string) => {
        if (!bases.has(f)) bases.set(f, createMigratedDatabase());
        return bases.get(f)!;
      },
      fermer: async () => undefined,
      supprimerFichier: async (f: string) => {
        supprimes.push(f);
        bases.delete(f);
      },
      lire: async (c: string) => stockage.get(c) ?? null,
      ecrire: async (c: string, v: string) => void stockage.set(c, v),
    },
  };
}

test('maisons séparées : profil copié, données distinctes, bascule, suppression protégée', async () => {
  const { p, supprimes } = plateforme();
  const m = creerGestionMaisons(p);
  expect((await m.active()).fichier).toBe('principale.db');
  const principale = await m.base();
  await enregistrerProprietaire(principale, { nom: 'Imdad', telephone: '01', adresse: 'Cotonou' });
  await principale.run("INSERT INTO parametres (cle, valeur) VALUES ('modele_contrat', '# Mon bail') ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur");
  await creerLogement(principale, { reference: 'Ch 1', type: 'autre', loyer_indicatif: 10000, toilettes: 0 });

  const deux = await m.creer('Maison de Calavi');
  await expect(m.creer('maison de calavi')).rejects.toThrow(/déjà/);
  await m.changer(deux.id);
  const seconde = await m.base();
  expect((await getProprietaire(seconde))?.nom).toBe('Imdad');
  expect(await seconde.get("SELECT valeur FROM parametres WHERE cle = 'modele_contrat'")).toEqual({ valeur: '# Mon bail' });
  expect(await listerLogements(seconde)).toHaveLength(0);

  await expect(m.supprimer(deux.id)).rejects.toThrow(/autre maison/);
  await m.renommer(deux.id, 'Calavi');
  await m.changer('principale');
  expect(await listerLogements(await m.base())).toHaveLength(1);
  await m.supprimer(deux.id);
  expect(supprimes).toEqual([deux.fichier]);
  expect((await m.lister()).map((x) => x.nom)).toEqual(['Ma maison']);
  await expect(m.supprimer('principale')).rejects.toThrow(/seule/);
});
