import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, BellRing, ChevronRight, FileText, Cloud, Database, Download, Lock, PenLine, Shield, Zap } from 'lucide-react-native';
import { nouvelleVersion } from '../../services/miseAJour';
import { useNavigation } from '@react-navigation/native';

import { ApercuSignature } from '../../components/ui/ApercuSignature';
import { Feuille } from '../../components/ui/Feuille';
import { PadSignature } from '../../components/ui/PadSignature';
import { informer } from '../../components/ui/confirmer';
import { Bouton, BoutonRetour, Champ, EnTete } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { APP_VERSION } from '../../constants';
import { getDatabase } from '../../db/client';
import { messageErreur } from '../../domain/erreurs';
import { initiales } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { definirSignature, enregistrerProprietaire, getProprietaire, type Proprietaire } from '../../repositories/proprietaireRepository';
import { importerImage } from '../../services/images';
import { formatDelay } from '../../security/format';
import { definirNotificationsActives, notificationsActives } from '../../repositories/rappelsRepository';
import { demanderPermissionNotifications, envoyerNotificationTest, etatRappels, synchroniserNotifications } from '../../services/notifications';
import { pinService } from '../../security/native';
import { PIN_FORMAT_MESSAGES, PIN_MAX_LENGTH, PIN_MIN_LENGTH, validateNewPin } from '../../security/pin';
import { colors } from '../../theme/colors';

const lireMiseAJour = () => nouvelleVersion();
const lireEtatRappels = () => synchroniserNotifications().then(etatRappels);

export function PlusScreen({ onVerrouiller, onRetour }: { onVerrouiller: () => void; onRetour: () => void }) {
  const { donnees: proprietaire, rafraichir } = useRessource(getProprietaire, null);
  const [profil, setProfil] = useState(false);
  const [pin, setPin] = useState(false);
  const [signature, setSignature] = useState(false);
  const navigation = useNavigation<{ navigate: (ecran: string) => void }>();
  const notifs = useRessource(notificationsActives, true);
  const rappels = useRessource(lireEtatRappels, null);

  const testerNotification = async () => {
    try {
      const r = await envoyerNotificationTest();
      informer(
        r === 'programmee' ? 'Notification envoyée dans 10 secondes' : 'Notifications refusées',
        r === 'programmee'
          ? 'Vous pouvez quitter l’application : la notification doit s’afficher en haut de l’écran.'
          : 'Autorisez les notifications d’Onílé dans les réglages Android (Applications → Onílé → Notifications).'
      );
    } catch (error) {
      informer('Test impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
    }
  };
  const maj = useRessource(lireMiseAJour, null);

  const basculerNotifications = async (actives: boolean) => {
    try {
      if (actives && !(await demanderPermissionNotifications())) {
        informer(
          'Autorisation refusée',
          'Autorisez les notifications d’Onílé dans les réglages Android pour recevoir les rappels de loyers et les alertes d’électricité.'
        );
        return;
      }
      await definirNotificationsActives(await getDatabase(), actives);
      notifs.rafraichir();
      await synchroniserNotifications();
    } catch (error) {
      informer('Action impossible', messageErreur(error));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete titre="Paramètres" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 20 }}>
        <Pressable
          onPress={() => setProfil(true)}
          accessibilityRole="button"
          className="bg-white rounded-2xl border border-border p-4 flex-row items-center active:bg-background"
        >
          <View className="w-14 h-14 rounded-full bg-primary items-center justify-center">
            <Text className="text-white text-lg font-bold">{proprietaire ? initiales(proprietaire.nom) : '—'}</Text>
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-lg font-semibold text-ink">{proprietaire?.nom ?? 'Propriétaire'}</Text>
            <Text className="text-muted">{proprietaire?.telephone ?? 'Téléphone non renseigné'}</Text>
            <Text className="text-primary text-sm font-medium mt-0.5">Modifier le profil</Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>

        {maj.donnees ? (
          <Pressable
            onPress={() => Linking.openURL(maj.donnees!.lien)}
            accessibilityRole="button"
            className="bg-accent rounded-2xl p-4 flex-row items-center active:opacity-80"
          >
            <Download size={20} color={colors.ink} />
            <View className="flex-1 ml-3">
              <Text className="font-bold text-ink">Nouvelle version {maj.donnees.version} disponible</Text>
              <Text className="text-ink/80 text-sm">{maj.donnees.notes ?? 'Touchez pour la télécharger, puis installez-la par-dessus.'}</Text>
            </View>
          </Pressable>
        ) : null}

        <Groupe titre="Documents">
          <Ligne
            icone={<PenLine size={18} color={colors.primary} />}
            libelle="Ma signature"
            detail={proprietaire?.signature ? 'Enregistrée' : 'À ajouter'}
            onPress={() => setSignature(true)}
          />
          <Ligne
            icone={<FileText size={18} color={colors.primary} />}
            libelle="Modèle de contrat"
            detail="Modifier / importer"
            onPress={() => navigation.navigate('ModeleContrat')}
            dernier
          />
        </Groupe>

        <Groupe titre="Gestion">
          <Ligne icone={<Zap size={18} color={colors.primary} />} libelle="Électricité prépayée" onPress={() => navigation.navigate('Electricite')} />
          <Ligne
            icone={<Database size={18} color={colors.primary} />}
            libelle="Sauvegarde et restauration"
            onPress={() => navigation.navigate('Sauvegarde')}
          />
          <Ligne
            icone={<Cloud size={18} color={colors.primary} />}
            libelle="Synchronisation (compte)"
            onPress={() => navigation.navigate('Synchronisation')}
            dernier
          />
        </Groupe>

        <Groupe titre="Rappels">
          <View className="flex-row items-center px-4 py-4">
            <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mr-3">
              <Bell size={18} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-base text-ink">Notifications</Text>
              <Text className="text-muted text-xs">Loyers (J-3, jour J, J+3), fins de contrat, électricité, sauvegarde</Text>
            </View>
            <Switch
              value={notifs.donnees}
              onValueChange={basculerNotifications}
              trackColor={{ true: colors.secondary, false: colors.border }}
              thumbColor={colors.white}
              accessibilityLabel="Activer les notifications"
            />
          </View>
          <View className="px-4 pb-3 -mt-1">
            <Text className="text-muted text-xs">
              {!rappels.donnees
                ? ' '
                : !rappels.donnees.autorisees
                  ? 'Notifications non autorisées sur ce téléphone.'
                  : rappels.donnees.programmes === 0
                    ? 'Aucun rappel programmé pour le moment.'
                    : `${rappels.donnees.programmes} rappel(s) programmé(s)${
                        rappels.donnees.prochain
                          ? ` · prochain le ${rappels.donnees.prochain.date.toLocaleDateString('fr-FR')} à ${rappels.donnees.prochain.date
                              .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} : ${rappels.donnees.prochain.titre}`
                          : ''
                      }`}
            </Text>
          </View>
          <Ligne
            icone={<BellRing size={18} color={colors.primary} />}
            libelle="Tester une notification"
            detail="dans 10 s"
            onPress={testerNotification}
            dernier
          />
        </Groupe>

        <Groupe titre="Sécurité">
          <Ligne icone={<Shield size={18} color={colors.primary} />} libelle="Modifier le code PIN" onPress={() => setPin(true)} />
          <Ligne icone={<Lock size={18} color={colors.primary} />} libelle="Verrouiller maintenant" onPress={onVerrouiller} dernier />
        </Groupe>

        <Text className="text-center text-xs text-muted">Onílé v{APP_VERSION} · données stockées et chiffrées sur ce téléphone</Text>
      </ScrollView>

      <Feuille ouverte={profil} onFermer={() => setProfil(false)} titre="Profil du propriétaire">
        <FormProfil
          proprietaire={proprietaire}
          onEnregistre={() => {
            setProfil(false);
            rafraichir();
          }}
        />
      </Feuille>
      <Feuille ouverte={signature} onFermer={() => setSignature(false)} titre="Ma signature">
        <FormSignature
          actuelle={proprietaire?.signature ?? null}
          nom={proprietaire?.nom ?? ''}
          onModifiee={() => {
            setSignature(false);
            rafraichir();
          }}
        />
      </Feuille>
      <Feuille ouverte={pin} onFermer={() => setPin(false)} titre="Changer le code PIN">
        <FormPin onTermine={() => setPin(false)} />
      </Feuille>
    </SafeAreaView>
  );
}

function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <View>
      <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-2 px-1">{titre}</Text>
      <View className="bg-white rounded-2xl border border-border overflow-hidden">{children}</View>
    </View>
  );
}

function Ligne({
  icone,
  libelle,
  detail,
  onPress,
  dernier,
}: {
  icone: ReactNode;
  libelle: string;
  detail?: string;
  onPress: () => void;
  dernier?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center px-4 py-4 active:bg-background ${dernier ? '' : 'border-b border-border'}`}
    >
      <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mr-3">{icone}</View>
      <Text className="flex-1 text-base text-ink">{libelle}</Text>
      {detail ? <Text className="text-muted text-sm mr-2">{detail}</Text> : null}
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

function FormProfil({ proprietaire, onEnregistre }: { proprietaire: Proprietaire | null; onEnregistre: () => void }) {
  const [nom, setNom] = useState(proprietaire?.nom ?? '');
  const [telephone, setTelephone] = useState(proprietaire?.telephone ?? '');
  const [adresse, setAdresse] = useState(proprietaire?.adresse ?? '');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async () => {
    setEnCours(true);
    setErreur('');
    try {
      await enregistrerProprietaire(await getDatabase(), { nom, telephone, adresse });
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Text className="text-muted">Ces informations apparaissent sur vos factures et reçus.</Text>
      <Champ libelle="Nom et prénom(s)" obligatoire value={nom} onChangeText={setNom} />
      <Champ libelle="Téléphone" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" />
      <Champ libelle="Adresse" value={adresse} onChangeText={setAdresse} />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer" onPress={enregistrer} chargement={enCours} />
    </>
  );
}

function FormPin({ onTermine }: { onTermine: () => void }) {
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    const format = validateNewPin(nouveau);
    if (format) return setErreur(PIN_FORMAT_MESSAGES[format]);
    if (nouveau !== confirmation) return setErreur('La confirmation ne correspond pas au nouveau code.');
    if (nouveau === actuel) return setErreur('Le nouveau code doit être différent de l’actuel.');
    setEnCours(true);
    setErreur('');
    try {
      const r = await pinService.changePin(actuel, nouveau);
      if (r.status === 'ok') {
        informer('Code PIN modifié', 'Utilisez désormais votre nouveau code.');
        onTermine();
      } else if (r.status === 'locked') {
        setErreur(`Trop d’essais. Réessayez dans ${formatDelay(r.lockedUntil)}.`);
      } else if (r.status === 'wrong') {
        setErreur(
          r.lockedUntil
            ? `Code actuel incorrect. Saisie bloquée ${formatDelay(r.lockedUntil)}.`
            : `Code actuel incorrect (${r.remainingBeforeLock} essai(s) avant blocage).`
        );
      } else {
        setErreur('Aucun code PIN enregistré.');
      }
    } finally {
      setEnCours(false);
    }
  };

  const chiffres = (v: string) => v.replace(/\D/g, '');
  return (
    <>
      <Text className="text-muted">
        {PIN_MIN_LENGTH} à {PIN_MAX_LENGTH} chiffres, sans suite évidente (1234, 0000…).
      </Text>
      <Champ libelle="Code actuel" value={actuel} onChangeText={(v) => setActuel(chiffres(v))} secureTextEntry keyboardType="number-pad" maxLength={PIN_MAX_LENGTH} />
      <Champ libelle="Nouveau code" value={nouveau} onChangeText={(v) => setNouveau(chiffres(v))} secureTextEntry keyboardType="number-pad" maxLength={PIN_MAX_LENGTH} />
      <Champ
        libelle="Confirmer le nouveau code"
        value={confirmation}
        onChangeText={(v) => setConfirmation(chiffres(v))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={PIN_MAX_LENGTH}
      />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Valider" onPress={valider} chargement={enCours} />
    </>
  );
}

/** Signature du bailleur : importée (photo d'une signature sur papier blanc) ou dessinée sur place. */
function FormSignature({ actuelle, nom, onModifiee }: { actuelle: string | null; nom: string; onModifiee: () => void }) {
  const [dessin, setDessin] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async (image: string | null) => {
    setEnCours(true);
    try {
      await definirSignature(await getDatabase(), image);
      onModifiee();
    } catch (error) {
      informer('Enregistrement impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
      setEnCours(false);
    }
  };

  const importer = async () => {
    try {
      const image = await importerImage({ largeur: 700, format: 'png' });
      if (image) await enregistrer(image);
    } catch (error) {
      informer('Import impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
    }
  };

  if (dessin) return <PadSignature nom={nom} onValider={enregistrer} chargement={enCours} />;

  return (
    <>
      <Text className="text-muted">
        Elle est apposée sur vos contrats de bail, reçus et factures. Pour un contrat, vous pouvez aussi signer sur place au moment de la
        signature.
      </Text>
      {actuelle ? (
        <View className="bg-white rounded-2xl border border-border p-4">
          <ApercuSignature image={actuelle} />
        </View>
      ) : (
        <View className="bg-white rounded-2xl border border-dashed border-border p-6 items-center">
          <Text className="text-muted">Aucune signature enregistrée</Text>
        </View>
      )}
      <Bouton titre="Dessiner ma signature" onPress={() => setDessin(true)} />
      <Bouton titre="Importer une image" variante="secondaire" onPress={importer} chargement={enCours} />
      <Text className="text-muted text-xs">Image conseillée : signature à l’encre noire sur fond blanc ou transparent (PNG).</Text>
      {actuelle ? <Bouton titre="Retirer la signature" variante="danger" onPress={() => enregistrer(null)} /> : null}
    </>
  );
}
