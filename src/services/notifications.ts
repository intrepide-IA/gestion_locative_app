/** Notifications locales Android : canal, permission et synchronisation des rappels. */
import * as Notifications from 'expo-notifications';

import { getDatabase } from '../db/client';
import { aujourdhui } from '../domain/format';
import { synchroniserRappels, type Planificateur } from '../repositories/rappelsRepository';

const CANAL = 'rappels';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let canalPret: Promise<unknown> | null = null;
const preparerCanal = () =>
  (canalPret ??= Notifications.setNotificationChannelAsync(CANAL, {
    name: 'Rappels de loyers et alertes',
    importance: Notifications.AndroidImportance.HIGH,
  }));

/** Demande l'autorisation d'afficher des notifications (Android 13+). */
export async function demanderPermissionNotifications(): Promise<boolean> {
  await preparerCanal();
  const actuel = await Notifications.getPermissionsAsync();
  if (actuel.granted) return true;
  const demande = await Notifications.requestPermissionsAsync();
  return demande.granted;
}

const planificateur: Planificateur = {
  planifier: async (r) => {
    await preparerCanal();
    return Notifications.scheduleNotificationAsync({
      content: { title: r.titre, body: r.corps },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: CANAL },
    });
  },
  annuler: (identifiant) => Notifications.cancelScheduledNotificationAsync(identifiant),
};

let enCours: Promise<void> | null = null;

/**
 * Met à jour les rappels programmés (à appeler après chaque modification des données).
 * Sans autorisation, rien n'est programmé ; une erreur n'interrompt jamais l'application.
 */
export function synchroniserNotifications(): Promise<void> {
  enCours ??= (async () => {
    try {
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) return;
      await synchroniserRappels(await getDatabase(), planificateur, new Date(), aujourdhui());
    } catch (error) {
      console.warn('Synchronisation des rappels impossible', error);
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

/** Après une restauration ou une réinitialisation : annule tout ce qui était programmé, puis recalcule. */
export async function reinitialiserNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await synchroniserNotifications();
}

/** Test : une notification dans 10 secondes (l'application peut être fermée entre-temps). */
export async function envoyerNotificationTest(): Promise<'programmee' | 'refusee'> {
  if (!(await demanderPermissionNotifications())) return 'refusee';
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Onílé : test réussi', body: 'Les rappels de loyers et d’électricité s’afficheront comme ceci.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, channelId: CANAL },
  });
  return 'programmee';
}

export interface EtatRappels {
  autorisees: boolean;
  programmes: number;
  prochain: { titre: string; date: Date } | null;
}

/** Ce qui est réellement programmé sur le téléphone (pour vérifier que les rappels sont en place). */
export async function etatRappels(): Promise<EtatRappels> {
  const autorisees = (await Notifications.getPermissionsAsync()).granted;
  const liste = await Notifications.getAllScheduledNotificationsAsync();
  const dates = liste
    .map((n) => {
      const t = n.trigger as { type?: string; value?: number; date?: number | string } | null;
      const brut = t && 'value' in t && typeof t.value === 'number' ? t.value : t?.date;
      return brut ? { titre: n.content.title ?? '', date: new Date(brut) } : null;
    })
    .filter((x): x is { titre: string; date: Date } => x !== null && !Number.isNaN(x.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return { autorisees, programmes: liste.length, prochain: dates[0] ?? null };
}
