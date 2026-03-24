import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { MotiView, useAnimationState } from 'moti';
import { Building2, Delete } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PinScreenProps {
  onSuccess: () => void;
}

export function PinScreen({ onSuccess }: PinScreenProps) {
  const [pin, setPin] = useState('');

  const shakeAnimation = useAnimationState({
    idle: { translateX: 0 },
    shake: {
      translateX: [-10, 10, -10, 10, 0],
    },
  });

  useEffect(() => {
    if (pin.length === 4) {
      const checkPin = async () => {
        const savedPin = (await AsyncStorage.getItem('gestiloc_pin')) || '1234';
        if (pin === savedPin) {
          setTimeout(onSuccess, 300);
        } else {
          shakeAnimation.transitionTo('shake');
          setTimeout(() => {
            setPin('');
            shakeAnimation.transitionTo('idle');
          }, 450);
        }
      };
      checkPin();
    }
  }, [pin, onSuccess]);

  const handlePress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const KeypadButton = ({
    num,
    onPress,
    empty = false
  }: {
    num?: string | React.ReactNode;
    onPress?: () => void;
    empty?: boolean;
  }) => {
    if (empty) return <View className="w-20 h-20" />;
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="w-20 h-20 rounded-full items-center justify-center"
      >
        {typeof num === 'string' ? (
          <Text className="text-3xl font-light text-gray-900">{num}</Text>
        ) : (
          num
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <MotiView
        from={{ opacity: 0, translateY: -20 }}
        animate={{ opacity: 1, translateY: 0 }}
        className="items-center mb-16"
      >
        <View className="w-16 h-16 bg-primary rounded-2xl items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
          <Building2 size={32} color="white" />
        </View>
        <Text className="text-2xl font-bold text-gray-900">GestiLoc</Text>
        <Text className="text-gray-500 mt-2">Entrez votre code PIN</Text>
        <Text className="text-xs text-gray-400 mt-1">(Code par défaut: 1234)</Text>
      </MotiView>

      <MotiView state={shakeAnimation} className="flex-row items-center mb-16">
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            className={`w-4 h-4 rounded-full mx-3 ${i < pin.length ? 'bg-primary' : 'bg-gray-300'
              }`}
          />
        ))}
      </MotiView>

      <View className="flex-row flex-wrap justify-center max-w-[300px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <KeypadButton
            key={num}
            num={num.toString()}
            onPress={() => handlePress(num.toString())}
          />
        ))}
        <KeypadButton empty />
        <KeypadButton num="0" onPress={() => handlePress('0')} />
        <KeypadButton
          num={<Delete size={32} color="#4B5563" />}
          onPress={handleDelete}
        />
      </View>
    </View>
  );
}