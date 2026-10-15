import { useState } from 'react';
import { View, Modal, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Text } from './ui/Text';
import { X } from 'lucide-react-native';
import { useLocataires } from '../hooks/useDatabase';
import { ensureFactureLoyer, createFacture } from '../services/factureService';
import { getContratActif } from '../services/contratService';
import { PRIX_KWH_DEFAUT } from '../types';
import { acheterElectricite } from '../services/electriciteService';

interface FactureFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mois: number;
  annee: number;
}

export function FactureFormModal({ isOpen, onClose, onSuccess, mois, annee }: FactureFormModalProps) {
  const { locataires } = useLocataires();
  const [type, setType] = useState<'loyer' | 'electricite'>('loyer');
  const [locataireId, setLocataireId] = useState<number | ''>('');
  const [montant, setMontant] = useState('');
  const [kwh, setKwh] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!locataireId) {
      Alert.alert('Attention', 'Veuillez sélectionner un locataire.');
      return;
    }
    const montantNum = parseInt(montant, 10) || 0;
    const kwhNum = parseInt(kwh, 10) || 0;

    if (type === 'loyer' && montantNum <= 0) {
      Alert.alert('Attention', 'Veuillez saisir un montant valide.');
      return;
    }
    if (type === 'electricite' && kwhNum <= 0) {
      Alert.alert('Attention', 'Veuillez saisir une consommation valide.');
      return;
    }

    setSaving(true);
    try {
      if (type === 'loyer') {
        const contrat = await getContratActif(locataireId);
        const montantDefaut = contrat ? (contrat.montant_loyer || 0) + (contrat.montant_toilettes || 0) : montantNum;
        const m = montantNum || montantDefaut;
        await ensureFactureLoyer(locataireId, mois, annee, m);
      } else {
        const contrat = await getContratActif(locataireId);
        const prixKwh = contrat?.prix_kwh ?? PRIX_KWH_DEFAUT;
        const finalMontant = montantNum || (kwhNum * prixKwh);
        await acheterElectricite(locataireId, finalMontant, prixKwh);
        const now = new Date();
        await createFacture('electricite', locataireId, finalMontant, {
          statut: 'paye',
          mois: now.getMonth() + 1,
          annee: now.getFullYear(),
          kwh_consommes: kwhNum,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', "Erreur lors de la création de la facture.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide">
      <View className="flex-1 bg-black/40 justify-end">
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <View className="bg-white rounded-t-[32px] p-6 pb-12 shadow-2xl max-h-[90vh]">
          <View className="w-12 h-1 bg-gray-200 self-center rounded-full mb-6" />
          <TouchableOpacity onPress={onClose} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full">
            <X size={20} color="#4B5563" />
          </TouchableOpacity>

          <Text className="text-xl font-bold text-gray-900 mb-6">Nouvelle facture</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="space-y-4">
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setType('loyer')}
                  className={`flex-1 py-3 rounded-xl items-center border ${type === 'loyer' ? 'bg-primary border-primary' : 'bg-gray-100 border-gray-100'}`}
                >
                  <Text className={`font-medium ${type === 'loyer' ? 'text-white' : 'text-gray-700'}`}>Loyer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setType('electricite')}
                  className={`flex-1 py-3 rounded-xl items-center border ${type === 'electricite' ? 'bg-primary border-primary' : 'bg-gray-100 border-gray-100'}`}
                >
                  <Text className={`font-medium ${type === 'electricite' ? 'text-white' : 'text-gray-700'}`}>Électricité</Text>
                </TouchableOpacity>
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Locataire</Text>
                <View className="bg-gray-50 rounded-xl overflow-hidden">
                  <ScrollView style={{ maxHeight: 150 }}>
                    {locataires.filter(l => l.statut === 'actif').map((l) => (
                      <TouchableOpacity
                        key={l.id}
                        onPress={() => setLocataireId(l.id!)}
                        className={`p-3 border-b border-gray-100 ${locataireId === l.id ? 'bg-blue-50' : ''}`}
                      >
                        <Text className={locataireId === l.id ? 'text-primary font-bold' : 'text-gray-700'}>
                          {l.nom_complet}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {type === 'loyer' && (
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-700 mb-1">Mois</Text>
                    <TextInput value={mois.toString()} editable={false} className="bg-gray-100 rounded-xl px-4 py-4 text-gray-500" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-700 mb-1">Année</Text>
                    <TextInput value={annee.toString()} editable={false} className="bg-gray-100 rounded-xl px-4 py-4 text-gray-500" />
                  </View>
                </View>
              )}

              {type === 'electricite' && (
                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-1">Consommation (kWh)</Text>
                  <TextInput
                    value={kwh}
                    onChangeText={(v) => {
                      setKwh(v);
                      const k = parseInt(v, 10) || 0;
                      if (k > 0) setMontant((k * PRIX_KWH_DEFAUT).toString());
                    }}
                    keyboardType="numeric"
                    placeholder="Ex: 50"
                    className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                  />
                </View>
              )}

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  {type === 'electricite' ? 'Montant calculé (FCFA)' : 'Montant (FCFA)'}
                </Text>
                <TextInput
                  value={montant}
                  onChangeText={setMontant}
                  keyboardType="numeric"
                  placeholder="Ex: 150000"
                  className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={saving}
                className="bg-primary py-4 rounded-xl shadow-lg shadow-blue-500/30 items-center mt-4"
              >
                <Text className="text-white font-bold text-lg">
                  {saving ? 'Création...' : 'Créer la facture'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
