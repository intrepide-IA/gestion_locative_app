import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { LinearTransition, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { Text } from '../ui/Text';
import { colors } from '../../theme/colors';

const TRANSITION = LinearTransition.springify().damping(18).stiffness(180);

/**
 * Barre d'onglets flottante : une pilule claire, l'onglet actif en pastille verte avec son libellé,
 * les autres en icône seule. Elle occupe sa place en bas de l'écran : aucun contenu n'est masqué dessous.
 * Styles explicites (pas de classes) sur les vues animées : nécessaire sur Android.
 */
export function BarreOnglets({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Téléphones étroits : marges, icônes et libellé plus compacts pour que tout tienne dans la barre.
  const etroit = useWindowDimensions().width < 380;
  const icone = etroit ? 20 : 22;
  return (
    <View style={[styles.zone, { paddingBottom: insets.bottom + 10, paddingHorizontal: etroit ? 12 : 16 }]}>
      <View style={styles.barre}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const actif = state.index === index;
          const libelle = typeof options.title === 'string' ? options.title : route.name;
          const couleur = actif ? colors.white : '#4B5563';

          const ouvrir = () => {
            const evenement = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!actif && !evenement.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              onPress={ouvrir}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={libelle}
              hitSlop={6}
              style={actif ? styles.zoneActive : styles.zoneInactive}
            >
              <Animated.View layout={TRANSITION} style={actif ? (etroit ? styles.pastilleActiveEtroite : styles.pastilleActive) : styles.pastille}>
                {options.tabBarIcon?.({ focused: actif, color: couleur, size: icone })}
                {actif ? (
                  <Animated.View entering={FadeIn.duration(220)} style={styles.libelle}>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15} style={etroit ? styles.texteActifEtroit : styles.texteActif}>
                      {libelle}
                    </Text>
                  </Animated.View>
                ) : null}
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { backgroundColor: colors.background, paddingTop: 6 },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2F0',
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#E1E7E4',
    padding: 6,
    shadowColor: '#0F6B4F',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  // Chaque onglet a une part de la largeur : l'actif (icône + libellé) en prend plus, mais tout reste dans la barre.
  zoneActive: { flex: 2.8, minWidth: 0, alignItems: 'center' },
  zoneInactive: { flex: 1, minWidth: 0, alignItems: 'center' },
  pastille: { height: 46, width: '100%', maxWidth: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pastilleActive: {
    height: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  pastilleActiveEtroite: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  libelle: { marginLeft: 6, flexShrink: 1, minWidth: 0 },
  texteActifEtroit: { color: colors.white, fontSize: 12.5, fontWeight: '600', fontFamily: 'Inter' },
  texteActif: { color: colors.white, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
});
