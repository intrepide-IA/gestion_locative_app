import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';

import { Text } from './Text';
import { Bouton } from './kit';
import { colors } from '../../theme/colors';

/**
 * Appareil photo pour un document de plusieurs pages (contrat papier) : une photo par page,
 * puis « Terminer ». Renvoie les fichiers photo dans l'ordre des pages.
 */
export function PhotosDocument({ ouverte, onFermer, onTermine }: { ouverte: boolean; onFermer: () => void; onTermine: (uris: string[]) => void }) {
  const [permission, demander] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const insets = useSafeAreaInsets();

  const fermer = () => {
    setPages([]);
    onFermer();
  };

  const prendre = async () => {
    if (!camera.current || enCours) return;
    setEnCours(true);
    setErreur('');
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (!photo?.uri) throw new Error('Photo non prise.');
      setPages((p) => [...p, photo.uri]);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Photo impossible.');
    } finally {
      setEnCours(false);
    }
  };

  const terminer = () => {
    const liste = pages;
    setPages([]);
    onTermine(liste);
  };

  return (
    <Modal visible={ouverte} animationType="slide" onRequestClose={fermer} statusBarTranslucent navigationBarTranslucent>
      {ouverte ? (
        <View style={styles.fond}>
          {!permission ? (
            <ActivityIndicator color={colors.white} />
          ) : !permission.granted ? (
            <View style={styles.permission}>
              <Text style={styles.texte}>Onílé a besoin de l’appareil photo pour photographier votre contrat.</Text>
              <Bouton titre="Autoriser l’appareil photo" onPress={() => void demander()} />
              <Bouton titre="Annuler" variante="discret" onPress={fermer} />
            </View>
          ) : (
            <>
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" autofocus="on" />
              <View pointerEvents="none" style={[styles.haut, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.titre}>{`Page ${pages.length + 1}`}</Text>
                <Text style={styles.texte}>
                  Posez la page à plat, bien éclairée, sans ombre. Tenez le téléphone au-dessus, toute la page dans l’écran.
                </Text>
                {erreur ? <Text style={[styles.texte, { color: colors.accent, marginTop: 6 }]}>{erreur}</Text> : null}
              </View>
              <Pressable onPress={fermer} accessibilityRole="button" accessibilityLabel="Annuler" style={[styles.fermer, { top: insets.top + 12 }]}>
                <X size={22} color={colors.white} />
              </Pressable>
              <View style={[styles.bas, { paddingBottom: insets.bottom + 24 }]}>
                <View style={styles.cote}>{pages.length ? <Text style={styles.compte}>{pages.length} page(s)</Text> : null}</View>
                <Pressable
                  onPress={prendre}
                  accessibilityRole="button"
                  accessibilityLabel={`Photographier la page ${pages.length + 1}`}
                  style={styles.declencheur}
                >
                  {enCours ? <ActivityIndicator color={colors.primary} /> : <View style={styles.declencheurInterieur} />}
                </Pressable>
                <View style={styles.cote}>
                  {pages.length ? (
                    <Pressable onPress={terminer} accessibilityRole="button" accessibilityLabel="Terminer et lire le contrat" style={styles.terminer}>
                      <Check size={20} color={colors.white} />
                      <Text style={styles.terminerTexte}>Terminer</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </>
          )}
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  permission: { padding: 24, gap: 14 },
  haut: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 64, backgroundColor: 'rgba(0,0,0,0.45)', paddingBottom: 14 },
  titre: { color: colors.white, textAlign: 'center', fontSize: 18, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  texte: { color: colors.white, textAlign: 'center', fontSize: 14, fontFamily: 'Inter' },
  fermer: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bas: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  cote: { width: 110, alignItems: 'center' },
  compte: {
    color: colors.white,
    fontSize: 14,
    fontFamily: 'Inter',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  declencheur: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  declencheurInterieur: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
  terminer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22 },
  terminerTexte: { color: colors.white, fontWeight: '700', fontFamily: 'Inter' },
});
