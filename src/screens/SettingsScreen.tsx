import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { Trash2, Bell, Shield, ChevronRight, LogOut, Download, Upload, FileJson } from 'lucide-react-native';
import { useProprietaire } from '../hooks/useDatabase';
import { updateProprietaire } from '../services/proprietaireService';
import { exportJSON } from '../services/exportImportService';
import {
  setNotificationsEnabled,
  demanderPermission,
} from '../services/notificationService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { STORAGE_KEYS, APP_VERSION } from '../constants';
import { pinService } from '../security/native';
import { PIN_FORMAT_MESSAGES, PIN_MAX_LENGTH, PIN_MIN_LENGTH, validateNewPin } from '../security/pin';
import { formatDelay } from '../security/format';
import type { Proprietaire } from '../types';

interface SettingsScreenProps {
  onLogout: () => void;
}

export function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const { proprietaire, refresh } = useProprietaire();
  const [notifications, setNotifications] = useLocalStorage(STORAGE_KEYS.NOTIFICATIONS, true);
  const [showProfilModal, setShowProfilModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const handleNotificationsToggle = async () => {
    const next = !notifications;
    if (next) {
      const ok = await demanderPermission();
      if (!ok) return;
    }
    setNotifications(next);
    setNotificationsEnabled(next);
  };

  const handleExport = async () => {
    try {
      await exportJSON();
      setShowExportModal(false);
    } catch (err) {
      Alert.alert('Erreur', 'Impossible d\'exporter les données');
    }
  };

  // Restauration et réinitialisation désactivées jusqu’au lot 8 (import validé et atomique, PIN requis).
  const handleImport = () => {
    Alert.alert('Bientôt disponible', 'La restauration d’une sauvegarde arrive avec le lot 8 de la refonte.');
  };

  const handleResetDB = () => {
    Alert.alert('Bientôt disponible', 'La réinitialisation protégée par PIN arrive avec le lot 8 de la refonte.');
  };

  const initials = proprietaire?.nom
    ?.split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() ?? 'PR';

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView className="flex-1 px-5 pt-4" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-2xl font-bold text-gray-900 mb-6">Paramètres</Text>

        <View className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex-row items-center mb-8">
          <View className="w-16 h-16 rounded-full bg-primary items-center justify-center shadow-md">
            <Text className="text-white text-xl font-bold">{initials}</Text>
          </View>
          <View className="ml-4 flex-1">
            <Text className="font-bold text-gray-900 text-lg">{proprietaire?.nom ?? 'Propriétaire'}</Text>
            <Text className="text-sm text-gray-500">{proprietaire?.telephone ?? '-'}</Text>
            <TouchableOpacity onPress={() => setShowProfilModal(true)}>
              <Text className="text-primary text-xs font-medium mt-1">Modifier le profil</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-2">
            Préférences
          </Text>
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <TouchableOpacity
              onPress={handleNotificationsToggle}
              className="flex-row items-center justify-between p-4 border-b border-gray-50"
            >
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center mr-3">
                  <Bell size={16} color="#4B5563" />
                </View>
                <Text className="text-sm font-medium text-gray-900">Notifications</Text>
              </View>
              <View className={`w-10 h-6 rounded-full p-1 ${notifications ? 'bg-green-600' : 'bg-gray-200'}`}>
                <View className={`w-4 h-4 rounded-full bg-white ${notifications ? 'translate-x-4' : 'translate-x-0'} transition-transform`} />
              </View>
            </TouchableOpacity>
            <View className="p-4">
              <Text className="text-xs text-gray-500">Rappels loyer, échéances, alertes kWh</Text>
            </View>
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-2">
            Données
          </Text>
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <TouchableOpacity onPress={() => setShowExportModal(true)} className="flex-row items-center justify-between p-4 border-b border-gray-50">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center mr-3">
                  <Download size={16} color="#3B82F6" />
                </View>
                <Text className="text-sm font-medium text-gray-900">Exporter (JSON)</Text>
              </View>
              <ChevronRight size={16} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleImport} className="flex-row items-center justify-between p-4 border-b border-gray-50">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center mr-3">
                  <Upload size={16} color="#3B82F6" />
                </View>
                <Text className="text-sm font-medium text-gray-900">Importer (bientôt)</Text>
              </View>
              <ChevronRight size={16} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleResetDB} className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-red-100 items-center justify-center mr-3">
                  <Trash2 size={16} color="#EF4444" />
                </View>
                <Text className="text-sm font-medium text-red-500">Réinitialiser la base (bientôt)</Text>
              </View>
              <ChevronRight size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-8">
          <Text className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-2">
            Sécurité
          </Text>
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <TouchableOpacity onPress={() => setShowPinModal(true)} className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center mr-3">
                  <Shield size={16} color="#4B5563" />
                </View>
                <Text className="text-sm font-medium text-gray-900">Modifier le code PIN</Text>
              </View>
              <ChevronRight size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={onLogout}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center justify-center mb-8"
        >
          <LogOut size={20} color="#EF4444" className="mr-2" />
          <Text className="font-bold text-red-500">Verrouiller l’application</Text>
        </TouchableOpacity>

        <Text className="text-center text-xs text-gray-400 mb-8">GestiLoc v{APP_VERSION}</Text>
      </ScrollView>

      {/* Internal Modals */}
      <ProfilModal
        isOpen={showProfilModal}
        onClose={() => setShowProfilModal(false)}
        proprietaire={proprietaire}
        onSuccess={() => {
          refresh();
          setShowProfilModal(false);
        }}
      />

      <PinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
      />

      <Modal
        visible={showExportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowExportModal(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={() => setShowExportModal(false)}
        >
          <View className="bg-white rounded-t-[32px] p-6">
            <View className="w-12 h-1 bg-gray-200 self-center rounded-full mb-6" />
            <Text className="text-xl font-bold mb-4">Exporter les données</Text>
            <Text className="text-sm text-gray-500 mb-6">
              Téléchargez une copie JSON de toute la base (logements, locataires, paiements...).
            </Text>
            <TouchableOpacity
              onPress={handleExport}
              className="bg-primary flex-row items-center justify-center py-4 rounded-xl"
            >
              <FileJson size={20} color="white" className="mr-2" />
              <Text className="text-white font-bold text-lg">Partager JSON</Text>
            </TouchableOpacity>
            <View className="h-10" />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

interface ProfilModalProps {
  isOpen: boolean;
  onClose: () => void;
  proprietaire: Proprietaire | null;
  onSuccess: () => void;
}

function ProfilModal({ isOpen, onClose, proprietaire, onSuccess }: ProfilModalProps) {
  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      {isOpen ? <ProfilForm proprietaire={proprietaire} onClose={onClose} onSuccess={onSuccess} /> : null}
    </Modal>
  );
}

/** Monté à chaque ouverture : les champs partent des valeurs enregistrées, sans effet de synchronisation. */
function ProfilForm({ proprietaire, onClose, onSuccess }: Omit<ProfilModalProps, 'isOpen'>) {
  const [nom, setNom] = useState(proprietaire?.nom ?? '');
  const [telephone, setTelephone] = useState(proprietaire?.telephone ?? '');
  const [adresse, setAdresse] = useState(proprietaire?.adresse ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await updateProprietaire({ nom, telephone, adresse });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={onClose}>
      <TouchableOpacity activeOpacity={1} className="bg-white rounded-t-[32px] p-6">
        <Text className="text-xl font-bold text-ink mb-6">Modifier le profil</Text>
        <View className="gap-4">
          <View>
            <Text className="text-sm font-medium text-ink mb-1">Nom</Text>
            <TextInput value={nom} onChangeText={setNom} className="bg-background rounded-xl px-4 py-3" />
          </View>
          <View>
            <Text className="text-sm font-medium text-ink mb-1">Téléphone</Text>
            <TextInput
              value={telephone}
              onChangeText={setTelephone}
              keyboardType="phone-pad"
              className="bg-background rounded-xl px-4 py-3"
            />
          </View>
          <View>
            <Text className="text-sm font-medium text-ink mb-1">Adresse</Text>
            <TextInput value={adresse} onChangeText={setAdresse} className="bg-background rounded-xl px-4 py-3" />
          </View>
          {error ? <Text className="text-danger text-center">{error}</Text> : null}
          <TouchableOpacity onPress={handleSubmit} disabled={saving} className="bg-primary py-4 rounded-xl mt-2">
            <Text className="text-white text-center font-bold text-lg">{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
          </TouchableOpacity>
        </View>
        <View className="h-10" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function PinModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      {isOpen ? <PinForm onClose={onClose} /> : null}
    </Modal>
  );
}

function PinForm({ onClose }: { onClose: () => void }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const formatError = validateNewPin(newPin);
    if (formatError) return setError(PIN_FORMAT_MESSAGES[formatError]);
    if (newPin !== confirmPin) return setError('La confirmation ne correspond pas au nouveau code.');
    if (newPin === currentPin) return setError('Le nouveau code doit être différent de l’actuel.');

    setSaving(true);
    try {
      const result = await pinService.changePin(currentPin, newPin);
      if (result.status === 'ok') {
        Alert.alert('Code PIN modifié', 'Utilisez désormais votre nouveau code.');
        onClose();
      } else if (result.status === 'locked') {
        setError(`Trop d’essais. Réessayez dans ${formatDelay(result.lockedUntil)}.`);
      } else if (result.status === 'wrong') {
        setError(
          result.lockedUntil
            ? `Code actuel incorrect. Saisie bloquée ${formatDelay(result.lockedUntil)}.`
            : `Code actuel incorrect (${result.remainingBeforeLock} essai(s) avant blocage).`
        );
      } else {
        setError('Aucun code PIN enregistré.');
      }
    } finally {
      setSaving(false);
    }
  };

  const pinInput = (placeholder: string, value: string, onChange: (v: string) => void) => (
    <TextInput
      placeholder={placeholder}
      secureTextEntry
      keyboardType="number-pad"
      maxLength={PIN_MAX_LENGTH}
      value={value}
      onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
      className="bg-background rounded-xl p-4 text-center text-xl mb-4"
    />
  );

  return (
    <View className="flex-1 bg-black/60 items-center justify-center p-6">
      <View className="bg-white w-full rounded-3xl p-6">
        <Text className="text-xl font-bold text-ink mb-2 text-center">Changer le code PIN</Text>
        <Text className="text-muted text-center mb-6">
          {PIN_MIN_LENGTH} à {PIN_MAX_LENGTH} chiffres
        </Text>
        {pinInput('Code actuel', currentPin, setCurrentPin)}
        {pinInput('Nouveau code', newPin, setNewPin)}
        {pinInput('Confirmer le nouveau code', confirmPin, setConfirmPin)}
        {error ? <Text className="text-danger text-center mb-4">{error}</Text> : null}
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={onClose} className="flex-1 bg-background py-4 rounded-xl">
            <Text className="text-center font-bold text-ink">Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSubmit} disabled={saving} className="flex-1 bg-primary py-4 rounded-xl">
            <Text className="text-white text-center font-bold">{saving ? '…' : 'Valider'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
