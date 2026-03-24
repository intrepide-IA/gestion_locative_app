/**
 * Notifications locales (Expo Notifications)
 */
import * as Notifications from 'expo-notifications';
import { STORAGE_KEYS } from '../constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function demanderPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

export async function areNotificationsEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
  return val !== 'false';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, enabled ? 'true' : 'false');
}

export async function envoyerNotification(titre: string, corps: string): Promise<void> {
  if (!(await areNotificationsEnabled())) return;
  const hasPerm = await demanderPermission();
  if (!hasPerm) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: titre,
      body: corps,
    },
    trigger: null, // immediate
  });
}
