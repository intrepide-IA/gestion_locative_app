import { requireOptionalNativeModule } from 'expo-modules-core';

interface ModulePartage {
  envoyer(contentUri: string, mimeType: string, numero: string, message: string): Promise<boolean>;
  whatsappInstalle(): boolean;
}

/** Module natif Android (absent sur le web et dans Expo Go : null). */
export const PartageWhatsApp = requireOptionalNativeModule<ModulePartage>('PartageWhatsApp');
