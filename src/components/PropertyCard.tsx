import { View, Text } from 'react-native';
import { Building2, User } from 'lucide-react-native';
import { AnimatedView, FadeIn } from './ui/AnimatedView';

interface PropertyCardProps {
  name: string;
  address: string;
  rentAmount: number;
  status: 'Libre' | 'Occupé';
  tenantName?: string;
  delay?: number;
}

export function PropertyCard({
  name,
  address,
  rentAmount,
  status,
  tenantName,
  delay = 0
}: PropertyCardProps) {
  const isOccupied = status === 'Occupé';

  return (
    <AnimatedView
      entering={FadeIn.delay(delay * 1000).duration(300)}
      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex-col mb-4 mx-2 w-[160px]"
    >
      <View className="h-24 bg-blue-50 items-center justify-center relative">
        <Building2 size={32} color="#3B82F6" style={{ opacity: 0.4 }} />
        <View
          className={`absolute top-2 right-2 px-2 py-1 rounded-full ${isOccupied ? 'bg-blue-600' : 'bg-green-600'}`}
        >
          <Text className="text-[10px] font-bold text-white">{status}</Text>
        </View>
      </View>

      <View className="p-3 flex-1">
        <Text className="font-bold text-gray-900 text-sm" numberOfLines={1}>{name}</Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>{address}</Text>

        <View className="mt-auto pt-3">
          <Text className="font-bold text-primary text-sm">
            {rentAmount.toLocaleString('fr-FR')}{' '}
            <Text className="text-[10px] font-normal text-gray-500">FCFA</Text>
          </Text>

          {isOccupied && tenantName && (
            <View className="flex-row items-center mt-1.5 bg-gray-50 p-1.5 rounded-md">
              <User size={12} color="#9CA3AF" className="mr-1" />
              <Text className="text-[10px] text-gray-500 flex-1" numberOfLines={1}>
                {tenantName}
              </Text>
            </View>
          )}
        </View>
      </View>
    </AnimatedView>
  );
}