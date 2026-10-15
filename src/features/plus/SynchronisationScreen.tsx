import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudDownload, CloudUpload, LogOut, UserRound } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

import { confirmer, informer } from '../../components/ui/confirmer';
import { Bouton, BoutonRetour, Carte, Champ, Chargement, EnTete, LigneInfo } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { messageErreur } from '../../domain/erreurs';
import { formatDate } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { restaurer } from '../../services/sauvegarde';
import {
  compteConnecte,
  connecter,
  creerCompte,
  deconnecter,
  derniereSynchronisation,
  listerSauvegardesCloud,
  recupererSauvegardeCloud,
  synchronisationConfiguree,
  synchroniserMaintenant,
  type SauvegardeCloud,
} from '../../services/synchronisation';
import { colors } from '../../theme/colors';

const CLE_MOT_DE_PASSE = 'onile_mdp_synchronisation';
const erreurTexte = (error: unknown) => messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.');

interface Etat {
  email: string | null;
  derniere: string | null;
  sauvegardes: SauvegardeCloud[];
  mdpMemorise: string | null;
}

const lireEtat = async (): Promise<Etat> => {
  if (!synchronisationConfiguree()) return { email: null, derniere: null, sauvegardes: [], mdpMemorise: null };
  const email = await compteConnecte();
  const [derniere, sauvegardes, mdpMemorise] = await Promise.all([
    derniereSynchronisation(),
    email ? listerSauvegardesCloud().catch(() => []) : Promise.resolve([]),
    SecureStore.getItemAsync(CLE_MOT_DE_PASSE).catch(() => null),
  ]);
  return { email, derniere, sauvegardes, mdpMemorise };
};

/**
 * Synchronisation : compte personnel (e-mail), envoi des données chiffrées dans le cloud,
 * récupération sur ce téléphone ou un autre.
 */
export function SynchronisationScreen({ onRetour }: { onRetour: () => void }) {
  const lire = useCallback(() => lireEtat(), []);
  const { donnees: e, chargement, rafraichir } = useRessource<Etat | null>(lire, null);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete titre="Synchronisation" sousTitre={e?.email ?? 'Vos données dans votre compte, récupérables partout'} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        {!synchronisationConfiguree() ? (
          <Carte>
            <Text className="text-ink font-semibold">Pas encore disponible</Text>
            <Text className="text-muted mt-1">
              La synchronisation sera active dans une prochaine version de l’application. En attendant, utilisez Sauvegarde et restauration.
            </Text>
          </Carte>
        ) : !e ? (
          chargement ? <Chargement /> : null
        ) : !e.email ? (
          <Connexion onConnecte={rafraichir} />
        ) : (
          <Compte etat={e} onModifie={rafraichir} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Connexion({ onConnecte }: { onConnecte: () => void }) {
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [enCours, setEnCours] = useState<'connexion' | 'creation' | null>(null);
  const [erreur, setErreur] = useState('');

  const lancer = async (action: 'connexion' | 'creation') => {
    setEnCours(action);
    setErreur('');
    try {
      if (action === 'connexion') {
        await connecter(email, mdp);
        onConnecte();
      } else if ((await creerCompte(email, mdp)) === 'confirmation') {
        informer('Confirmez votre e-mail', 'Ouvrez le lien reçu par e-mail, puis revenez ici pour vous connecter.');
      } else {
        onConnecte();
      }
    } catch (error) {
      setErreur(erreurTexte(error));
    } finally {
      setEnCours(null);
    }
  };

  return (
    <Carte className="gap-3">
      <View className="flex-row items-center gap-2">
        <UserRound size={20} color={colors.primary} />
        <Text className="text-lg font-semibold text-ink">Votre compte Onílé</Text>
      </View>
      <Text className="text-muted">
        Un compte par propriétaire. Vos données y sont envoyées chiffrées : personne d’autre, ni même le serveur, ne peut les lire.
      </Text>
      <Champ libelle="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Champ libelle="Mot de passe du compte" value={mdp} onChangeText={setMdp} secureTextEntry autoCapitalize="none" aide="8 caractères au moins." />
      {erreur ? <Text className="text-danger">{erreur}</Text> : null}
      <Bouton titre="Se connecter" onPress={() => lancer('connexion')} chargement={enCours === 'connexion'} desactive={!email || !mdp} />
      <Bouton titre="Créer mon compte" variante="secondaire" onPress={() => lancer('creation')} chargement={enCours === 'creation'} desactive={!email || !mdp} />
    </Carte>
  );
}

function Compte({ etat, onModifie }: { etat: Etat; onModifie: () => void }) {
  const [mdp, setMdp] = useState(etat.mdpMemorise ?? '');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');

  const envoyer = async () => {
    if (mdp.length < 6) return setErreur('Mot de passe de chiffrement : 6 caractères au moins.');
    setEnCours('envoi');
    setErreur('');
    try {
      await synchroniserMaintenant(mdp);
      // Mémorisé dans le coffre sécurisé du téléphone, pour ne pas le ressaisir à chaque fois.
      await SecureStore.setItemAsync(CLE_MOT_DE_PASSE, mdp).catch(() => undefined);
      informer('Synchronisation terminée', 'Vos données sont à l’abri dans votre compte.');
      onModifie();
    } catch (error) {
      setErreur(erreurTexte(error));
    } finally {
      setEnCours(null);
    }
  };

  const recuperer = async (s: SauvegardeCloud) => {
    if (!mdp) return setErreur('Saisissez le mot de passe de chiffrement utilisé lors de cette synchronisation.');
    setEnCours(s.id);
    setErreur('');
    try {
      const { contenu, resume } = await recupererSauvegardeCloud(s.id, mdp);
      const ok = await confirmer(
        'Remplacer les données de ce téléphone ?',
        `Sauvegarde du ${formatDate(s.cree_le.slice(0, 10))} : ${resume.logements} logement(s), ${resume.locataires} locataire(s), ${resume.paiements} paiement(s). Les données actuelles de ce téléphone seront remplacées.`,
        'Récupérer',
        true
      );
      if (!ok) return;
      await restaurer(contenu);
      informer('Données récupérées', 'L’application contient maintenant les données de cette sauvegarde.');
      onModifie();
    } catch (error) {
      setErreur(erreurTexte(error));
    } finally {
      setEnCours(null);
    }
  };

  const sortir = async () => {
    if (!(await confirmer('Se déconnecter ?', 'Vos données restent sur ce téléphone et dans votre compte.', 'Se déconnecter'))) return;
    await deconnecter();
    await SecureStore.deleteItemAsync(CLE_MOT_DE_PASSE).catch(() => undefined);
    onModifie();
  };

  return (
    <>
      <Carte className="gap-3">
        <View className="flex-row items-center gap-2">
          <CloudUpload size={20} color={colors.primary} />
          <Text className="text-lg font-semibold text-ink">Envoyer mes données</Text>
        </View>
        <LigneInfo libelle="Compte" valeur={etat.email ?? ''} />
        <LigneInfo
          libelle="Dernière synchronisation"
          valeur={etat.derniere ? `${formatDate(etat.derniere.slice(0, 10))} à ${etat.derniere.slice(11, 16)}` : 'Jamais'}
        />
        <Champ
          libelle="Mot de passe de chiffrement"
          value={mdp}
          onChangeText={setMdp}
          secureTextEntry
          autoCapitalize="none"
          aide="Il chiffre vos données avant l’envoi. Notez-le : sans lui, impossible de les récupérer sur un autre téléphone."
        />
        {erreur ? <Text className="text-danger">{erreur}</Text> : null}
        <Bouton titre="Synchroniser maintenant" onPress={envoyer} chargement={enCours === 'envoi'} />
      </Carte>

      <Carte className="gap-1">
        <View className="flex-row items-center gap-2 mb-1">
          <CloudDownload size={20} color={colors.primary} />
          <Text className="text-lg font-semibold text-ink">Récupérer</Text>
        </View>
        {etat.sauvegardes.length === 0 ? (
          <Text className="text-muted">Aucune donnée dans votre compte pour l’instant.</Text>
        ) : (
          etat.sauvegardes.map((s) => (
            <View key={s.id} className="flex-row items-center py-2.5 border-b border-border">
              <View className="flex-1">
                <Text className="text-ink font-medium">
                  {formatDate(s.cree_le.slice(0, 10))} à {s.cree_le.slice(11, 16)}
                </Text>
                <Text className="text-xs text-muted">
                  {s.appareil ?? 'Téléphone'} · v{s.version_app ?? '?'} · {Math.max(1, Math.round(s.taille / 1024))} Ko
                </Text>
              </View>
              <Bouton titre="Récupérer" variante="discret" onPress={() => recuperer(s)} chargement={enCours === s.id} />
            </View>
          ))
        )}
      </Carte>

      <Bouton titre="Se déconnecter" variante="discret" icone={<LogOut size={18} color={colors.primary} />} onPress={sortir} />
    </>
  );
}
