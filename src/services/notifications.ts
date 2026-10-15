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
