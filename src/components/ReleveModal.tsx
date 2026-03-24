import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, Alert } from 'react-native';
import { X, Gauge } from 'lucide-react-native';
import { enregistrerReleve, getDernierReleve } from '../services/electriciteService';

interface ReleveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  locataireId: number;
  tenantName: string;
}

export function ReleveModal({ isOpen, onClose, onSuccess, locataireId, tenantName }: ReleveModalProps) {
  const [nouveauCompteur, setNouveauCompteur] = useState('');
  const [ancienCompteur, setAncienCompteur] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getDernierReleve(locataireId).then((r) => r && setAncienCompteur(r.nouveau_compteur));
    }
  }, [isOpen, locataireId]);

  const handleSubmit = async () => {
    const val = parseInt(nouveauCompteur, 10);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      await enregistrerReleve(locataireId, val);
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert('Erreur', "Échec de l'enregistrement du relevé.");
    } finally {
      setSaving(false);
    }
  };

  const consommation = ancienCompteur != null && nouveauCompteur
    ? Math.max(0, parseInt(nouveauCompteur, 10) - ancienCompteur)
    : null;

  return (
    <Modal visible={isOpen} transparent animationType="slide">
      <View className="flex-1 bg-black/40 justify-end">
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <View className="bg-white rounded-t-[32px] p-6 pb-12 shadow-2xl">
          <View className="w-12 h-1 bg-gray-200 self-center rounded-full mb-6" />
          <TouchableOpacity onPress={onClose} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full">
            <X size={20} color="#4B5563" />
          </TouchableOpacity>

          <View className="flex-row items-center mb-6">
            <Gauge size={24} color="#1E3A8A" className="mr-2" />
            <Text className="text-xl font-bold">Relevé compteur</Text>
          </View>

          <Text className="text-sm text-gray-500 mb-4">{tenantName}</Text>

          {ancienCompteur != null && (
            <View className="bg-blue-50 p-4 rounded-2xl mb-6">
              <Text className="text-sm text-gray-600">
                Dernier relevé: <Text className="font-bold text-primary">{ancienCompteur} kWh</Text>
              </Text>
            </View>
          )}

          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 mb-1">Nouveau compteur (kWh)</Text>
            <TextInput
              value={nouveauCompteur}
              onChangeText={setNouveauCompteur}
              keyboardType="numeric"
              placeholder="Ex: 1250"
              className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900 text-lg"
            />
            {consommation != null && (
              <Text className="text-xs text-gray-500 mt-2 ml-1">
                Consommation: <Text className="font-bold">{consommation} kWh</Text>
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving}
            className={`py-4 rounded-xl shadow-lg items-center ${saving ? 'bg-gray-300' : 'bg-primary'}`}
          >
            <Text className="text-white font-bold text-lg">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
