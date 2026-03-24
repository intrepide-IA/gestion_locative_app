import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, Alert } from 'react-native';
import { MotiView } from 'moti';
import { X, CheckCircle2, CreditCard, Banknote, Smartphone } from 'lucide-react-native';
import { enregistrerPaiement } from '../services/paiementService';
import { ensureFactureLoyer, getFacture, annulerFacture } from '../services/factureService';
import { genererFacturePDF, partagerFacture } from '../services/pdfService';
import { getFirstProprietaire } from '../services/proprietaireService';
import { getLocataire } from '../services/locataireService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tenantName: string;
  property: string;
  amount: number;
  locataireId?: number;
  mois?: number;
  annee?: number;
}

export function PaymentModal({
  isOpen,
  onClose,
  onSuccess,
  tenantName,
  property,
  amount,
  locataireId,
  mois = new Date().getMonth() + 1,
  annee = new Date().getFullYear(),
}: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'mobile' | 'cash' | 'bank'>('mobile');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [inputAmount, setInputAmount] = useState(amount.toString());

  useEffect(() => {
    if (isOpen) setInputAmount(amount.toString());
  }, [isOpen, amount]);

  const handleConfirm = async () => {
    const montant = parseInt(inputAmount, 10) || 0;
    if (montant <= 0) return;
    setIsProcessing(true);
    let factureId: number | undefined;
    try {
      if (locataireId) {
        factureId = await ensureFactureLoyer(locataireId, mois, annee, montant);
        await enregistrerPaiement(locataireId, mois, annee, montant, factureId);

        const [proprio, loc, facture] = await Promise.all([
          getFirstProprietaire(),
          getLocataire(locataireId),
          getFacture(factureId),
        ]);

        if (proprio && loc && facture) {
          try {
            const { uri } = await genererFacturePDF(
              facture,
              proprio,
              loc,
              [{ libelle: `Loyer ${mois}/${annee}`, montant }]
            );
            await partagerFacture(uri);
          } catch (err) {
            console.error(err);
            Alert.alert('Paiement', 'Paiement enregistré, mais la génération du PDF a échoué.');
          }
        }
      }
      setIsSuccess(true);
      onSuccess?.();
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2000);
    } catch (e) {
      console.error(e);
      if (factureId) {
        await annulerFacture(factureId);
      }
      Alert.alert('Erreur', "Une erreur est survenue lors de l'enregistrement du paiement.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide">
      <View className="flex-1 bg-black/40 justify-end">
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <MotiView
          from={{ translateY: 300 }}
          animate={{ translateY: 0 }}
          className="bg-white rounded-t-[32px] p-6 pb-12 shadow-2xl"
        >
          {isSuccess ? (
            <MotiView
              from={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="items-center justify-center py-10"
            >
              <CheckCircle2 size={80} color="#16A34A" className="mb-4" />
              <Text className="text-2xl font-bold text-gray-900 mb-2">Paiement validé</Text>
              <Text className="text-gray-500 text-center">Le reçu a été généré</Text>
            </MotiView>
          ) : (
            <>
              <TouchableOpacity onPress={onClose} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full">
                <X size={20} color="#4B5563" />
              </TouchableOpacity>

              <Text className="text-xl font-bold text-gray-900 mb-6">Enregistrer un paiement</Text>

              <View className="bg-gray-50 rounded-2xl p-4 mb-6">
                <Text className="text-xs text-gray-500 mb-1">Locataire</Text>
                <Text className="font-bold text-gray-900">{tenantName}</Text>
                <Text className="text-xs text-gray-500 mt-1">{property}</Text>
              </View>

              <View className="mb-6">
                <Text className="text-sm font-medium text-gray-700 mb-2">Montant (FCFA)</Text>
                <TextInput
                  value={inputAmount}
                  onChangeText={setInputAmount}
                  keyboardType="numeric"
                  className="text-3xl font-bold text-gray-900 border-b-2 border-gray-200 py-2"
                />
              </View>

              <View className="mb-8">
                <Text className="text-sm font-medium text-gray-700 mb-3">Méthode de paiement</Text>
                <View className="flex-row justify-between">
                  {[
                    { id: 'mobile', label: 'Mobile', icon: Smartphone },
                    { id: 'cash', label: 'Espèces', icon: Banknote },
                    { id: 'bank', label: 'Virement', icon: CreditCard },
                  ].map((method) => {
                    const Icon = method.icon;
                    const active = paymentMethod === method.id;
                    return (
                      <TouchableOpacity
                        key={method.id}
                        onPress={() => setPaymentMethod(method.id as any)}
                        className={`flex-1 items-center justify-center p-3 rounded-xl border-2 mx-1 ${active ? 'border-primary bg-blue-50' : 'border-gray-100 bg-white'}`}
                      >
                        <Icon size={24} color={active ? '#1E3A8A' : '#9CA3AF'} className="mb-1" />
                        <Text className={`text-[10px] font-bold ${active ? 'text-primary' : 'text-gray-500'}`}>{method.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                onPress={handleConfirm}
                disabled={isProcessing}
                className="bg-primary py-4 rounded-xl shadow-lg shadow-blue-500/30 items-center"
              >
                <Text className="text-white font-bold text-lg">
                  {isProcessing ? 'Traitement...' : 'Confirmer le paiement'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </MotiView>
      </View>
    </Modal>
  );
}