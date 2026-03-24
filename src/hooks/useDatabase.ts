import { useState, useEffect, useCallback } from 'react';
import { nativeDb as db } from '../database/db.native';
import type { Proprietaire, Logement, Locataire, PaiementLoyer, Facture } from '../types';
import * as logementService from '../services/logementService';
import * as locataireService from '../services/locataireService';
import * as proprietaireService from '../services/proprietaireService';
import * as dashboardService from '../services/dashboardService';
import type { DashboardStats } from '../services/dashboardService';

/** Hook pour les logements */
export function useLogements() {
  const [logements, setLogements] = useState<Logement[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await logementService.getAllLogements();
    setLogements(data);
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { logements, loading, refresh };
}

/** Hook pour les locataires actifs */
export function useLocataires() {
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await locataireService.getAllLocataires();
    setLocataires(data);
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { locataires, loading, refresh };
}

/** Hook pour le propriétaire */
export function useProprietaire() {
  const [proprietaire, setProprietaire] = useState<Proprietaire | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const p = await proprietaireService.getFirstProprietaire();
    setProprietaire(p ?? null);
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { proprietaire, loading, refresh };
}

/** Hook pour le dashboard */
export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [paiementsRecents, setPaiementsRecents] = useState<{ name: string; amount: number; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, p] = await Promise.all([dashboardService.getDashboardStats(), dashboardService.getPaiementsRecents()]);
    setStats(s);
    setPaiementsRecents(p);
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { stats, paiementsRecents, loading, refresh };
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
