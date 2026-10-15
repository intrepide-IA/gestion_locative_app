import { useState, useEffect, useCallback } from 'react';
import { nativeDb as db } from '../database/db.native';
import type { Proprietaire, Logement, Locataire, PaiementLoyer, Facture } from '../types';
import * as logementService from '../services/logementService';
import * as locataireService from '../services/locataireService';
import * as proprietaireService from '../services/proprietaireService';
import * as dashboardService from '../services/dashboardService';
import type { DashboardStats } from '../services/dashboardService';

interface AsyncResource<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  /** Relance le chargement ; l'état est mis à jour à la fin. */
  refresh: () => void;
}

/** Charge une ressource asynchrone, capture l'erreur au lieu de laisser l'écran en chargement infini. */
function useAsyncResource<T>(load: () => Promise<T>, initial: T): AsyncResource<T> {
  const [state, setState] = useState<{ data: T; loading: boolean; error: Error | null }>({
    data: initial,
    loading: true,
    error: null,
  });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    load().then(
      (data) => active && setState({ data, loading: false, error: null }),
      (error: unknown) =>
        active &&
        setState((previous) => ({
          ...previous,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        }))
    );
    return () => {
      active = false;
    };
  }, [load, version]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, refresh };
}

const NO_LOGEMENTS: Logement[] = [];
const NO_LOCATAIRES: Locataire[] = [];

/** Hook pour les logements */
export function useLogements() {
  const { data: logements, loading, error, refresh } = useAsyncResource(logementService.getAllLogements, NO_LOGEMENTS);
  return { logements, loading, error, refresh };
}

/** Hook pour les locataires actifs */
export function useLocataires() {
  const { data: locataires, loading, error, refresh } = useAsyncResource(
    locataireService.getAllLocataires,
    NO_LOCATAIRES
  );
  return { locataires, loading, error, refresh };
}

const loadProprietaire = async (): Promise<Proprietaire | null> =>
  (await proprietaireService.getFirstProprietaire()) ?? null;

/** Hook pour le propriétaire */
export function useProprietaire() {
  const { data: proprietaire, loading, error, refresh } = useAsyncResource(loadProprietaire, null);
  return { proprietaire, loading, error, refresh };
}

type PaiementRecent = { name: string; amount: number; date: string };

const loadDashboard = async (): Promise<{ stats: DashboardStats | null; paiementsRecents: PaiementRecent[] }> => {
  const [stats, paiementsRecents] = await Promise.all([
    dashboardService.getDashboardStats(),
    dashboardService.getPaiementsRecents(),
  ]);
  return { stats, paiementsRecents };
};

const NO_DASHBOARD = { stats: null, paiementsRecents: [] as PaiementRecent[] };

/** Hook pour le dashboard */
export function useDashboard() {
  const { data, loading, error, refresh } = useAsyncResource(loadDashboard, NO_DASHBOARD);
  return { stats: data.stats, paiementsRecents: data.paiementsRecents, loading, error, refresh };
}

export function usePaiementsByLocataire(locataireId?: number) {
  const [paiements, setPaiements] = useState<PaiementLoyer[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!locataireId) return;
    db.query<PaiementLoyer>('SELECT * FROM paiements_loyer WHERE locataire_id = ? ORDER BY id DESC', [locataireId])
      .then(data => {
        setPaiements(data);
        setLoading(false);
      });
  }, [locataireId]);
  return { paiements, loading };
}

export function useFacturesByLocataire(locataireId?: number) {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!locataireId) return;
    db.query<Facture>('SELECT * FROM factures WHERE locataire_id = ? ORDER BY id DESC', [locataireId])
      .then(data => {
        setFactures(data);
        setLoading(false);
      });
  }, [locataireId]);
  return { factures, loading };
}
