import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AnimatedView, FadeInDown } from '../components/ui/AnimatedView';
import { CircularProgress } from '../components/CircularProgress';
import { StatCard } from '../components/StatCard';
import {
  Wallet,
  AlertCircle,
  Building2,
  Users,
  Plus,
  FileText,
  ArrowRight,
} from 'lucide-react-native';
import { useDashboard, useProprietaire, useLogements, useLocataires } from '../hooks/useDatabase';
import { useApp } from '../context/AppContext';
import { LogementFormModal } from '../components/LogementFormModal';
import { LocataireFormModal } from '../components/LocataireFormModal';

type QuickAction = 'locataire' | 'logement' | 'facture' | null;

export function DashboardScreen() {
  const { setActiveTab } = useApp();
  const { stats, paiementsRecents, loading, error, refresh } = useDashboard();
  const { proprietaire } = useProprietaire();
  const { logements, refresh: refreshLogements } = useLogements();
  const { refresh: refreshLocataires } = useLocataires();
  const [quickAction, setQuickAction] = useState<QuickAction>(null);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleSuccess = () => {
    refresh();
    refreshLogements();
    refreshLocataires();
    setQuickAction(null);
  };

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Text className="text-lg font-bold text-ink mb-2">Tableau de bord en cours de refonte</Text>
        <Text className="text-center text-muted">{error.message}</Text>
      </View>
    );
  }

  if (loading || !stats) {
    return (
      <View className="flex-1 items-center justify-center">
        <View className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50 px-5 pt-2" contentContainerStyle={{ paddingBottom: 100 }}>
      <AnimatedView
        entering={FadeInDown.duration(300)}
        className="mb-8 mt-4"
      >
        <Text className="text-2xl font-bold text-gray-900">
          Bonjour, {proprietaire?.nom?.split(' ')[0] || 'Propriétaire'} 👋
        </Text>
        <Text className="text-gray-500 capitalize">{today}</Text>
      </AnimatedView>

      <View className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-8 flex-row items-center justify-between">
        <View>
          <Text className="text-gray-500 font-medium mb-1">Taux de recouvrement</Text>
          <Text className="text-3xl font-bold text-gray-900 mb-2">Ce mois</Text>
          <View className="flex-row items-center">
            <Text className="text-green-600 text-sm font-medium">
              {stats.tauxRecouvrement}% des loyers perçus
            </Text>
          </View>
        </View>
        <CircularProgress
          percentage={stats.tauxRecouvrement}
          size={100}
          strokeWidth={10}
          color="#16A34A"
        />
      </View>

      <View className="mb-8">
        <Text className="text-lg font-bold text-gray-900 mb-4">Aperçu</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <StatCard
            icon={Wallet}
            label="Revenus du mois"
            value={formatMontant(stats.revenusDuMois)}
            colorClass="text-green-600"
            bgClass="bg-green-100"
            delay={0.1}
          />
          <StatCard
            icon={AlertCircle}
            label="Impayés"
            value={formatMontant(stats.impayes)}
            colorClass="text-red-500"
            bgClass="bg-red-100"
            delay={0.2}
          />
          <StatCard
            icon={Building2}
            label="Logements"
            value={stats.totalLogements}
            colorClass="text-primary"
            bgClass="bg-blue-100"
            delay={0.3}
          />
          <StatCard
            icon={Users}
            label="Locataires"
            value={stats.locatairesActifs}
            colorClass="text-purple-600"
            bgClass="bg-purple-100"
            delay={0.4}
          />
        </ScrollView>
      </View>

      <View className="mb-8">
        <Text className="text-lg font-bold text-gray-900 mb-4">Actions rapides</Text>
        <View className="flex-row justify-between">
          <TouchableOpacity
            onPress={() => setQuickAction('locataire')}
            className="flex-1 items-center justify-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mr-2"
          >
            <View className="w-12 h-12 bg-blue-100 rounded-full items-center justify-center mb-2">
              <Plus size={24} color="#3B82F6" />
            </View>
            <Text className="text-[10px] font-medium text-gray-700 text-center">
              Nouveau locataire
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setQuickAction('logement')}
            className="flex-1 items-center justify-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mx-1"
          >
            <View className="w-12 h-12 bg-blue-100 rounded-full items-center justify-center mb-2">
              <Building2 size={24} color="#3B82F6" />
            </View>
            <Text className="text-[10px] font-medium text-gray-700 text-center">
              Ajouter logement
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('invoices')}
            className="flex-1 items-center justify-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 ml-2"
          >
            <View className="w-12 h-12 bg-blue-100 rounded-full items-center justify-center mb-2">
              <FileText size={24} color="#3B82F6" />
            </View>
            <Text className="text-[10px] font-medium text-gray-700 text-center">
              Créer facture
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-gray-900">Paiements récents</Text>
          <TouchableOpacity
            onPress={() => setActiveTab('invoices')}
            className="flex-row items-center"
          >
            <Text className="text-primary text-sm font-medium">Voir tout</Text>
            <ArrowRight size={16} color="#3B82F6" className="ml-1" />
          </TouchableOpacity>
        </View>
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {paiementsRecents.length === 0 ? (
            <View className="p-6 items-center">
              <Text className="text-gray-500 text-sm">Aucun paiement récent</Text>
            </View>
          ) : (
            paiementsRecents.map((payment, i) => (
              <View
                key={i}
                className={`p-4 flex-row items-center justify-between ${i !== paiementsRecents.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <div className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3">
                    <Text className="text-gray-600 font-bold text-sm">
                      {payment.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </Text>
                  </View>
                  <View>
                    <Text className="font-bold text-gray-900 text-sm">{payment.name}</Text>
                    <Text className="text-xs text-gray-500">{payment.date}</Text>
                  </View>
                </div>
                <Text className="font-bold text-green-600">
                  +{payment.amount.toLocaleString('fr-FR')}{' '}
                  <Text className="text-[10px]">FCFA</Text>
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      <LogementFormModal
        isOpen={quickAction === 'logement'}
        onClose={() => setQuickAction(null)}
        onSuccess={handleSuccess}
      />
      <LocataireFormModal
        isOpen={quickAction === 'locataire'}
        onClose={() => setQuickAction(null)}
        onSuccess={handleSuccess}
        logements={logements}
      />
    </ScrollView>
  );
}

function formatMontant(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}
