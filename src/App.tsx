import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LayoutDashboard, Users, Building2, FileText, Settings } from 'lucide-react-native';

// Screens
import { DashboardScreen } from './screens/DashboardScreen';
import { TenantsScreen } from './screens/TenantsScreen';
import { PropertiesScreen } from './screens/PropertiesScreen';
import { InvoicesScreen } from './screens/InvoicesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PinScreen } from './screens/PinScreen';

// Context & Hooks
import { AppProvider } from './context/AppContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useBadges } from './hooks/useBadges';
import { STORAGE_KEYS } from './constants';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ onLogout }: { onLogout: () => void }) {
  const { tenantsBadge, invoicesBadge } = useBadges();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#1E3A8A',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Tenants"
        component={TenantsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
          tabBarBadge: tenantsBadge > 0 ? tenantsBadge : undefined,
        }}
      />
      <Tab.Screen
        name="Properties"
        component={PropertiesScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Building2 size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Invoices"
        component={InvoicesScreen}
        options={{
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
          tabBarBadge: invoicesBadge > 0 ? invoicesBadge : undefined,
        }}
      />
      <Tab.Screen
        name="Settings"
        options={{
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      >
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useLocalStorage(STORAGE_KEYS.AUTH, false);

  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthenticated ? (
              <Stack.Screen name="Pin">
                {(props) => <PinScreen {...props} onSuccess={() => setIsAuthenticated(true)} />}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="Main">
                {() => <MainTabs onLogout={() => setIsAuthenticated(false)} />}
              </Stack.Screen>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}