import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { PenLine } from 'lucide-react-native';

import { ApercuSignature } from './ApercuSignature';
import { Badge, Bouton } from './kit';
import { Text } from './Text';
import { colors } from '../../theme/colors';

/** Bloc « signataire » : signature affichée (touchable pour refaire) ou boutons pour signer. */
export function BlocSignature({
  titre,
  nom,
  image,
  desactive,
  onSigner,
  supplement,
}: {
  titre: string;
  nom: string;
  image: string | null;
  desactive: boolean;
  onSigner: () => void;
  supplement?: ReactNode;
}) {
  return (
    <View className="border-t border-border pt-3 mt-1 mb-2 gap-2">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-muted text-xs uppercase tracking-wider">{titre}</Text>
          <Text className="font-semibold text-ink">{nom}</Text>
        </View>
        {image ? <Badge libelle="Signé" ton="succes" /> : null}
      </View>
      {image ? (
        <Pressable onPress={onSigner} accessibilityRole="button" accessibilityLabel={`Refaire la signature : ${titre}`} className="bg-background rounded-xl p-2">
          <ApercuSignature image={image} hauteur={70} />
          <Text className="text-xs text-primary text-center">Toucher pour signer à nouveau</Text>
        </Pressable>
      ) : (
        <>
          {supplement}
          <Bouton titre="Signer sur place" variante="secondaire" icone={<PenLine size={18} color={colors.primary} />} onPress={onSigner} desactive={desactive} />
        </>
      )}
    </View>
  );
}
