import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Building2, Delete } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AnimatedView, FadeInDown } from '../components/ui/AnimatedView';
import { colors } from '../theme/colors';

interface PinScreenProps {
  onSuccess: () => void;
}

function KeypadButton({ label, onPress }: { label: ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="w-20 h-20 rounded-full items-center justify-center"
    >
      {typeof label === 'string' ? <Text className="text-3xl text-white font-medium">{label}</Text> : label}
    </TouchableOpacity>
  );
}

// TODO(lot 2) : PIN créé au premier lancement, haché dans expo-secure-store, essais limités.
export function PinScreen({ onSuccess }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (pin.length !== 4) return;
    let cancelled = false;
    (async () => {
      const savedPin = (await AsyncStorage.getItem('gestiloc_pin')) || '1234';
      if (cancelled) return;
      if (pin === savedPin) {
        setTimeout(onSuccess, 200);
      } else {
        shake.set(
          withSequence(
            withTiming(-10, { duration: 60 }),
            withTiming(10, { duration: 60 }),
            withTiming(-10, { duration: 60 }),
            withTiming(10, { duration: 60 }),
            withTiming(0, { duration: 60 })
          )
        );
        setTimeout(() => setPin(''), 350);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin, onSuccess, shake]);

  const handlePress = (num: string) => setPin((prev) => (prev.length < 4 ? prev + num : prev));
  const handleDelete = () => setPin((prev) => prev.slice(0, -1));

  return (
    <View className="flex-1 items-center justify-center bg-primary px-6">
      <AnimatedView entering={FadeInDown.duration(300)} className="items-center mb-16">
        <View className="w-16 h-16 bg-white rounded-2xl items-center justify-center mb-4">
          <Building2 size={32} color={colors.primary} />
        </View>
        <Text className="text-3xl font-bold text-white">Onílé</Text>
        <Text className="text-white/80 mt-1">Gérer aujourd’hui, habiter demain</Text>
        <Text className="text-white mt-6">Entrez votre code PIN</Text>
        <Text className="text-xs text-white/70 mt-1">(Code provisoire : 1234)</Text>
      </AnimatedView>

      <AnimatedView style={shakeStyle} className="flex-row items-center mb-16">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className={`w-4 h-4 rounded-full mx-3 ${i < pin.length ? 'bg-accent' : 'bg-white/30'}`} />
        ))}
      </AnimatedView>

      <View className="flex-row flex-wrap justify-center max-w-[300px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <KeypadButton key={num} label={num} onPress={() => handlePress(num)} />
        ))}
        <View className="w-20 h-20" />
        <KeypadButton label="0" onPress={() => handlePress('0')} />
        <KeypadButton label={<Delete size={32} color={colors.white} />} onPress={handleDelete} />
      </View>
    </View>
  );
}
