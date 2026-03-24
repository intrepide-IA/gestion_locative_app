import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import {
  LayoutDashboard,
  Users,
  Building2,
  Receipt,
  Settings
} from 'lucide-react-native';
import { MotiView } from 'moti';

type Tab = 'dashboard' | 'tenants' | 'properties' | 'invoices' | 'settings';

interface BottomNavProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  tenantsBadge?: number;
  invoicesBadge?: number;
}

export function BottomNav({ activeTab, onChange, tenantsBadge = 0, invoicesBadge = 0 }: BottomNavProps) {
  const tabs = [
    {
      id: 'dashboard',
      icon: LayoutDashboard,
      label: 'Tableau'
    },
    {
      id: 'tenants',
      icon: Users,
      label: 'Locataires',
      badge: tenantsBadge
    },
    {
      id: 'properties',
      icon: Building2,
      label: 'Logements'
    },
    {
      id: 'invoices',
      icon: Receipt,
      label: 'Factures',
      badge: invoicesBadge
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'Paramètres'
    }
  ] as const;

  return (
    <View className="absolute bottom-0 w-full bg-white border-t border-gray-200 pb-8 pt-2 px-2 rounded-t-[40px]">
      <View className="flex-row justify-between items-center px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onChange(tab.id as Tab)}
              className="relative flex-col items-center justify-center w-16 h-12"
            >
              <View className="relative">
                <Icon
                  size={24}
                  color={isActive ? '#3B82F6' : '#9CA3AF'}
                />
                {tab.badge != null && tab.badge > 0 && (
                  <View className="absolute -top-1 -right-2 bg-red-500 rounded-full px-1.5 py-0.5 min-w-[16px] items-center justify-center">
                    <Text className="text-white text-[10px] font-bold">
                      {tab.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                className={`text-[10px] mt-1 font-medium ${isActive ? 'text-primary' : 'text-gray-400'}`}
              >
                {tab.label}
              </Text>
              {isActive && (
                <MotiView
                  from={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="absolute -top-2 w-8 h-1 bg-primary rounded-full"
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}