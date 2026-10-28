import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';

/** Notifications déjà ouvertes : la dernière réponse reste disponible après chaque déverrouillage. */
const traitees = new Set<string>();

/** Toucher une notification qui désigne un écran (mise à jour, sauvegarde) ouvre cet écran. */
export function useOuvertureDepuisNotification() {
  const navigation = useNavigation<{ navigate: (ecran: string) => void }>();
  const reponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!reponse) return;
    const id = reponse.notification.request.identifier;
    if (traitees.has(id)) return;
    traitees.add(id);
    const ecran = reponse.notification.request.content.data?.ecran;
    if (typeof ecran === 'string') navigation.navigate(ecran);
  }, [reponse, navigation]);
}
