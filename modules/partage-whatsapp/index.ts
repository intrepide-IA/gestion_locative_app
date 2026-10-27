import { requireOptionalNativeModule } from 'expo-modules-core';

interface ModulePartage {
  envoyer(contentUri: string, mimeType: string, numero: string, message: string, prefere: string | null): Promise<boolean>;
  /** Versions installées : « com.whatsapp.w4b » (Business) et/ou « com.whatsapp ». */
  applications(): string[];
}

/** Module natif Android (absent sur le web et dans Expo Go : null). */
export const PartageWhatsApp = requireOptionalNativeModule<ModulePartage>('PartageWhatsApp');
