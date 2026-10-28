/**
 * Empreinte digitale ou visage enregistrés sur le téléphone (expo-local-authentication),
 * et confirmation par le verrouillage du téléphone (code, schéma, empreinte) pour la récupération des données.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const CLE_ACTIVEE = 'onile.biometrie.v1';
const CLE_PROPOSEE = 'onile.biometrie.proposee.v1';

/** Empreinte ou visage enregistrés sur ce téléphone ? */
export async function biometrieDisponible(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function biometrieActivee(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CLE_ACTIVEE)) === '1' && (await biometrieDisponible());
}

export async function definirBiometrie(activee: boolean): Promise<void> {
  await SecureStore.setItemAsync(CLE_ACTIVEE, activee ? '1' : '0');
  await SecureStore.setItemAsync(CLE_PROPOSEE, '1');
}

/** La proposition d'activer l'empreinte n'est faite qu'une fois. */
export async function biometrieAProposer(): Promise<boolean> {
  return !(await SecureStore.getItemAsync(CLE_PROPOSEE)) && (await biometrieDisponible());
}

export async function marquerBiometrieProposee(): Promise<void> {
  await SecureStore.setItemAsync(CLE_PROPOSEE, '1');
}

/** Déverrouillage par empreinte ou visage ; « Utiliser le code PIN » ferme la fenêtre. */
export async function authentifierBiometrie(): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Déverrouiller Onílé',
      promptSubtitle: 'Empreinte ou visage enregistrés sur ce téléphone',
      cancelLabel: 'Utiliser le code PIN',
      disableDeviceFallback: true,
    });
    return r.success;
  } catch {
    return false;
  }
}

export type ConfirmationTelephone = 'ok' | 'refuse' | 'aucun_verrou';

/** Prouve que la personne connaît le verrouillage du téléphone (code, schéma, mot de passe ou empreinte). */
export async function confirmerProprietaireTelephone(): Promise<ConfirmationTelephone> {
  try {
    if ((await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) return 'aucun_verrou';
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirmez que ce téléphone est le vôtre',
      promptSubtitle: 'Code, schéma ou empreinte du téléphone',
      disableDeviceFallback: false,
    });
    if (r.success) return 'ok';
    return r.error === 'passcode_not_set' || r.error === 'not_enrolled' ? 'aucun_verrou' : 'refuse';
  } catch {
    return 'refuse';
  }
}
