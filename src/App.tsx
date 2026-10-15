import '../global.css';

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Text } from './components/ui/Text';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { loadFonts } from './theme/fonts';
import { LayoutDashboard, Users, Building2, Receipt, Menu, Wallet } from 'lucide-react-native';

import { AccueilScreen } from './features/accueil/AccueilScreen';
import { LocatairesScreen } from './features/locataires/LocatairesScreen';
import { LogementsScreen } from './features/logements/LogementsScreen';
import { LoyersScreen } from './features/loyers/LoyersScreen';
import { FinancesScreen } from './features/finances/FinancesScreen';
import { PlusScreen } from './features/plus/PlusScreen';
import { ElectriciteScreen } from './features/electricite/ElectriciteScreen';
import { PinScreen } from './screens/PinScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';

import { getDatabase } from './db/client';
import { colors } from './theme/colors';
import { pinService } from './security/native';
import { shouldLockOnResume } from './security/autoLock';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const PlusPile = createNativeStackNavigator();

/** Onglet Plus : menu, puis écrans secondaires (électricité…). */
function PlusStack({ onVerrouiller }: { onVerrouiller: () => void }) {
  return (
    <PlusPile.Navigator screenOptions={{ headerShown: false }}>
      <PlusPile.Screen name="PlusMenu">{() => <PlusScreen onVerrouiller={onVerrouiller} />}</PlusPile.Screen>
      <PlusPile.Screen name="Electricite">{({ navigation }) => <ElectriciteScreen onRetour={() => navigation.goBack()} />}</PlusPile.Screen>
    </PlusPile.Navigator>
  );
}

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.white,
    text: colors.ink,
    border: colors.border,
    notification: colors.danger,
  },
};

function MainTabs({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 0,
          elevation: 10,
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 9.5, fontFamily: 'Inter', fontWeight: '600' },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={AccueilScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Properties"
        component={LogementsScreen}
        options={{
          title: 'Logements',
          tabBarIcon: ({ color, size }) => <Building2 size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Tenants"
        component={LocatairesScreen}
        options={{
          title: 'Locataires',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Invoices"
        component={LoyersScreen}
        options={{
          title: 'Loyers',
          tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Finances"
        component={FinancesScreen}
        options={{
          title: 'Finances',
          tabBarIcon: ({ color, size }) => <Wallet size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        options={{
          title: 'Plus',
          tabBarIcon: ({ color, size }) => <Menu size={size} color={color} />,
        }}
      >
        {() => <PlusStack onVerrouiller={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

type DatabaseState = { status: 'opening' } | { status: 'ready' } | { status: 'error'; message: string };

function useDatabaseReady(): DatabaseState {
  const [state, setState] = useState<DatabaseState>({ status: 'opening' });
  useEffect(() => {
    getDatabase().then(
      () => setState({ status: 'ready' }),
      (error: unknown) => setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    );
  }, []);
  return state;
}

function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // En cas d'échec, l'app continue avec la police système plutôt que de rester bloquée.
    loadFonts().finally(() => setReady(true));
  }, []);
  return ready;
}

type Access = 'checking' | 'onboarding' | 'locked' | 'unlocked';

/**
 * Accès à l'application : premier lancement (profil + PIN), puis PIN à chaque ouverture
 * et après 2 minutes en arrière-plan. La session n'est jamais conservée sur disque.
 */
function useAccess(ready: boolean) {
  const [access, setAccess] = useState<Access>('checking');
  const backgroundSince = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    pinService.hasPin().then((hasPin) => setAccess(hasPin ? 'locked' : 'onboarding'));
  }, [ready]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundSince.current = Date.now();
      } else if (state === 'active') {
        if (shouldLockOnResume(backgroundSince.current, Date.now())) {
          setAccess((current) => (current === 'unlocked' ? 'locked' : current));
        }
        backgroundSince.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  return { access, unlock: () => setAccess('unlocked'), lock: () => setAccess('locked') };
}

export default function App() {
  const fontsLoaded = useFontsReady();
  const database = useDatabaseReady();
  const { access, unlock, lock } = useAccess(database.status === 'ready');

  if (database.status === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Text className="text-lg font-bold text-danger mb-2">Impossible d’ouvrir les données</Text>
        <Text className="text-center text-muted">{database.message}</Text>
      </View>
    );
  }

  if (!fontsLoaded || database.status === 'opening' || access === 'checking') {
    return (
      <View className="flex-1 items-center justify-center bg-primary">
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style={access === 'unlocked' ? 'dark' : 'light'} />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {access === 'onboarding' ? (
              <Stack.Screen name="Onboarding">{() => <OnboardingScreen onDone={unlock} />}</Stack.Screen>
            ) : access === 'locked' ? (
              <Stack.Screen name="Pin">{() => <PinScreen onSuccess={unlock} />}</Stack.Screen>
            ) : (
              <Stack.Screen name="Main">{() => <MainTabs onLogout={lock} />}</Stack.Screen>
            )}
          </Stack.Navigator>
        </NavigationContainer>
    </SafeAreaProvider>
  );
}
