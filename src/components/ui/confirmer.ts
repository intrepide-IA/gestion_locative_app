import { Alert } from 'react-native';

/** Demande une confirmation ; résout `true` si l'utilisateur valide. */
export function confirmer(titre: string, message: string, libelleOk: string, destructif = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      titre,
      message,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        { text: libelleOk, style: destructif ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** Message d'information simple. */
export function informer(titre: string, message: string): void {
  Alert.alert(titre, message);
}
