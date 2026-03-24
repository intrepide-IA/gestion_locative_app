import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, Alert } from 'react-native';
import { X, Zap } from 'lucide-react-native';
import { acheterElectricite, getStockActuel } from '../services/electriciteService';
import { getContratActif } from '../services/contratService';
import { createFacture, getFacture } from '../services/factureService';
import { genererFacturePDF, partagerFacture } from '../services/pdfService';
import { getFirstProprietaire } from '../services/proprietaireService';
import { getLocataire } from '../services/locataireService';
import { PRIX_KWH_DEFAUT } from '../types';

interface ElectriciteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  locataireId: number;
  tenantName: string;
}

export function ElectriciteModal({ isOpen, onClose, onSuccess, locataireId, tenantName }: ElectriciteModalProps) {
  const [montant, setMontant] = useState('');
  const [saving, setSaving] = useState(false);
  const [kwhRestant, setKwhRestant] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      getStockActuel(locataireId).then(setKwhRestant);
    }
  }, [isOpen, locataireId]);

  const handleSubmit = async () => {
    const m = parseInt(montant, 10) || 0;
    if (m < 1000) return;
    setSaving(true);
    try {
      const contrat = await getContratActif(locataireId);
      const prixKwh = contrat?.prix_kwh ?? PRIX_KWH_DEFAUT;
      await acheterElectricite(locataireId, m, prixKwh);

      const now = new Date();
      const factureId = await createFacture('electricite', locataireId, m, {
        statut: 'paye',
        mois: now.getMonth() + 1,
        annee: now.getFullYear(),
      });

      try {
        const [proprio, loc, facture] = await Promise.all([
          getFirstProprietaire(),
          getLocataire(locataireId),
          getFacture(factureId),
        ]);
        if (proprio && loc && facture) {
          const { uri } = await genererFacturePDF(
            facture,
            proprio,
            loc,
            [{ libelle: 'Achat électricité', montant: m }],
          );
          await partagerFacture(uri);
        }
      } catch (err) {
        console.error(err);
        Alert.alert('Succès', "Électricité achetée, mais la génération du PDF a échoué.");
      }

      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const m = parseInt(montant, 10) || 0;
  const kwhGenerated = m ? Math.floor(m / 250) : 0;

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
            <Zap size={24} color="#1E3A8A" className="mr-2" />
            <Text className="text-xl font-bold">Achat électricité</Text>
          </View>

          <Text className="text-sm text-gray-500 mb-4">{tenantName}</Text>

          {kwhRestant != null && (
            <View className="bg-blue-50 p-4 rounded-2xl mb-6">
              <Text className="text-sm text-gray-600">
                Stock actuel: <Text className="font-bold text-primary">{kwhRestant.toFixed(1)} kWh</Text>
              </Text>
            </View>
          )}

          <View className="mb-6">
            <Text className="text-sm font-medium text-gray-700 mb-1">Montant (FCFA)</Text>
            <TextInput
              value={montant}
              onChangeText={setMontant}
              keyboardType="numeric"
              placeholder="Ex: 5000"
              className="bg-gray-50 rounded-xl px-4 py-4 text-gray-900 text-lg"
            />
            {m > 0 && (
              <Text className="text-xs text-gray-500 mt-2 ml-1">
                ≈ {kwhGenerated} kWh (250 FCFA/kWh)
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving || m < 1000}
            className={`py-4 rounded-xl shadow-lg items-center ${saving || m < 1000 ? 'bg-gray-300' : 'bg-primary'}`}
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
