import { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { X, Calendar } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Locataire } from '../types';
import { createLocataire, updateLocataire } from '../services/locataireService';
import { createContrat } from '../services/contratService';
import type { Logement } from '../types';

interface LocataireFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editLocataire?: (Locataire & { id: number }) | null;
  logements: Logement[];
}

export function LocataireFormModal({ isOpen, onClose, onSuccess, editLocataire, logements }: LocataireFormModalProps) {
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [logementId, setLogementId] = useState<number | ''>('');
  const [dateEntree, setDateEntree] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [caution, setCaution] = useState('');
  const [loyer, setLoyer] = useState('');
  const [toilettes, setToilettes] = useState('1000');
  const [releveInitial, setReleveInitial] = useState('');
  const [saving, setSaving] = useState(false);

  const logementsLibres = editLocataire
    ? logements.filter((l) => l.statut === 'libre' || l.id === editLocataire.logement_id)
    : logements.filter((l) => l.statut === 'libre');

  useEffect(() => {
    if (editLocataire) {
      setNom(editLocataire.nom_complet);
      setTelephone(editLocataire.telephone);
      setLogementId(editLocataire.logement_id);
      setDateEntree(new Date(editLocataire.date_entree));
    } else if (isOpen) {
      setNom('');
      setTelephone('');
      setLogementId(logementsLibres[0]?.id ?? '');
      setDateEntree(new Date());
      setCaution('');
      setLoyer('');
      setToilettes('1000');
      setReleveInitial('');
    }
  }, [editLocataire, isOpen]);

  const handleSubmit = async () => {
    if (!nom.trim() || !telephone || !logementId) return;
    setSaving(true);
    try {
      const dateEntreeStr = dateEntree.toISOString().slice(0, 10);
      const logement = logements.find((l) => l.id === logementId);
      const loyerNum = loyer ? parseInt(loyer, 10) : (logement?.loyer_mensuel ?? 0);
      const toilettesNum = parseInt(toilettes, 10) || 1000;
      const cautionNum = parseInt(caution, 10) || 0;
      const releveInitNum = parseInt(releveInitial, 10) || 0;

      if (editLocataire?.id) {
        await updateLocataire(editLocataire.id, {
          nom_complet: nom.trim(),
          telephone: telephone.trim(),
          date_entree: dateEntreeStr,
          caution: cautionNum,
        });
      } else {
        const locId = await createLocataire({
          nom_complet: nom.trim(),
          telephone: telephone.trim(),
          date_entree: dateEntreeStr,
          caution: cautionNum,
          logement_id: logementId as number,
          statut: 'actif',
          releve_compteur_initial: releveInitNum,
        });
        await createContrat({
          locataire_id: locId,
          date_debut: dateEntreeStr,
          date_fin: new Date(new Date(dateEntree).setFullYear(new Date(dateEntree).getFullYear() + 1))
            .toISOString()
            .slice(0, 10),
          montant_loyer: loyerNum,
          montant_toilettes: toilettesNum,
          prix_kwh: 250,
        });
        const { updateLogement } = await import('../services/logementService');
        await updateLogement(logementId as number, { statut: 'occupe' });
      }
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert('Erreur', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDateChange = (_: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setDateEntree(selectedDate);
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
            {editLocataire ? 'Modifier le locataire' : 'Nouveau locataire'}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Nom complet</Text>
                <TextInput
                  value={nom}
                  onChangeText={setNom}
                  placeholder="Fatou Diop"
                  className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Téléphone</Text>
                <TextInput
                  value={telephone}
                  onChangeText={setTelephone}
                  keyboardType="phone-pad"
                  placeholder="+221 77 123 45 67"
                  className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Logement</Text>
                <View className="bg-gray-50 rounded-xl overflow-hidden">
                  <ScrollView style={{ maxHeight: 120 }}>
                    {logementsLibres.map((l) => (
                      <TouchableOpacity
                        key={l.id}
                        onPress={() => setLogementId(l.id!)}
                        disabled={!!editLocataire}
                        className={`p-3 border-b border-gray-100 ${logementId === l.id ? 'bg-blue-50' : ''}`}
                      >
                        <Text className={logementId === l.id ? 'text-primary font-bold' : 'text-gray-700'}>
                          {l.numero} - {l.loyer_mensuel.toLocaleString()} FCFA
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {logementsLibres.length === 0 && (
                      <Text className="p-3 text-red-500 text-xs text-center">Aucun logement disponible</Text>
                    )}
                  </ScrollView>
                </View>
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Date d’entrée</Text>
                <TouchableOpacity
                  onPress={() => !editLocataire && setShowDatePicker(true)}
                  className="bg-gray-50 rounded-xl px-4 py-4 flex-row justify-between items-center"
                >
                  <Text className="text-gray-900">{dateEntree.toLocaleDateString('fr-FR')}</Text>
                  <Calendar size={20} color="#4B5563" />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={dateEntree}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                  />
                )}
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">Caution (FCFA)</Text>
                <TextInput
                  value={caution}
                  onChangeText={setCaution}
                  keyboardType="numeric"
                  placeholder="0"
                  className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                />
              </View>

              {!editLocataire && (
                <>
                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">Relevé compteur initial (kWh)</Text>
                    <TextInput
                      value={releveInitial}
                      onChangeText={setReleveInitial}
                      keyboardType="numeric"
                      placeholder="0"
                      className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">Loyer mensuel (FCFA)</Text>
                    <TextInput
                      value={loyer}
                      onChangeText={setLoyer}
                      keyboardType="numeric"
                      placeholder="Auto depuis logement"
                      className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                    />
                  </View>
                  <View>
                    <Text className="text-sm font-medium text-gray-700 mb-1">Toilettes (FCFA)</Text>
                    <TextInput
                      value={toilettes}
                      onChangeText={setToilettes}
                      keyboardType="numeric"
                      className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900"
                    />
                  </View>
                </>
              )}

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={saving || (!editLocataire && logementsLibres.length === 0)}
                className={`py-4 rounded-xl shadow-lg items-center mt-4 ${saving || (!editLocataire && logementsLibres.length === 0) ? 'bg-gray-300' : 'bg-primary'}`}
              >
                <Text className="text-white font-bold text-lg">
                  {saving ? 'Enregistrement...' : editLocataire ? 'Enregistrer' : 'Créer'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
