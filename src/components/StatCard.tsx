import React from 'react';
import { View, Text } from 'react-native';
import { MotiView } from 'moti';
import { LucideIcon } from 'lucide-react-native';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  colorClass: string;
  bgClass: string;
  delay?: number;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
  bgClass,
  delay = 0
}: StatCardProps) {
  // Map Tailwind color classes to hex colors for Lucide components if needed
  // But Lucide-React-Native can often handle class-based styling via NativeWind

  return (
    <MotiView
      from={{ opacity: 0, scale: 0.9, translateY: 20 }}
      animate={{ opacity: 1, scale: 1, translateY: 0 }}
      transition={{ delay: delay * 1000, type: 'timing', duration: 400 }}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 min-w-[140px] mr-4"
    >
      <View className={`w-10 h-10 rounded-full ${bgClass} items-center justify-center mb-3`}>
        <Icon size={20} className={colorClass} />
      </View>
      <Text className="text-xs text-gray-500 font-medium mb-1">{label}</Text>
      <Text className="text-lg font-bold text-gray-900">{value}</Text>
    </MotiView>
  );
}