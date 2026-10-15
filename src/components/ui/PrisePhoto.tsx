import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { Text } from './Text';
import { Bouton } from './kit';
import { recadrerImage, zonePhoto, type Zone } from '../../services/images';
import { colors } from '../../theme/colors';

/**
 * Appareil photo intégré (sans passer par l'application photo d'Android) avec un cadre au format
 * carte d'identité. Renvoie une image JPEG réduite « data: ».
 */
export function PrisePhoto({ ouverte, onFermer, onPhoto, consigne }: { ouverte: boolean; onFermer: () => void; onPhoto: (image: string) => void; consigne: string }) {
  const [permission, demander] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const insets = useSafeAreaInsets();
  // Positions mesurées à l'écran : la photo est recadrée sur le rectangle jaune.
  const [ecran, setEcran] = useState({ largeur: 0, hauteur: 0 });
  const [cadre, setCadre] = useState<Zone | null>(null);

  const prendre = async () => {
    if (!camera.current || enCours) return;
    setEnCours(true);
    setErreur('');
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (!photo?.uri || !cadre) throw new Error('Photo non prise.');
      const zone = zonePhoto(ecran, cadre, { largeur: photo.width, hauteur: photo.height });
      onPhoto(await recadrerImage(photo.uri, zone, { largeur: 1400, format: 'jpeg' }));
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Photo impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal visible={ouverte} animationType="slide" onRequestClose={onFermer} statusBarTranslucent navigationBarTranslucent>
      {ouverte ? (
        <View style={styles.fond} onLayout={(e) => setEcran({ largeur: e.nativeEvent.layout.width, hauteur: e.nativeEvent.layout.height })}>
          {!permission ? (
            <ActivityIndicator color={colors.white} />
          ) : !permission.granted ? (
            <View style={styles.permission}>
              <Text style={styles.texte}>Onílé a besoin de l’appareil photo pour photographier la pièce d’identité.</Text>
              <Bouton titre="Autoriser l’appareil photo" onPress={() => void demander()} />
              <Bouton titre="Annuler" variante="discret" onPress={onFermer} />
            </View>
          ) : (
            <>
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
              <View pointerEvents="none" style={styles.calque}>
                <View
                  style={styles.cadre}
                  onLayout={(e) => {
                    const { x, y, width, height } = e.nativeEvent.layout;
                    setCadre({ x, y, largeur: width, hauteur: height });
                  }}
                />
                <Text style={[styles.texte, { marginTop: 16 }]}>{consigne}</Text>
                {erreur ? <Text style={[styles.texte, { color: colors.accent, marginTop: 8 }]}>{erreur}</Text> : null}
              </View>
              <Pressable
                onPress={onFermer}
                accessibilityRole="button"
                accessibilityLabel="Fermer l’appareil photo"
                style={[styles.fermer, { top: insets.top + 12 }]}
              >
                <X size={22} color={colors.white} />
              </Pressable>
              <View style={[styles.bas, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable onPress={prendre} accessibilityRole="button" accessibilityLabel="Prendre la photo" style={styles.declencheur}>
                  {enCours ? <ActivityIndicator color={colors.primary} /> : <View style={styles.declencheurInterieur} />}
                </Pressable>
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
  texte: { color: colors.white, textAlign: 'center', fontSize: 15, fontFamily: 'Inter' },
  calque: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  // Format carte bancaire / CNI (85,6 × 54 mm).
  cadre: { width: '100%', aspectRatio: 1.586, borderRadius: 16, borderWidth: 3, borderColor: colors.accent },
  fermer: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bas: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  declencheur: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  declencheurInterieur: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
});
