import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Share2, X } from 'lucide-react-native';

import { informer } from '../ui/confirmer';
import { Bouton } from '../ui/kit';
import { Text } from '../ui/Text';
import { partagerDocument, type DocumentPdf } from '../../documents';
import { messageErreur } from '../../domain/erreurs';
import { lienWhatsApp } from '../../domain/whatsapp';
import { colors } from '../../theme/colors';
import { VueHtml } from './VueHtml';

export interface ActionApercu {
  titre: string;
  /** Appelée après fermeture de l'aperçu (ex. ouvrir la signature). */
  onPress: () => void;
}

type Ouvrir = (charger: () => Promise<DocumentPdf>, action?: ActionApercu) => void;

const Contexte = createContext<Ouvrir | null>(null);

/**
 * Aperçu plein écran de tout document avant partage (reçus, factures, contrat, état des lieux).
 * Fenêtre modale ouverte au-dessus de tout, y compris d'une feuille déjà ouverte.
 */
export function FournisseurApercu({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<{ doc: DocumentPdf | null; action?: ActionApercu } | null>(null);
  const [partage, setPartage] = useState(false);
  const insets = useSafeAreaInsets();

  const ouvrir = useCallback<Ouvrir>((charger, action) => {
    setEtat({ doc: null, action });
    charger().then(
      (doc) => setEtat({ doc, action }),
      (error: unknown) => {
        setEtat(null);
        informer(
          'Document indisponible',
          messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.')
        );
      }
    );
  }, []);

  const fermer = () => setEtat(null);
  const partager = async () => {
    if (!etat?.doc) return;
    setPartage(true);
    try {
      await partagerDocument(etat.doc);
    } catch (error) {
      informer('Partage impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
    } finally {
      setPartage(false);
    }
  };

  const whatsapp = etat?.doc?.whatsapp;
  const lien = whatsapp ? lienWhatsApp(whatsapp.telephone, whatsapp.message) : null;
  const ouvrirWhatsApp = () => {
    if (!lien) return;
    Linking.openURL(lien).catch(() => informer('WhatsApp indisponible', 'Impossible d’ouvrir WhatsApp sur cet appareil.'));
  };

  return (
    <Contexte.Provider value={ouvrir}>
      {children}
      {/* Créée à l'ouverture seulement : elle passe ainsi au-dessus d'une feuille déjà ouverte (Android et web). */}
      {etat !== null ? (
        <Modal visible animationType="slide" onRequestClose={fermer} statusBarTranslucent navigationBarTranslucent>
          <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <View className="flex-row items-center px-4 py-3">
              <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={1}>
                {etat?.doc?.titre ?? 'Préparation du document…'}
              </Text>
              <Pressable
                onPress={fermer}
                accessibilityRole="button"
                accessibilityLabel="Fermer l’aperçu"
                className="w-10 h-10 rounded-full bg-white border border-border items-center justify-center"
              >
                <X size={20} color={colors.ink} />
              </Pressable>
            </View>
            <View className="flex-1 mx-3 rounded-2xl overflow-hidden border border-border bg-white">
              {etat?.doc ? (
                <VueHtml html={etat.doc.html} />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator color={colors.primary} />
                </View>
              )}
            </View>
            <View className="px-4 pt-3 pb-2 gap-2">
              {etat?.action ? (
                <Bouton
                  titre={etat.action.titre}
                  onPress={() => {
                    const a = etat.action!;
                    fermer();
                    a.onPress();
                  }}
                />
              ) : null}
              {whatsapp ? (
                lien ? (
                  <>
                    <Bouton
                      titre="Écrire sur WhatsApp"
                      variante="secondaire"
                      icone={<MessageCircle size={18} color={colors.primary} />}
                      onPress={ouvrirWhatsApp}
                    />
                    <Text className="text-muted text-xs text-center">
                      Le message s’ouvre déjà rédigé, même si le numéro n’est pas dans vos contacts. Revenez ensuite sur « Partager (PDF) » :
                      la discussion sera en haut de la liste WhatsApp.
                    </Text>
                  </>
                ) : (
                  <Text className="text-muted text-xs text-center">
                    Ajoutez le numéro WhatsApp du locataire sur sa fiche pour lui écrire directement.
                  </Text>
                )
              ) : null}
              <Bouton
                titre="Partager (PDF)"
                variante={etat?.action ? 'secondaire' : 'action'}
                icone={<Share2 size={18} color={etat?.action ? colors.primary : colors.ink} />}
                onPress={partager}
                chargement={partage}
                desactive={!etat?.doc}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </Contexte.Provider>
  );
}

/** `ouvrirApercu(() => preparerRecu(id))` affiche le document, avec le bouton « Partager ». */
export function useApercu(): Ouvrir {
  const ouvrir = useContext(Contexte);
  return useMemo(() => ouvrir ?? (() => informer('Aperçu indisponible', 'Relancez l’application.')), [ouvrir]);
}
