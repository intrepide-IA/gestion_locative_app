import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react-native';

import { Bouton, BoutonRetour, Carte, Champ, EnTete } from '../components/ui/kit';
import { Text } from '../components/ui/Text';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '../domain/chiffrementSauvegarde';
import { messageErreur } from '../domain/erreurs';
import { confirmerProprietaireTelephone } from '../security/biometrie';
import { exporterPourRecuperation } from '../services/sauvegarde';
import { colors } from '../theme/colors';

type Etape = 'explication' | 'mot_de_passe' | 'termine';

/**
 * Code PIN oublié, après le blocage de 3 h : les données étant seulement sur ce téléphone, on ne les bloque pas.
 * La personne prouve que le téléphone est le sien (son verrouillage d'écran), choisit un mot de passe,
 * et chaque maison est extraite dans une sauvegarde chiffrée, à restaurer après réinstallation.
 */
export function RecuperationScreen({ onRetour }: { onRetour: () => void }) {
  const [etape, setEtape] = useState<Etape>('explication');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [progression, setProgression] = useState('');
  const [fichiers, setFichiers] = useState(0);

  const confirmerTelephone = async () => {
    setErreur('');
    setEnCours(true);
    try {
      const r = await confirmerProprietaireTelephone();
      if (r === 'ok') setEtape('mot_de_passe');
      else if (r === 'aucun_verrou')
        setErreur(
          'Ce téléphone n’a pas de verrouillage d’écran. Ajoutez un code ou un schéma dans les réglages du téléphone (Sécurité → Verrouillage de l’écran), puis revenez ici.'
        );
      else setErreur('Confirmation annulée ou refusée. Réessayez avec le code, le schéma ou l’empreinte du téléphone.');
    } finally {
      setEnCours(false);
    }
  };

  const extraire = async () => {
    if (mdp.length < LONGUEUR_MIN_MOT_DE_PASSE) return setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`);
    if (mdp !== confirmation) return setErreur('Les deux mots de passe sont différents.');
    setErreur('');
    setEnCours(true);
    try {
      const n = await exporterPourRecuperation(mdp, (nom, rang, total) =>
        setProgression(total > 1 ? `Extraction de « ${nom} » (${rang}/${total})…` : `Extraction de vos données…`)
      );
      setFichiers(n);
      setEtape('termine');
    } catch (error) {
      setErreur(messageErreur(error, error instanceof Error ? error.message : 'Extraction impossible.'));
    } finally {
      setEnCours(false);
      setProgression('');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete titre="Code oublié" sousTitre="Récupérer vos données sans le code PIN" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        {etape === 'explication' ? (
          <Carte className="gap-3">
            <View className="flex-row items-center gap-2">
              <ShieldCheck size={20} color={colors.primary} />
              <Text className="text-lg font-semibold text-ink">Vos données ne seront pas perdues</Text>
            </View>
            <Text className="text-muted">
              Vos données sont gardées uniquement sur ce téléphone. Comme le code PIN est oublié, Onílé va les extraire dans un
              fichier de sauvegarde protégé par un nouveau mot de passe.
            </Text>
            <Text className="text-ink font-medium">Comment ça se passe :</Text>
            <Text className="text-muted">1. Vous confirmez que ce téléphone est le vôtre avec son code, son schéma ou votre empreinte.</Text>
            <Text className="text-muted">2. Vous choisissez un mot de passe pour la sauvegarde.</Text>
            <Text className="text-muted">3. Vous envoyez le fichier hors du téléphone (WhatsApp à vous-même, Google Drive, e-mail).</Text>
            <Text className="text-muted">4. Vous désinstallez puis réinstallez Onílé, et restaurez la sauvegarde.</Text>
            {erreur ? <Text className="text-danger">{erreur}</Text> : null}
            <Bouton titre="Confirmer avec le verrouillage du téléphone" onPress={confirmerTelephone} chargement={enCours} />
          </Carte>
        ) : null}

        {etape === 'mot_de_passe' ? (
          <Carte className="gap-3">
            <View className="flex-row items-center gap-2">
              <KeyRound size={20} color={colors.primary} />
              <Text className="text-lg font-semibold text-ink">Mot de passe de la sauvegarde</Text>
            </View>
            <Text className="text-muted">Il vous sera demandé pour restaurer vos données. Notez-le bien : sans lui, la sauvegarde ne peut pas être ouverte.</Text>
            <Champ libelle="Mot de passe" value={mdp} onChangeText={setMdp} secureTextEntry autoCapitalize="none" />
            <Champ libelle="Confirmer le mot de passe" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" />
            {progression ? <Text className="text-primary font-medium">{progression}</Text> : null}
            {erreur ? <Text className="text-danger">{erreur}</Text> : null}
            <Bouton titre="Extraire mes données" onPress={extraire} chargement={enCours} />
          </Carte>
        ) : null}

        {etape === 'termine' ? (
          <Carte className="gap-3">
            <View className="flex-row items-center gap-2">
              <CheckCircle2 size={20} color={colors.secondary} />
              <Text className="text-lg font-semibold text-ink">Données extraites</Text>
            </View>
            <Text className="text-muted">
              {fichiers > 1 ? `${fichiers} fichiers de sauvegarde ont été créés (un par maison).` : 'Le fichier de sauvegarde a été créé.'}
            </Text>
            <Text className="text-ink font-medium">Avant de désinstaller, vérifiez que le fichier est bien arrivé hors du téléphone.</Text>
            <Text className="text-muted">1. Désinstallez Onílé.</Text>
            <Text className="text-muted">2. Réinstallez-le depuis le site et créez un nouveau code PIN.</Text>
            <Text className="text-muted">3. Paramètres → Sauvegarde → Restaurer une sauvegarde, avec le mot de passe choisi.</Text>
            <Bouton titre="Envoyer à nouveau le fichier" variante="secondaire" onPress={extraire} chargement={enCours} />
          </Carte>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
