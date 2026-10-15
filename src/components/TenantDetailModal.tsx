import { View, Modal, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text } from './ui/Text';
import { AnimatedView, SlideInDown } from './ui/AnimatedView';
import { X, Edit, Wallet, Zap, Gauge, History, FileText, Trash2, CalendarX } from 'lucide-react-native';
import type { Locataire } from '../types';
import { deleteLocataire, marquerContratEchu } from '../services/locataireService';
import { usePaiementsByLocataire, useFacturesByLocataire } from '../hooks/useDatabase';

interface TenantDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: (Locataire & { id: number }) | null;
  propertyName: string;
  rentAmount: number;
  status: string;
  onEdit: () => void;
  onPayment: () => void;
  onElectricite: () => void;
  onReleve: () => void;
  onRefresh: () => void;
}

export function TenantDetailModal({
  isOpen,
  onClose,
  tenant,
  propertyName,
  rentAmount,
  status,
  onEdit,
  onPayment,
  onElectricite,
  onReleve,
  onRefresh,
}: TenantDetailModalProps) {
  const { paiements = [] } = usePaiementsByLocataire(tenant?.id);
  const { factures = [] } = useFacturesByLocataire(tenant?.id);

  if (!tenant) return null;

  const handleStatusChange = async () => {
    Alert.alert(
      'Contrat échu',
      'Marquer ce contrat comme échu ? Le logement sera libéré.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            await marquerContratEchu(tenant.id);
            onRefresh();
            onClose();
          }
        }
      ]
    );
  };

  const handleDelete = async () => {
    Alert.alert(
      'Supprimer',
      'Supprimer définitivement ce locataire ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteLocataire(tenant.id);
            onRefresh();
            onClose();
          }
        }
      ]
    );
  };

  const actions = [
    { icon: Edit, label: 'Modifier', onClick: onEdit, color: 'bg-blue-100', textColor: 'text-blue-600' },
    { icon: Wallet, label: 'Payer loyer', onClick: onPayment, color: 'bg-green-100', textColor: 'text-green-600' },
    { icon: Zap, label: 'Électricité', onClick: onElectricite, color: 'bg-orange-100', textColor: 'text-orange-600' },
    { icon: Gauge, label: 'Relevé', onClick: onReleve, color: 'bg-purple-100', textColor: 'text-purple-600' },
    { icon: CalendarX, label: 'Échu', onClick: handleStatusChange, color: 'bg-gray-100', textColor: 'text-gray-600' },
    { icon: Trash2, label: 'Supprimer', onClick: handleDelete, color: 'bg-red-50', textColor: 'text-red-500' },
  ];

  return (
    <Modal visible={isOpen} transparent animationType="slide">
      <View className="flex-1 bg-black/40 justify-end">
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <AnimatedView
          entering={SlideInDown.duration(300)}
          className="bg-white rounded-t-[32px] p-6 pb-12 shadow-2xl max-h-[90vh]"
        >
          <View className="w-12 h-1 bg-gray-200 self-center rounded-full mb-6" />
          <TouchableOpacity onPress={onClose} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full">
            <X size={20} color="#4B5563" />
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-gray-900 mb-1">{tenant.nom_complet}</Text>
          <Text className="text-sm text-gray-500 mb-1">{propertyName}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-3">
            {rentAmount.toLocaleString('fr-FR')} FCFA / mois
          </Text>

          <View className="flex-row items-center gap-2 mb-6">
            <View className={`px-2 py-1 rounded-full ${status === 'en retard' ? 'bg-red-100' : 'bg-green-100'}`}>
              <Text className={`text-[10px] font-bold ${status === 'en retard' ? 'text-red-600' : 'text-green-600'}`}>
                {status.toUpperCase()}
              </Text>
            </View>
            {tenant.statut === 'contrat_echu' && (
              <View className="bg-gray-100 px-2 py-1 rounded-full">
                <Text className="text-[10px] font-bold text-gray-600">CONTRAT ÉCHU</Text>
              </View>
            )}
          </View>

          <View className="flex-row flex-wrap justify-between gap-y-3 mb-8">
            {actions.map(({ icon: Icon, label, onClick, color, textColor }) => (
              <TouchableOpacity
                key={label}
                onPress={() => {
                  if (label === 'Échu' || label === 'Supprimer') {
                    onClick();
                  } else {
                    onClick();
                    onClose();
                  }
                }}
                className={`w-[31%] aspect-square items-center justify-center rounded-2xl ${color}`}
              >
                <Icon size={24} color={textColor === 'text-blue-600' ? '#2563EB' : textColor === 'text-green-600' ? '#16A34A' : textColor === 'text-orange-600' ? '#EA580C' : textColor === 'text-purple-600' ? '#9333EA' : textColor === 'text-red-500' ? '#EF4444' : '#4B5563'} />
                <Text className={`text-[10px] font-bold mt-2 ${textColor}`}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            <View className="mb-6">
              <View className="flex-row items-center mb-3">
                <History size={16} color="#1E3A8A" className="mr-2" />
                <Text className="text-sm font-bold text-gray-900">Historique des paiements</Text>
              </View>
              {paiements.length === 0 ? (
                <Text className="text-xs text-gray-400 italic">Aucun paiement enregistré</Text>
              ) : (
                <View className="space-y-2">
                  {paiements.map((p) => (
                    <View key={p.id} className="flex-row justify-between items-center p-3 bg-gray-50 rounded-xl">
                      <View>
                        <Text className="text-xs font-bold text-gray-900">Mois {p.mois}/{p.annee}</Text>
                        <Text className="text-[10px] text-gray-500">{new Date(p.date_paiement!).toLocaleDateString()}</Text>
                      </View>
                      <Text className="text-xs font-bold text-green-600">+{p.montant_paye.toLocaleString()} F</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View className="mb-6">
              <View className="flex-row items-center mb-3">
                <FileText size={16} color="#1E3A8A" className="mr-2" />
                <Text className="text-sm font-bold text-gray-900">Factures récentes</Text>
              </View>
              {factures.length === 0 ? (
                <Text className="text-xs text-gray-400 italic">Aucune facture émise</Text>
              ) : (
                <View className="space-y-2">
                  {factures.map((f) => (
                    <View key={f.id} className="flex-row justify-between items-center p-3 bg-gray-50 rounded-xl">
                      <View>
                        <Text className="text-xs font-bold text-gray-900">{f.numero_unique}</Text>
                        <Text className="text-[10px] text-gray-500">{f.type === 'loyer' ? 'Loyer' : 'Élec.'} • {new Date(f.created_at).toLocaleDateString()}</Text>
                      </View>
                      <Text className="text-xs font-bold text-gray-900">{f.montant_total.toLocaleString()} F</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </AnimatedView>
      </View>
    </Modal>
  );
}
