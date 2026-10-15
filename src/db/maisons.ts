/**
 * Plusieurs maisons : chaque maison a sa propre base (un fichier chiffré distinct). Les données de deux
 * maisons ne peuvent donc jamais se mélanger, et supprimer une maison n'en touche aucune autre.
 * Ce module ne dépend pas de la plateforme : le téléphone et l'aperçu web lui fournissent l'ouverture
 * d'un fichier et un petit stockage clé → valeur pour la liste des maisons.
 */
import type { SqlDatabase } from './types';

export interface Maison {
  id: string;
  nom: string;
  /** Nom du fichier de la base. */
  fichier: string;
}

export interface PlateformeMaisons {
  /** Fichier de la maison d'origine (celle qui existait avant le multi-maisons). */
  fichierPrincipal: string;
  ouvrir(fichier: string): Promise<SqlDatabase>;
  fermer(fichier: string): Promise<void>;
  supprimerFichier(fichier: string): Promise<void>;
  lire(cle: string): Promise<string | null>;
  ecrire(cle: string, valeur: string): Promise<void>;
}

const CLE_LISTE = 'onile.maisons.v1';
const CLE_ACTIVE = 'onile.maison-active.v1';

/** Paramètres copiés d'une maison à l'autre à la création (réglages du propriétaire, pas les données). */
const PARAMETRES_NON_COPIES = /^(supabase:|derniere_)/;

export function creerGestionMaisons(p: PlateformeMaisons) {
  const ouvertes = new Map<string, Promise<SqlDatabase>>();
  const ouvrir = (fichier: string) => {
    let db = ouvertes.get(fichier);
    if (!db) {
      db = p.ouvrir(fichier).catch((error: unknown) => {
        ouvertes.delete(fichier);
        throw error;
      });
      ouvertes.set(fichier, db);
    }
    return db;
  };

  async function lister(): Promise<Maison[]> {
    const brut = await p.lire(CLE_LISTE);
    if (brut) {
      try {
        const liste = JSON.parse(brut) as Maison[];
        if (Array.isArray(liste) && liste.length) return liste;
      } catch {
        // Liste illisible : on repart de la maison principale, sans rien effacer.
      }
    }
    return [{ id: 'principale', nom: 'Ma maison', fichier: p.fichierPrincipal }];
  }

  const enregistrer = (liste: Maison[]) => p.ecrire(CLE_LISTE, JSON.stringify(liste));

  async function active(): Promise<Maison> {
    const liste = await lister();
    const id = await p.lire(CLE_ACTIVE);
    return liste.find((m) => m.id === id) ?? liste[0];
  }

  return {
    lister,
    active,
    /** Base de la maison active. */
    async base(): Promise<SqlDatabase> {
      return ouvrir((await active()).fichier);
    },
    /** Base d'une maison précise (rappels de toutes les maisons). */
    async basePour(maison: Maison): Promise<SqlDatabase> {
      return ouvrir(maison.fichier);
    },
    async changer(id: string): Promise<Maison> {
      const m = (await lister()).find((x) => x.id === id);
      if (!m) throw new Error('Maison introuvable.');
      await p.ecrire(CLE_ACTIVE, id);
      return m;
    },
    /** Nouvelle maison vide, avec le profil, la signature et les réglages de la maison active. */
    async creer(nom: string): Promise<Maison> {
      const propre = nom.trim();
      if (!propre) throw new Error('Donnez un nom à la maison.');
      const liste = await lister();
      if (liste.some((m) => m.nom.toLowerCase() === propre.toLowerCase())) throw new Error('Une maison porte déjà ce nom.');
      const id = `m${Date.now().toString(36)}`;
      const maison: Maison = { id, nom: propre, fichier: `onile-maison-${id}.db` };
      const source = await ouvrir((await active()).fichier);
      const cible = await ouvrir(maison.fichier);
      const profil = await source.get<Record<string, string | number | null>>(
        'SELECT nom, telephone, adresse, logo_uri, signature, cree_le FROM proprietaire WHERE id = 1'
      );
      if (profil) {
        await cible.run(
          `INSERT OR REPLACE INTO proprietaire (id, nom, telephone, adresse, logo_uri, signature, solde_initial, cree_le)
           VALUES (1, ?, ?, ?, ?, ?, 0, ?)`,
          [profil.nom, profil.telephone, profil.adresse, profil.logo_uri, profil.signature, profil.cree_le]
        );
      }
      const parametres = await source.all<{ cle: string; valeur: string }>('SELECT cle, valeur FROM parametres');
      for (const r of parametres.filter((x) => !PARAMETRES_NON_COPIES.test(x.cle))) {
        await cible.run('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur', [r.cle, r.valeur]);
      }
      await enregistrer([...liste, maison]);
      return maison;
    },
    async renommer(id: string, nom: string): Promise<void> {
      const propre = nom.trim();
      if (!propre) throw new Error('Donnez un nom à la maison.');
      const liste = await lister();
      await enregistrer(liste.map((m) => (m.id === id ? { ...m, nom: propre } : m)));
    },
    /** Supprime une maison et toutes ses données (jamais la maison active, jamais la dernière). */
    async supprimer(id: string): Promise<void> {
      const liste = await lister();
      const m = liste.find((x) => x.id === id);
      if (!m) throw new Error('Maison introuvable.');
      if (liste.length === 1) throw new Error('Impossible de supprimer la seule maison.');
      if ((await active()).id === id) throw new Error('Ouvrez d’abord une autre maison avant de supprimer celle-ci.');
      await enregistrer(liste.filter((x) => x.id !== id));
      if (ouvertes.has(m.fichier)) {
        ouvertes.delete(m.fichier);
        await p.fermer(m.fichier).catch(() => undefined);
      }
      await p.supprimerFichier(m.fichier);
    },
  };
}

export type GestionMaisons = ReturnType<typeof creerGestionMaisons>;
