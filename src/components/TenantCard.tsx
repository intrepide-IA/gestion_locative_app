import { View, TouchableOpacity, Linking } from 'react-native';
import { Text } from './ui/Text';
import { Phone, MessageCircle, Building2 } from 'lucide-react-native';
import { AnimatedView, FadeInDown } from './ui/AnimatedView';

interface TenantCardProps {
  name: string;
  property: string;
  rentAmount: number;
  status: 'à jour' | 'en retard';
  delay?: number;
  telephone?: string;
}

export function TenantCard({
  name,
  property,
  rentAmount,
  status,
  delay = 0,
  telephone,
}: TenantCardProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2);

  const isLate = status === 'en retard';

  const handleCall = () => {
    if (telephone) Linking.openURL(`tel:${telephone}`);
  };

  const handleSms = () => {
    if (telephone) Linking.openURL(`sms:${telephone}`);
  };

  return (
    <AnimatedView
      entering={FadeInDown.delay(delay * 1000).duration(300)}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-3"
    >
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <View className="w-12 h-12 rounded-full bg-blue-100 items-center justify-center mr-3">
            <Text className="text-primary font-bold text-lg">{initials}</Text>
          </View>
          <View>
            <Text className="font-bold text-gray-900">{name}</Text>
            <View className="flex-row items-center mt-0.5">
              <Building2 size={12} color="#9CA3AF" className="mr-1" />
              <Text className="text-xs text-gray-500">{property}</Text>
            </View>
          </View>
        </View>
        <View
          className={`px-2.5 py-1 rounded-full ${isLate ? 'bg-red-100' : 'bg-green-100'}`}
        >
          <Text className={`text-[10px] font-bold ${isLate ? 'text-red-500' : 'text-green-600'}`}>
            {status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between pt-3 border-t border-gray-100">
        <Text className="font-bold text-gray-900">
          {rentAmount.toLocaleString('fr-FR')}{' '}
          <Text className="text-xs text-gray-500 font-normal">FCFA</Text>
        </Text>
        <View className="flex-row">
          {telephone && (
            <>
              <TouchableOpacity
                onPress={handleCall}
                className="w-8 h-8 rounded-full bg-green-100 items-center justify-center mr-2"
              >
                <Phone size={16} color="#16A34A" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSms}
                className="w-8 h-8 rounded-full bg-green-100 items-center justify-center"
              >
                <MessageCircle size={16} color="#059669" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </AnimatedView>
  );
}