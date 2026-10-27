import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { Text } from './Text';
import { colors } from '../../theme/colors';

/**
 * Hauteur du clavier affiché (0 s'il est fermé). Android 15+ affiche l'application bord à bord : la fenêtre
 * n'est plus redimensionnée par le système, c'est à nous de remonter le contenu au-dessus du clavier.
 */
function useHauteurClavier(): number {
  const [hauteur, setHauteur] = useState(0);
  useEffect(() => {
    const montrer = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const cacher = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(montrer, (e) => setHauteur(e.endCoordinates.height));
    const b = Keyboard.addListener(cacher, () => setHauteur(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return hauteur;
}

const DefilementFeuille = createContext<((decalage: number) => void) | undefined>(undefined);

/** Fait défiler la feuille ouverte (visite guidée : garder l'élément montré à l'écran). */
export const useDefilerFeuille = () => useContext(DefilementFeuille);

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
  const clavier = useHauteurClavier();
  const defilement = useRef<ScrollView>(null);
  const position = useRef(0);
  const defiler = useCallback((d: number) => defilement.current?.scrollTo({ y: Math.max(0, position.current + d), animated: true }), []);
  // Si le système a déjà réduit la fenêtre pour le clavier, on ne compense que ce qui reste masqué.
  const [hauteurs, setHauteurs] = useState({ pleine: 0, actuelle: 0 });
  const reduction = Math.max(0, hauteurs.pleine - hauteurs.actuelle);
  const decalage = Math.max(0, clavier - reduction);
  return (
    <Modal visible={ouverte} transparent animationType="slide" onRequestClose={onFermer} statusBarTranslucent navigationBarTranslucent>
      {ouverte ? (
        <View
          className="flex-1 justify-end bg-black/40"
          style={{ paddingBottom: decalage }}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            setHauteurs((p) => ({ pleine: Math.max(p.pleine, h), actuelle: h }));
          }}
        >
          <Pressable className="flex-1" onPress={onFermer} accessibilityLabel="Fermer" />
          <View className="bg-background rounded-t-3xl" style={{ maxHeight: '92%', paddingBottom: clavier ? 0 : insets.bottom }}>
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
            <ScrollView
              ref={defilement}
              onScroll={(e) => {
                position.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={32}
              className="px-5"
              contentContainerStyle={{ paddingBottom: 20, gap: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              <DefilementFeuille.Provider value={defiler}>{children}</DefilementFeuille.Provider>
            </ScrollView>
            {pied ? <View className="px-5 pt-3 pb-4 border-t border-border bg-background gap-2">{pied}</View> : null}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
