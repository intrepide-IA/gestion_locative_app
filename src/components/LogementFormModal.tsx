import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { X, Trash2 } from 'lucide-react-native';
import type { Logement, TypeLogement } from '../types';
import { createLogement, updateLogement, deleteLogement } from '../services/logementService';
import { TOILETTES_DEFAUT } from '../types';

interface LogementFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editLogement?: (Logement & { id: number }) | null;
}

export function LogementFormModal({ isOpen, onClose, onSuccess, editLogement }: LogementFormModalProps) {
  const [numero, setNumero] = useState('');
  const [type, setType] = useState<TypeLogement>('chambre_salon');
  const [loyer, setLoyer] = useState('');
  const [toilettes, setToilettes] = useState(TOILETTES_DEFAUT.toString());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editLogement) {
      setNumero(editLogement.numero);
      setType(editLogement.type);
      setLoyer(editLogement.loyer_mensuel.toString());
      setToilettes(editLogement.toilettes_mensuel.toString());
    } else {
      setNumero('');
      setType('chambre_salon');
      setLoyer('');
      setToilettes(TOILETTES_DEFAUT.toString());
    }
  }, [editLogement, isOpen]);

  const handleSubmit = async () => {
    if (!numero.trim() || !loyer) return;
    setSaving(true);
    try {
      const loyerNum = parseInt(loyer, 10) || 0;
      const toilettesNum = parseInt(toilettes, 10) || TOILETTES_DEFAUT;
      if (editLogement?.id) {
        await updateLogement(editLogement.id, {
          numero: numero.trim(),
          type,
          loyer_mensuel: loyerNum,
          toilettes_mensuel: toilettesNum,
        });
      } else {
        await createLogement({
          numero: numero.trim(),
          type,
          loyer_mensuel: loyerNum,
          toilettes_mensuel: toilettesNum,
          statut: 'libre',
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert('Erreur', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editLogement?.id) return;
    Alert.alert(
      'Supprimer',
      'Voulez-vous vraiment supprimer ce logement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLogement(editLogement.id);
              onSuccess();
              onClose();
            } catch (err) {
              Alert.alert('Erreur', (err as Error).message);
            }
          }
        }
      ]
    );
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

          <Text className="text-xl font-bold text-gray-900 mb-6">
            {editLogement ? 'Modifier le logement' : 'Nouveau logement'}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Numéro / Nom</Text>
                <TextInput
                  value={numero}
                  onChangeText={setNumero}
                  placeholder="Ex: A1, Studio B2"
                  className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-2">Type</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setType('chambre_salon')}
                    className={`flex-1 py-3 rounded-xl items-center border ${type === 'chambre_salon' ? 'bg-primary border-primary' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`font-medium ${type === 'chambre_salon' ? 'text-white' : 'text-gray-600'}`}>Chambre+Salon</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setType('entree_couchee')}
                    className={`flex-1 py-3 rounded-xl items-center border ${type === 'entree_couchee' ? 'bg-primary border-primary' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`font-medium ${type === 'entree_couchee' ? 'text-white' : 'text-gray-600'}`}>Entrée couchée</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Loyer mensuel (FCFA)</Text>
                <TextInput
                  value={loyer}
                  onChangeText={setLoyer}
                  keyboardType="numeric"
                  placeholder="150000"
                  className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Toilettes mensuel (FCFA)</Text>
                <TextInput
                  value={toilettes}
                  onChangeText={setToilettes}
                  keyboardType="numeric"
                  placeholder="1000"
                  className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={saving}
                className="bg-primary py-4 rounded-xl shadow-lg shadow-blue-500/30 items-center mt-4"
              >
                <Text className="text-white font-bold text-lg">
                  {saving ? 'Enregistrement...' : editLogement ? 'Enregistrer' : 'Créer'}
                </Text>
              </TouchableOpacity>

              {editLogement && (
                <TouchableOpacity
                  onPress={handleDelete}
                  className="flex-row items-center justify-center py-4 mt-2"
                >
                  <Trash2 size={20} color="#EF4444" className="mr-2" />
                  <Text className="text-red-500 font-bold">Supprimer le logement</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
