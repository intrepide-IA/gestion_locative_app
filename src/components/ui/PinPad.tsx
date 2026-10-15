import type { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Text';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Check, Delete } from 'lucide-react-native';

import { colors } from '../../theme/colors';

function Key({ label, onPress, disabled, accessibilityLabel }: {
  label: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.touche, disabled && styles.inactive]}
    >
      {typeof label === 'string' ? <Text className="text-3xl text-white font-medium">{label}</Text> : label}
    </TouchableOpacity>
  );
}

/** Secousse horizontale, à déclencher quand un code est refusé. */
export function useShake() {
  const offset = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const shake = () =>
    offset.set(
      withSequence(
        ...[-10, 10, -8, 8, 0].map((x) => withTiming(x, { duration: 55 }))
      )
    );
  return { style, shake };
}

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  /** Nombre de points affichés (longueur attendue, ou maximum en création). */
  length: number;
  disabled?: boolean;
  /** Affiche une touche « Valider » (création d'un code de longueur libre). */
  onSubmit?: () => void;
  canSubmit?: boolean;
  shakeStyle?: ReturnType<typeof useAnimatedStyle>;
}

export function PinPad({ value, onChange, length, disabled, onSubmit, canSubmit, shakeStyle }: PinPadProps) {
  const press = (digit: string) => {
    if (!disabled && value.length < length) onChange(value + digit);
  };

  const effacer = (
    <Key
      label={<Delete size={30} color={colors.white} />}
      accessibilityLabel="Effacer"
      onPress={() => onChange(value.slice(0, -1))}
      disabled={disabled || value.length === 0}
    />
  );
  const gauche = onSubmit ? (
    <Key label={<Check size={30} color={colors.accent} />} accessibilityLabel="Valider" onPress={onSubmit} disabled={disabled || !canSubmit} />
  ) : (
    <View style={styles.touche} />
  );
  const rangees: ReactNode[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ].map((r) => r.map((d) => <Key key={d} label={d} accessibilityLabel={d} onPress={() => press(d)} disabled={disabled} />));
  rangees.push([gauche, <Key key="0" label="0" accessibilityLabel="0" onPress={() => press('0')} disabled={disabled} />, effacer]);

  // Mise en page en styles explicites (pas de classes) : grille 3 × 4 identique sur tous les téléphones.
  return (
    <View style={styles.centre}>
      <Animated.View style={[styles.points, shakeStyle]} accessibilityLabel={`${value.length} chiffre(s) saisi(s)`}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={[styles.point, { backgroundColor: i < value.length ? colors.accent : 'rgba(255,255,255,0.3)' }]} />
        ))}
      </Animated.View>
      {rangees.map((rangee, i) => (
        <View key={i} style={styles.rangee}>
          {rangee.map((touche, j) => (
            <View key={j}>{touche}</View>
          ))}
        </View>
      ))}
    </View>
  );
}

const TOUCHE = 76;
const styles = StyleSheet.create({
  centre: { alignItems: 'center' },
  points: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  point: { width: 16, height: 16, borderRadius: 8, marginHorizontal: 10 },
  rangee: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 8 },
  touche: { width: TOUCHE, height: TOUCHE, borderRadius: TOUCHE / 2, alignItems: 'center', justifyContent: 'center' },
  inactive: { opacity: 0.3 },
});
