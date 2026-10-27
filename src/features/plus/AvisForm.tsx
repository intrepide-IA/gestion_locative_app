import { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Star } from 'lucide-react-native';

import { informer } from '../../components/ui/confirmer';
import { Bouton, Champ, Choix } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { APP_VERSION, EMAIL_CONTACT } from '../../constants';
import { colors } from '../../theme/colors';

type Sujet = 'avis' | 'suggestion' | 'probleme';

const SUJETS: Record<Sujet, string> = { avis: 'Mon avis', suggestion: 'Une idée', probleme: 'Un problème' };

/**
 * Avis, suggestions et problèmes : envoyés par e-mail à l'équipe Onílé (application de messagerie du téléphone).
 * Rien ne part sans que l'utilisateur appuie lui-même sur « Envoyer » dans sa messagerie.
 */
export function AvisForm({ nom, telephone, onEnvoye }: { nom?: string; telephone?: string | null; onEnvoye: () => void }) {
  const [sujet, setSujet] = useState<Sujet>('avis');
  const [note, setNote] = useState(0);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  const corps = () =>
    [
      message.trim(),
      '',
      '—',
      sujet === 'avis' && note ? `Note : ${'★'.repeat(note)}${'☆'.repeat(5 - note)} (${note}/5)` : '',
      nom ? `De : ${nom}${telephone ? ` (${telephone})` : ''}` : '',
      `Onílé ${APP_VERSION} · ${Platform.OS === 'android' ? `Android ${Platform.Version}` : Platform.OS}`,
    ]
      .filter((l, i) => l !== '' || i === 1)
      .join('\n');

  const envoyer = async () => {
    if (!message.trim()) return setErreur('Écrivez votre message.');
    if (sujet === 'avis' && !note) return setErreur('Choisissez une note de 1 à 5 étoiles.');
    setErreur('');
    const objet = `Onílé — ${SUJETS[sujet]}${sujet === 'avis' && note ? ` (${note}/5)` : ''}`;
    const texte = corps();
    const lien = `mailto:${EMAIL_CONTACT}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(texte)}`;
    try {
      await Linking.openURL(lien);
      onEnvoye();
    } catch {
      // Pas d'application de messagerie : on copie le message pour l'envoyer autrement.
      await Clipboard.setStringAsync(`${objet}\n\n${texte}`).catch(() => undefined);
      informer('Aucune messagerie trouvée', `Votre message est copié. Collez-le dans un e-mail à ${EMAIL_CONTACT}.`);
    }
  };

  return (
    <>
      <Text className="text-muted">
        Une idée pour améliorer Onílé, un souci, ou simplement votre avis ? Écrivez-nous : chaque message est lu. Il part par e-mail à{' '}
        <Text className="font-semibold text-ink">{EMAIL_CONTACT}</Text>.
      </Text>
      <Choix
        libelle="C’est à propos de"
        options={(Object.keys(SUJETS) as Sujet[]).map((s) => ({ valeur: s, libelle: SUJETS[s] }))}
        valeur={sujet}
        onChange={setSujet}
      />
      {sujet === 'avis' ? (
        <View>
          <Text className="text-sm font-semibold text-ink mb-2">Votre note</Text>
          <View className="flex-row gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setNote(n)} accessibilityRole="button" accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`} hitSlop={6}>
                <Star size={34} color={colors.accent} fill={n <= note ? colors.accent : 'transparent'} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Champ
        libelle={sujet === 'probleme' ? 'Que s’est-il passé ?' : sujet === 'suggestion' ? 'Votre idée' : 'Votre message'}
        obligatoire
        value={message}
        onChangeText={setMessage}
        multiline
        placeholder={
          sujet === 'probleme'
            ? 'Ex. : quand je touche « Encaisser », l’application se ferme.'
            : sujet === 'suggestion'
              ? 'Ex. : pouvoir envoyer un rappel à tous les locataires en retard.'
              : 'Ce que vous aimez, ce qui vous gêne…'
        }
      />
      <Text className="text-muted text-xs">Votre nom, la version de l’application et celle d’Android sont ajoutés pour nous aider à vous répondre.</Text>
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Envoyer par e-mail" onPress={envoyer} />
    </>
  );
}
