/**
 * Notification « nouvelle version disponible », avec les corrections apportées (notes de la release).
 * Vérifiée à l'ouverture de l'application, à son retour au premier plan, et en arrière-plan
 * toutes les quelques heures quand le téléphone a Internet (expo-background-task). Une seule fois par version.
 */
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { texteMiseAJour } from '../domain/version';
import { nouvelleVersion } from './miseAJour';
import { ecrirePreferences, lirePreferences } from './preferences';

const TACHE = 'onile-verifier-mise-a-jour';
const CANAL = 'mises-a-jour';
const CLE_NOTIFIEE = 'maj.notifiee';

let enCours: Promise<void> | null = null;

export function signalerMiseAJour(): Promise<void> {
  enCours ??= (async () => {
    try {
      if (!(await Notifications.getPermissionsAsync()).granted) return;
      const v = await nouvelleVersion();
      if (!v) return;
      const preferences = await lirePreferences();
      if (preferences[CLE_NOTIFIEE] === v.version) return;
      await Notifications.setNotificationChannelAsync(CANAL, {
        name: 'Mises à jour de l’application',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.scheduleNotificationAsync({
        content: { title: `Onílé ${v.version} est disponible`, body: texteMiseAJour(v.notes), data: { ecran: 'Parametres' } },
        trigger: { channelId: CANAL },
      });
      await ecrirePreferences({ ...preferences, [CLE_NOTIFIEE]: v.version });
    } catch {
      // Pas d'Internet ou service indisponible : nouvel essai à la prochaine vérification.
    } finally {
      enCours = null;
    }
  })();
  return enCours;
}

// Déclarée au chargement du module (exigence de TaskManager) : importé depuis index.ts.
TaskManager.defineTask(TACHE, async () => {
  await signalerMiseAJour();
  return BackgroundTask.BackgroundTaskResult.Success;
});

/** Vérification en arrière-plan, environ toutes les 6 heures, uniquement avec Internet (choix du système). */
export async function programmerVerificationMiseAJour(): Promise<void> {
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(TACHE))) await BackgroundTask.registerTaskAsync(TACHE, { minimumInterval: 6 * 60 });
  } catch {
    // Sans tâche de fond, la vérification se fait encore à chaque ouverture.
  }
}
