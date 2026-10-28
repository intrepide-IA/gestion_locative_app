/** Aperçu web : pas d'empreinte ni de verrouillage du téléphone. */
export const biometrieDisponible = async () => false;
export const biometrieActivee = async () => false;
export const definirBiometrie = async (_activee: boolean) => undefined;
export const biometrieAProposer = async () => false;
export const marquerBiometrieProposee = async () => undefined;
export const authentifierBiometrie = async () => false;
export type ConfirmationTelephone = 'ok' | 'refuse' | 'aucun_verrou';
/** Aperçu de développement : la confirmation est acceptée pour pouvoir tester l'écran. */
export const confirmerProprietaireTelephone = async (): Promise<ConfirmationTelephone> => 'ok';
