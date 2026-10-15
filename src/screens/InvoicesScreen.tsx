import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AnimatedView, FadeInDown } from '../components/ui/AnimatedView';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { PaymentModal } from '../components/PaymentModal';
import { FactureFormModal } from '../components/FactureFormModal';
import { getFacturesByMonthYear } from '../services/factureService';
import type { Facture } from '../types';
import { nativeDb as db } from '../database/db.native';

const MOIS_NOMS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

interface FactureAvecInfos {
  facture: Facture & { id: number };
  tenantName: string;
  property: string;
}

export function InvoicesScreen() {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [selectedInvoice, setSelectedInvoice] = useState<FactureAvecInfos | null>(null);
  const [statusFilter, setStatusFilter] = useState<'toutes' | 'attente' | 'payees' | 'retard' | 'annulees'>('toutes');
  const [typeFilter, setTypeFilter] = useState<'toutes' | 'loyer' | 'electricite'>('toutes');
  const [invoicesData, setInvoicesData] = useState<FactureAvecInfos[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadFactures = async () => {
    const factures = await getFacturesByMonthYear(mois, annee);
    const data: FactureAvecInfos[] = [];
    for (const f of factures) {
      const loc = await db.getOne<any>('SELECT * FROM locataires WHERE id = ?', [f.locataire_id]);
      const log = loc?.logement_id ? await db.getOne<any>('SELECT * FROM logements WHERE id = ?', [loc.logement_id]) : null;
      data.push({
        facture: f as Facture & { id: number },
        tenantName: loc?.nom_complet ?? '-',
        property: log?.numero ?? '-',
      });
    }
    setInvoicesData(data);
  };

  useEffect(() => {
    loadFactures();
  }, [mois, annee]);

  const filteredInvoices = useMemo(() => {
    return invoicesData.filter(({ facture }) => {
      if (typeFilter !== 'toutes' && facture.type !== typeFilter) return false;
      if (statusFilter === 'payees' && facture.statut !== 'paye') return false;
      if (statusFilter === 'attente' && facture.statut !== 'en_attente') return false;
      if (statusFilter === 'retard') return false;
      if (statusFilter === 'annulees' && facture.statut !== 'annule') return false;
      return true;
    });
  }, [invoicesData, typeFilter, statusFilter]);

  const totalFacture = invoicesData.reduce((s, { facture }) => s + (facture.montant_total || 0), 0);
  const totalEncaisse = invoicesData
    .filter(({ facture }) => facture.statut === 'paye')
    .reduce((s, { facture }) => s + (facture.montant_total || 0), 0);
  const resteRecouvrer = totalFacture - totalEncaisse;

  const getStatusStyle = (statut: string) => {
    switch (statut) {
      case 'paye':
        return { bg: 'bg-green-100', text: 'text-green-600' };
      case 'en_attente':
        return { bg: 'bg-orange-100', text: 'text-orange-600' };
      case 'annule':
        return { bg: 'bg-gray-200', text: 'text-gray-500' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-600' };
    }
  };

  const prevMonth = () => {
    if (mois === 1) {
      setMois(12);
      setAnnee((a) => a - 1);
    } else setMois((m) => m - 1);
  };

  const nextMonth = () => {
    if (mois === 12) {
      setMois(1);
      setAnnee((a) => a + 1);
    } else setMois((m) => m + 1);
  };

  return (
    <View className="flex-1 bg-gray-50 relative">
      <View className="px-5 pt-4 pb-4">
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-2xl font-bold text-gray-900">Factures</Text>
          <View className="flex-row items-center bg-white px-3 py-1.5 rounded-full shadow-sm">
            <TouchableOpacity onPress={prevMonth} className="p-1">
              <ChevronLeft size={16} color="#4B5563" />
            </TouchableOpacity>
            <Text className="text-sm font-bold text-gray-900 mx-2">
              {MOIS_NOMS[mois - 1]} {annee}
            </Text>
            <TouchableOpacity onPress={nextMonth} className="p-1">
              <ChevronRight size={16} color="#4B5563" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="bg-primary rounded-3xl p-5 mb-4 shadow-lg shadow-blue-500/20">
          <View className="flex-row justify-between mb-4">
            <View>
              <Text className="text-blue-100 text-xs mb-1 opacity-80">Total facturé</Text>
              <Text className="font-bold text-xl text-white">
                {(totalFacture / 1000).toFixed(0)}k <Text className="text-[10px] font-normal">FCFA</Text>
              </Text>
            </View>
            <View>
              <Text className="text-blue-100 text-xs mb-1 opacity-80">Encaissé</Text>
              <Text className="font-bold text-xl text-white">
                {(totalEncaisse / 1000).toFixed(0)}k <Text className="text-[10px] font-normal">FCFA</Text>
              </Text>
            </View>
          </View>
          <View className="pt-3 border-t border-white/20 flex-row justify-between items-center">
            <Text className="text-sm text-white opacity-90">Reste à recouvrer</Text>
            <Text className="font-bold text-orange-300">
              {resteRecouvrer.toLocaleString('fr-FR')} FCFA
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3">
          {['toutes', 'loyer', 'electricite'].map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setTypeFilter(type as any)}
              className={`px-3 py-1.5 rounded-full mr-2 ${typeFilter === type ? 'bg-white shadow-sm' : 'bg-transparent'
                }`}
            >
              <Text className={`text-xs font-medium ${typeFilter === type ? 'text-gray-900' : 'text-gray-500'}`}>
                {type === 'toutes' ? 'Tous types' : type === 'loyer' ? 'Loyer' : 'Électricité'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          {[
            { id: 'toutes', label: 'Toutes', color: 'bg-gray-800' },
            { id: 'attente', label: 'En attente', color: 'bg-orange-500' },
            { id: 'payees', label: 'Payées', color: 'bg-green-600' },
            { id: 'annulees', label: 'Annulées', color: 'bg-gray-500' },
          ].map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setStatusFilter(f.id as any)}
              className={`px-4 py-1.5 rounded-full mr-2 ${statusFilter === f.id ? f.color : 'bg-white border border-gray-200'
                }`}
            >
              <Text className={`text-xs font-medium ${statusFilter === f.id ? 'text-white' : 'text-gray-600'}`}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 100 }}>
        {filteredInvoices.length === 0 ? (
          <View className="bg-white rounded-2xl p-8 items-center justify-center border border-gray-100">
            <Text className="text-gray-400 text-sm">Aucune facture pour ce mois</Text>
          </View>
        ) : (
          filteredInvoices.map(({ facture, tenantName, property }, index) => {
            const status = getStatusStyle(facture.statut);
            return (
              <AnimatedView
                key={facture.id}
                entering={FadeInDown.delay(index * 50).duration(250)}
              >
                <TouchableOpacity
                  onPress={() =>
                    facture.type === 'loyer' &&
                    facture.statut !== 'paye' &&
                    setSelectedInvoice({ facture: facture as Facture & { id: number }, tenantName, property })
                  }
                  activeOpacity={0.8}
                  className={`bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-100 ${facture.type === 'loyer' && facture.statut !== 'paye' ? '' : 'opacity-80'
                    }`}
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      <Text className="font-bold text-gray-900 text-sm">{tenantName}</Text>
                      <Text className="text-xs text-gray-500">{property}</Text>
                      <Text className="text-[10px] text-primary mt-1 font-medium">
                        {facture.type === 'loyer' ? 'LOYER' : 'ÉLECTRICITÉ'}
                      </Text>
                    </View>
                    <View className={`px-2 py-1 rounded-md ${status.bg}`}>
                      <Text className={`text-[10px] font-bold ${status.text}`}>
                        {facture.statut === 'paye'
                          ? 'PAYÉE'
                          : facture.statut === 'en_attente'
                            ? 'EN ATTENTE'
                            : 'ANNULÉE'}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row justify-between items-end mt-2">
                    <Text className="text-xs text-gray-400">
                      {new Date(facture.created_at).toLocaleDateString('fr-FR')}
                    </Text>
                    <Text className="font-bold text-gray-900">
                      {facture.montant_total?.toLocaleString('fr-FR')}{' '}
                      <Text className="text-[10px] text-gray-500 font-normal">FCFA</Text>
                    </Text>
                  </View>
                </TouchableOpacity>
              </AnimatedView>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        onPress={() => setShowCreateModal(true)}
        className="absolute bottom-24 right-5 w-14 h-14 bg-primary rounded-full shadow-lg shadow-blue-500/40 items-center justify-center z-20"
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>

      <PaymentModal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onSuccess={() => {
          loadFactures();
          setSelectedInvoice(null);
        }}
        tenantName={selectedInvoice?.tenantName || ''}
        property={selectedInvoice?.property || ''}
        amount={selectedInvoice?.facture.montant_total || 0}
        locataireId={selectedInvoice?.facture.locataire_id}
        mois={mois}
        annee={annee}
      />

      <FactureFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={loadFactures}
        mois={mois}
        annee={annee}
      />
    </View>
  );
}
