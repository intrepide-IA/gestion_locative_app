import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, MessageCircle, Share2, X } from 'lucide-react-native';

import { informer } from '../ui/confirmer';
import { Bouton } from '../ui/kit';
import { Text } from '../ui/Text';
import { applicationsWhatsApp, envoyerDocumentWhatsApp, numeroWhatsAppDocument, partagerDocument, type DocumentPdf } from '../../documents';
import { ecrirePreferences, lirePreferences } from '../../services/preferences';
import { messageErreur } from '../../domain/erreurs';
import { colors } from '../../theme/colors';
import { Cible, useVisiteSi } from '../visite/Visite';
import { VISITES } from '../visite/visites';
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
  const [envoiWhatsApp, setEnvoiWhatsApp] = useState(false);
  // Message qui accompagne le document : prérédigé, modifiable avant l'envoi.
  const [message, setMessage] = useState('');
  // WhatsApp ou WhatsApp Business : choix retenu sur l'appareil (Business par défaut s'il est installé).
  const [applis] = useState(applicationsWhatsApp);
  const [appli, setAppli] = useState<string | null>(null);
  useEffect(() => {
    lirePreferences().then((p) => {
      const choisie = typeof p['whatsapp.application'] === 'string' ? (p['whatsapp.application'] as string) : null;
      setAppli(choisie && applis.includes(choisie) ? choisie : (applis[0] ?? null));
    });
  }, [applis]);
  const choisirAppli = (a: string) => {
    setAppli(a);
    void lirePreferences().then((p) => ecrirePreferences({ ...p, 'whatsapp.application': a }));
  };
  const insets = useSafeAreaInsets();

  const ouvrir = useCallback<Ouvrir>((charger, action) => {
    setEtat({ doc: null, action });
    charger().then(
      (doc) => {
        setMessage(doc.whatsapp?.message ?? '');
        setEtat({ doc, action });
      },
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
  useVisiteSi('apercu', VISITES.apercu, !!etat?.doc);
  const numero = etat?.doc ? numeroWhatsAppDocument(etat.doc) : null;
  const envoyerWhatsApp = async () => {
    if (!etat?.doc) return;
    setEnvoiWhatsApp(true);
    try {
      // Copié aussi : si WhatsApp n'affiche pas la légende avec le PDF, il suffit de coller le message.
      await Clipboard.setStringAsync(message).catch(() => undefined);
      const resultat = await envoyerDocumentWhatsApp(etat.doc, message, appli);
      if (resultat === 'texte') {
        informer('Message préparé', 'WhatsApp n’a pas pu recevoir le PDF directement : le message est ouvert. Joignez le PDF avec « Partager (PDF) ».');
      }
    } catch (error) {
      informer('Envoi impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
    } finally {
      setEnvoiWhatsApp(false);
    }
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
                numero ? (
                  <>
                    <Cible id="apercu.message">
                    <View className="bg-white border border-border rounded-xl px-3 pt-2 pb-1">
                      <View className="flex-row items-center">
                        <Text className="flex-1 text-xs font-bold text-muted uppercase tracking-wider">Message envoyé avec le document</Text>
                        <Pressable
                          onPress={() =>
                            Clipboard.setStringAsync(message).then(
                              () => informer('Message copié', 'Vous pouvez le coller dans n’importe quelle discussion.'),
                              () => undefined
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel="Copier le message"
                          hitSlop={8}
                          className="flex-row items-center"
                        >
                          <Copy size={14} color={colors.primary} />
                          <Text className="text-primary text-xs font-semibold ml-1">Copier</Text>
                        </Pressable>
                      </View>
                      <TextInput
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        accessibilityLabel="Message WhatsApp, modifiable"
                        style={{ maxHeight: 120, minHeight: 64, color: colors.ink, fontSize: 14, paddingVertical: 6, textAlignVertical: 'top' }}
                      />
                    </View>
                    </Cible>
                    {applis.length > 1 ? (
                      <View className="flex-row items-center gap-2">
                        <Text className="text-xs text-muted">Envoyer avec :</Text>
                        {applis.map((a) => (
                          <Pressable
                            key={a}
                            onPress={() => choisirAppli(a)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: appli === a }}
                            className={`px-3 py-1.5 rounded-full border ${appli === a ? 'bg-primary border-primary' : 'bg-white border-border'}`}
                          >
                            <Text className={`text-xs font-semibold ${appli === a ? 'text-white' : 'text-ink'}`}>
                              {a === 'com.whatsapp.w4b' ? 'WhatsApp Business' : 'WhatsApp'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <Cible id="apercu.whatsapp">
                    <Bouton
                      titre={`Envoyer sur WhatsApp (+${numero})`}
                      icone={<MessageCircle size={18} color={colors.white} />}
                      onPress={envoyerWhatsApp}
                      chargement={envoiWhatsApp}
                      desactive={!etat?.doc}
                    />
                    </Cible>
                    <Text className="text-muted text-xs text-center">
                      Le PDF et ce message partent dans la discussion de ce numéro, même s’il n’est pas dans vos contacts. Le message est aussi
                      copié : collez-le si WhatsApp ne l’affiche pas.
                    </Text>
                  </>
                ) : (
                  <Text className="text-muted text-xs text-center">
                    Ajoutez le numéro WhatsApp du locataire sur sa fiche pour lui écrire directement.
                  </Text>
                )
              ) : null}
              <Cible id="apercu.partager">
              <Bouton
                titre="Partager (PDF)"
                variante={etat?.action || numero ? 'secondaire' : 'action'}
                icone={<Share2 size={18} color={etat?.action || numero ? colors.primary : colors.ink} />}
                onPress={partager}
                chargement={partage}
                desactive={!etat?.doc}
              />
              </Cible>
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
