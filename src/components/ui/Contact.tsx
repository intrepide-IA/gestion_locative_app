import { Linking, View } from 'react-native';
import { MessageCircle, Phone } from 'lucide-react-native';

import { informer } from './confirmer';
import { Bouton } from './kit';
import { lienWhatsApp } from '../../domain/whatsapp';
import { colors } from '../../theme/colors';

/** Appeler le locataire ou lui écrire sur WhatsApp (même si le numéro n'est pas dans les contacts). */
export function BoutonsContact({ telephone, message = '' }: { telephone: string | null; message?: string }) {
  if (!telephone) return null;
  const lien = lienWhatsApp(telephone, message);
  const ouvrir = (url: string) => Linking.openURL(url).catch(() => informer('Action impossible', 'Aucune application ne peut ouvrir ce lien.'));
  return (
    <View className="flex-row gap-2 self-stretch">
      <Bouton
        titre="Appeler"
        variante="secondaire"
        className="flex-1 py-2.5"
        icone={<Phone size={16} color={colors.primary} />}
        onPress={() => ouvrir(`tel:${telephone.replace(/[^\d+]/g, '')}`)}
      />
      {lien ? (
        <Bouton
          titre="WhatsApp"
          variante="secondaire"
          className="flex-1 py-2.5"
          icone={<MessageCircle size={16} color={colors.primary} />}
          onPress={() => ouvrir(lien)}
        />
      ) : null}
    </View>
  );
}
