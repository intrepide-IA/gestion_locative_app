import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getDatabase } from '../db/client';
import type { SqlDatabase } from '../db/types';

export interface Ressource<T> {
  donnees: T;
  chargement: boolean;
  erreur: Error | null;
  /** Relance la lecture ; l'état se met à jour à la fin. */
  rafraichir: () => void;
}

/**
 * Lit des données dans la base. Relit automatiquement quand l'écran reprend le focus,
 * et expose l'erreur au lieu de laisser l'écran en chargement infini ou faussement vide.
 */
export function useRessource<T>(lire: (db: SqlDatabase) => Promise<T>, initial: T): Ressource<T> {
  const [etat, setEtat] = useState<{ donnees: T; chargement: boolean; erreur: Error | null }>({
    donnees: initial,
    chargement: true,
    erreur: null,
  });
  const [version, setVersion] = useState(0);
  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let actif = true;
    getDatabase()
      .then(lire)
      .then(
        (donnees) => actif && setEtat({ donnees, chargement: false, erreur: null }),
        (error: unknown) =>
          actif &&
          setEtat((precedent) => ({
            ...precedent,
            chargement: false,
            erreur: error instanceof Error ? error : new Error(String(error)),
          }))
      );
    return () => {
      actif = false;
    };
  }, [lire, version]);

  // Retour sur l'écran (après une saisie ailleurs) : relecture.
  useFocusEffect(rafraichir);

  return { ...etat, rafraichir };
}
