import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Check, Delete } from 'lucide-react-native';

import { AnimatedView } from './AnimatedView';
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
      className={`w-20 h-20 rounded-full items-center justify-center ${disabled ? 'opacity-30' : ''}`}
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

  return (
    <View className="items-center">
      <AnimatedView style={shakeStyle} className="flex-row items-center mb-12" accessibilityLabel={`${value.length} chiffre(s) saisi(s)`}>
        {Array.from({ length }, (_, i) => (
          <View key={i} className={`w-4 h-4 rounded-full mx-3 ${i < value.length ? 'bg-accent' : 'bg-white/30'}`} />
        ))}
      </AnimatedView>

      <View className="flex-row flex-wrap justify-center max-w-[300px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} label={d} accessibilityLabel={d} onPress={() => press(d)} disabled={disabled} />
        ))}
        {onSubmit ? (
          <Key
            label={<Check size={30} color={colors.accent} />}
            accessibilityLabel="Valider"
            onPress={onSubmit}
            disabled={disabled || !canSubmit}
          />
        ) : (
          <View className="w-20 h-20" />
        )}
        <Key label="0" accessibilityLabel="0" onPress={() => press('0')} disabled={disabled} />
        <Key
          label={<Delete size={30} color={colors.white} />}
          accessibilityLabel="Effacer"
          onPress={() => onChange(value.slice(0, -1))}
          disabled={disabled || value.length === 0}
        />
      </View>
    </View>
  );
}

