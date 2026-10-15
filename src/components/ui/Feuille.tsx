import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { Text } from './Text';
import { colors } from '../../theme/colors';

/**
 * Feuille modale qui monte du bas de l'écran. Son contenu n'est monté que lorsqu'elle est ouverte :
 * un formulaire repart ainsi de ses valeurs initiales à chaque ouverture.
 */
export function Feuille({
  ouverte,
  onFermer,
  titre,
  children,
  pied,
}: {
  ouverte: boolean;
  onFermer: () => void;
  titre: string;
  children: ReactNode;
  /** Zone fixe en bas (boutons), hors du défilement. */
  pied?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={ouverte} transparent animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      {ouverte ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/40">
          <Pressable className="flex-1" onPress={onFermer} accessibilityLabel="Fermer" />
          <View className="bg-background rounded-t-3xl max-h-[92%]" style={{ paddingBottom: insets.bottom }}>
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
              <Text className="text-xl font-bold text-ink flex-1" accessibilityRole="header">
                {titre}
              </Text>
              <Pressable
                onPress={onFermer}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
                className="w-9 h-9 rounded-full bg-white border border-border items-center justify-center"
              >
                <X size={18} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {pied ? <View className="px-5 pt-3 pb-4 border-t border-border bg-background gap-2">{pied}</View> : null}
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}
