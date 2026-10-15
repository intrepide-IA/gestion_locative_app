import { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Search, Plus } from 'lucide-react-native';
import { TenantCard } from '../components/TenantCard';
import { LocataireFormModal } from '../components/LocataireFormModal';
import { TenantDetailModal } from '../components/TenantDetailModal';
import { PaymentModal } from '../components/PaymentModal';
import { ElectriciteModal } from '../components/ElectriciteModal';
import { ReleveModal } from '../components/ReleveModal';
import { useLocataires, useLogements } from '../hooks/useDatabase';
import { getLogement } from '../services/logementService';
import type { Locataire } from '../types';

export function TenantsScreen() {
  const [filter, setFilter] = useState<'tous' | 'ajour' | 'retard'>('tous');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editLocataire, setEditLocataire] = useState<(Locataire & { id: number }) | null>(null);
  const [detailTenant, setDetailTenant] = useState<(Locataire & { id: number }) | null>(null);
  const [paymentTenant, setPaymentTenant] = useState<(Locataire & { id: number }) | null>(null);
  const [electriciteTenant, setElectriciteTenant] = useState<(Locataire & { id: number }) | null>(null);
  const [releveTenant, setReleveTenant] = useState<(Locataire & { id: number }) | null>(null);
  const [propertyNames, setPropertyNames] = useState<Record<number, string>>({});
  const [tenantStatuses, setTenantStatuses] = useState<Record<number, 'à jour' | 'en retard'>>({});
  const [rentAmounts, setRentAmounts] = useState<Record<number, number>>({});

  const { locataires, refresh: refreshLocataires } = useLocataires();
  const { logements, refresh: refreshLogements } = useLogements();

  useEffect(() => {
    const load = async () => {
      const names: Record<number, string> = {};
      const statuses: Record<number, 'à jour' | 'en retard'> = {};
      const amounts: Record<number, number> = {};
      const now = new Date();
      const mois = now.getMonth() + 1;
      const annee = now.getFullYear();

      const { getPaiementMois, getMontantDuMois } = await import('../services/paiementService');
      const { getContratActif } = await import('../services/contratService');

      for (const loc of locataires) {
        if (loc.logement_id) {
          const log = await getLogement(loc.logement_id);
          names[loc.id!] = log?.numero ?? '-';
        }
        const contrat = await getContratActif(loc.id!);
        amounts[loc.id!] = contrat ? (contrat.montant_loyer || 0) + (contrat.montant_toilettes || 0) : 0;
        const paiement = await getPaiementMois(loc.id!, mois, annee);
        const montantDu = await getMontantDuMois(loc.id!, mois, annee);
        const montantPaye = paiement?.montant_paye ?? 0;
        const dernierJour = new Date(annee, mois, 0);
        statuses[loc.id!] =
          montantPaye >= montantDu ? 'à jour' : (dernierJour < now ? 'en retard' : 'à jour');
      }
      setPropertyNames(names);
      setTenantStatuses(statuses);
      setRentAmounts(amounts);
    };
    load();
  }, [locataires]);

  const filteredTenants = useMemo(() => {
    return locataires
      .filter((t) => t.statut === 'actif' || t.statut === 'contrat_echu')
      .filter((t) => {
        const matchFilter =
          filter === 'tous' ||
          (filter === 'ajour' && tenantStatuses[t.id!] === 'à jour') ||
          (filter === 'retard' && tenantStatuses[t.id!] === 'en retard');
        const matchSearch =
          !search.trim() ||
          t.nom_complet.toLowerCase().includes(search.toLowerCase());
        return matchFilter && matchSearch;
      });
  }, [locataires, filter, search, tenantStatuses]);

  const handleSuccess = () => {
    refreshLocataires();
    refreshLogements();
    setShowModal(false);
    setEditLocataire(null);
  };

  return (
    <View className="flex-1 bg-gray-50 relative">
      <View className="px-5 pt-4 pb-4">
        <Text className="text-2xl font-bold text-gray-900 mb-4">Locataires</Text>

        <View className="relative mb-4 flex-row items-center bg-white rounded-xl px-3 shadow-sm">
          <Search size={20} color="#9CA3AF" />
          <TextInput
            placeholder="Rechercher un locataire..."
            value={search}
            onChangeText={setSearch}
            className="flex-1 py-3 pl-2 text-sm text-gray-900"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            onPress={() => setFilter('tous')}
            className={`px-4 py-1.5 rounded-full mr-2 ${filter === 'tous' ? 'bg-primary' : 'bg-white border border-gray-200'}`}
          >
            <Text className={`text-sm font-medium ${filter === 'tous' ? 'text-white' : 'text-gray-600'}`}>
              Tous ({filteredTenants.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('ajour')}
            className={`px-4 py-1.5 rounded-full mr-2 ${filter === 'ajour' ? 'bg-green-600' : 'bg-white border border-gray-200'}`}
          >
            <Text className={`text-sm font-medium ${filter === 'ajour' ? 'text-white' : 'text-gray-600'}`}>
              À jour
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('retard')}
            className={`px-4 py-1.5 rounded-full ${filter === 'retard' ? 'bg-red-500' : 'bg-white border border-gray-200'}`}
          >
            <Text className={`text-sm font-medium ${filter === 'retard' ? 'text-white' : 'text-gray-600'}`}>
              En retard
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 100 }}>
        {filteredTenants.map((tenant, index) => (
          <TouchableOpacity
            key={tenant.id}
            onPress={() => setDetailTenant(tenant as Locataire & { id: number })}
            activeOpacity={0.9}
          >
            <TenantCard
              name={tenant.nom_complet}
              property={propertyNames[tenant.id!] ?? '-'}
              rentAmount={rentAmounts[tenant.id!] ?? 0}
              status={tenantStatuses[tenant.id!] ?? 'à jour'}
              delay={index * 0.1}
              telephone={tenant.telephone}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={() => {
          setEditLocataire(null);
          setShowModal(true);
        }}
        className="absolute bottom-24 right-5 w-14 h-14 bg-primary rounded-full shadow-lg shadow-blue-500/40 items-center justify-center z-20"
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>

      <LocataireFormModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditLocataire(null);
        }}
        onSuccess={handleSuccess}
        editLocataire={editLocataire}
        logements={logements}
      />

      <TenantDetailModal
        isOpen={!!detailTenant}
        onClose={() => setDetailTenant(null)}
        tenant={detailTenant}
        propertyName={detailTenant ? propertyNames[detailTenant.id!] ?? '-' : ''}
        rentAmount={detailTenant ? rentAmounts[detailTenant.id!] ?? 0 : 0}
        status={detailTenant ? tenantStatuses[detailTenant.id!] ?? 'à jour' : 'à jour'}
        onEdit={() => {
          setEditLocataire(detailTenant);
          setShowModal(true);
        }}
        onPayment={() => setPaymentTenant(detailTenant)}
        onElectricite={() => setElectriciteTenant(detailTenant)}
        onReleve={() => setReleveTenant(detailTenant)}
        onRefresh={refreshLocataires}
      />

      {paymentTenant && (
        <PaymentModal
          isOpen={!!paymentTenant}
          onClose={() => setPaymentTenant(null)}
          onSuccess={() => {
            refreshLocataires();
            setPaymentTenant(null);
          }}
          tenantName={paymentTenant.nom_complet}
          property={propertyNames[paymentTenant.id!] ?? '-'}
          amount={rentAmounts[paymentTenant.id!] ?? 0}
          locataireId={paymentTenant.id}
          mois={new Date().getMonth() + 1}
          annee={new Date().getFullYear()}
        />
      )}

      <ElectriciteModal
        isOpen={!!electriciteTenant}
        onClose={() => setElectriciteTenant(null)}
        onSuccess={() => {
          refreshLocataires();
          setElectriciteTenant(null);
        }}
        locataireId={electriciteTenant?.id ?? 0}
        tenantName={electriciteTenant?.nom_complet ?? ''}
      />

      <ReleveModal
        isOpen={!!releveTenant}
        onClose={() => setReleveTenant(null)}
        onSuccess={() => {
          refreshLocataires();
          setReleveTenant(null);
        }}
        locataireId={releveTenant?.id ?? 0}
        tenantName={releveTenant?.nom_complet ?? ''}
      />
    </View>
  );
}
