import { Pressable, StyleSheet, View } from 'react-native';
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
  return (
    <View style={[styles.zone, { paddingBottom: insets.bottom + 10 }]}>
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
              <Animated.View layout={TRANSITION} style={actif ? styles.pastilleActive : styles.pastille}>
                {options.tabBarIcon?.({ focused: actif, color: couleur, size: 22 })}
                {actif ? (
                  <Animated.View entering={FadeIn.duration(220)} style={styles.libelle}>
                    <Text numberOfLines={1} style={styles.texteActif}>
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
  zone: { backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 6 },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2F0',
    borderRadius: 40,
    borderWidth: 1,
    borderColor: '#E1E7E4',
    padding: 8,
    shadowColor: '#0F6B4F',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  zoneActive: { flexShrink: 0 },
  zoneInactive: { flex: 1, alignItems: 'center' },
  pastille: { height: 48, minWidth: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pastilleActive: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
  },
  libelle: { marginLeft: 8 },
  texteActif: { color: colors.white, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
});
