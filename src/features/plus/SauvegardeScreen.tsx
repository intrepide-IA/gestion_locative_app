import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Download, ShieldAlert, Upload } from 'lucide-react-native';

import { confirmer, informer } from '../../components/ui/confirmer';
import { Bouton, BoutonRetour, Carte, Champ, EnTete, LigneInfo } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '../../domain/chiffrementSauvegarde';
import { messageErreur } from '../../domain/erreurs';
import { formatDate } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import type { ResumeSauvegarde } from '../../repositories/sauvegardeRepository';
import { pinService } from '../../security/native';
import { choisirSauvegarde, derniereSauvegarde, exporterEtPartager, preparerRestauration, reinitialiser, restaurer } from '../../services/sauvegarde';
import { colors } from '../../theme/colors';

const lireDerniere = () => derniereSauvegarde();

export function SauvegardeScreen({ onRetour }: { onRetour: () => void }) {
  const derniere = useRessource(lireDerniere, null as string | null);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete
        titre="Sauvegarde"
        sousTitre={derniere.donnees ? `Dernière sauvegarde : ${formatDate(derniere.donnees)}` : 'Aucune sauvegarde réalisée'}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Export onExporte={derniere.rafraichir} />
        <Restauration />
        <Reinitialisation />
      </ScrollView>
    </SafeAreaView>
  );
}

function Export({ onExporte }: { onExporte: () => void }) {
  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const exporter = async () => {
    if (mdp.length < LONGUEUR_MIN_MOT_DE_PASSE) return setErreur(`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`);
    if (mdp !== confirmation) return setErreur('Les deux mots de passe sont différents.');
    setErreur('');
    setEnCours(true);
    try {
      await exporterEtPartager(mdp);
      setMdp('');
      setConfirmation('');
      onExporte();
    } catch (error) {
      setErreur(messageErreur(error, error instanceof Error ? error.message : 'Export impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Carte className="gap-3">
      <View className="flex-row items-center gap-2">
        <Download size={20} color={colors.primary} />
        <Text className="text-lg font-semibold text-ink">Exporter une sauvegarde</Text>
      </View>
      <Text className="text-muted">
        Toutes vos données dans un fichier chiffré. Envoyez-le hors du téléphone (WhatsApp à vous-même, Google Drive, e-mail) : si le
        téléphone est perdu ou l’application désinstallée, c’est la seule façon de tout récupérer.
      </Text>
      <Champ libelle="Mot de passe de la sauvegarde" value={mdp} onChangeText={setMdp} secureTextEntry autoCapitalize="none" />
      <Champ libelle="Confirmer le mot de passe" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" />
      <Text className="text-xs text-muted">Notez ce mot de passe : sans lui, la sauvegarde ne peut pas être ouverte.</Text>
      {erreur ? <Text className="text-danger">{erreur}</Text> : null}
      <Bouton titre="Créer et partager la sauvegarde" onPress={exporter} chargement={enCours} />
    </Carte>
  );
}

function Restauration() {
  const [fichier, setFichier] = useState<{ nom: string; brut: unknown; chiffree: boolean } | null>(null);
  const [mdp, setMdp] = useState('');
  const [preparee, setPreparee] = useState<{ contenu: unknown; resume: ResumeSauvegarde } | null>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const recommencer = () => {
    setFichier(null);
    setMdp('');
    setPreparee(null);
    setErreur('');
  };

  const etape = async (travail: () => Promise<void>) => {
    setErreur('');
    setEnCours(true);
    try {
      await travail();
    } catch (error) {
      setErreur(messageErreur(error, error instanceof Error ? error.message : 'Opération impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const choisir = () =>
    etape(async () => {
      const f = await choisirSauvegarde();
      if (!f) return;
      setFichier(f);
      setPreparee(null);
      if (!f.chiffree) setPreparee(await preparerRestauration(f.brut, null));
    });

  const ouvrir = () => etape(async () => setPreparee(await preparerRestauration(fichier!.brut, mdp)));

  const confirmerRestauration = () =>
    etape(async () => {
      const ok = await confirmer(
        'Remplacer toutes les données ?',
        'Les données actuelles de ce téléphone seront remplacées par celles de la sauvegarde. Si vous n’êtes pas sûr, exportez d’abord une sauvegarde des données actuelles.',
        'Restaurer',
        true
      );
      if (!ok) return;
      const r = await restaurer(preparee!.contenu);
      informer('Restauration terminée', `${r.logements} logement(s), ${r.locataires} locataire(s) et ${r.paiements} paiement(s) restaurés.`);
      recommencer();
    });

  return (
    <Carte className="gap-3">
      <View className="flex-row items-center gap-2">
        <Upload size={20} color={colors.primary} />
        <Text className="text-lg font-semibold text-ink">Restaurer une sauvegarde</Text>
      </View>
      {!fichier ? (
        <>
          <Text className="text-muted">Le fichier est vérifié avant toute modification. En cas de problème, vos données actuelles restent intactes.</Text>
          <Bouton titre="Choisir le fichier de sauvegarde" variante="secondaire" onPress={choisir} chargement={enCours} />
        </>
      ) : (
        <>
          <LigneInfo libelle="Fichier" valeur={fichier.nom} />
          {fichier.chiffree && !preparee ? (
            <>
              <Champ libelle="Mot de passe de la sauvegarde" value={mdp} onChangeText={setMdp} secureTextEntry autoCapitalize="none" />
              <Bouton titre="Ouvrir la sauvegarde" onPress={ouvrir} chargement={enCours} />
            </>
          ) : null}
          {preparee ? (
            <>
              <LigneInfo libelle="Créée le" valeur={formatDate(preparee.resume.exportee_le)} />
              {preparee.resume.proprietaire ? <LigneInfo libelle="Propriétaire" valeur={preparee.resume.proprietaire} /> : null}
              <LigneInfo libelle="Logements" valeur={String(preparee.resume.logements)} />
              <LigneInfo libelle="Locataires" valeur={String(preparee.resume.locataires)} />
              <LigneInfo libelle="Paiements" valeur={String(preparee.resume.paiements)} />
              <LigneInfo libelle="Factures" valeur={String(preparee.resume.factures)} />
              <LigneInfo libelle="Opérations financières" valeur={String(preparee.resume.mouvements)} />
              <Bouton titre="Restaurer ces données" variante="danger" onPress={confirmerRestauration} chargement={enCours} />
            </>
          ) : null}
          <Bouton titre="Choisir un autre fichier" variante="discret" onPress={recommencer} />
        </>
      )}
      {erreur ? <Text className="text-danger">{erreur}</Text> : null}
    </Carte>
  );
}

function Reinitialisation() {
  const [pin, setPin] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const lancer = async () => {
    setErreur('');
    const premier = await confirmer(
      'Effacer toutes les données ?',
      'Logements, locataires, loyers, factures, électricité et finances seront supprimés. Votre profil et votre code PIN sont conservés.',
      'Continuer',
      true
    );
    if (!premier) return;
    setEnCours(true);
    try {
      const verif = await pinService.verify(pin);
      if (verif.status !== 'ok') {
        setErreur(verif.status === 'locked' ? 'Trop d’essais : saisie du PIN bloquée.' : 'Code PIN incorrect.');
        return;
      }
      const second = await confirmer('Dernière confirmation', 'Cette action est définitive. Avez-vous exporté une sauvegarde ?', 'Tout effacer', true);
      if (!second) return;
      await reinitialiser();
      setPin('');
      informer('Données effacées', 'L’application est vide. Vous pouvez restaurer une sauvegarde ou recommencer la saisie.');
    } catch (error) {
      setErreur(messageErreur(error));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Carte className="gap-3 border-danger/40">
      <View className="flex-row items-center gap-2">
        <ShieldAlert size={20} color={colors.danger} />
        <Text className="text-lg font-semibold text-danger">Réinitialiser</Text>
      </View>
      <Text className="text-muted">Efface toutes les données de gestion. À utiliser seulement pour repartir de zéro.</Text>
      <Champ libelle="Votre code PIN" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} secureTextEntry keyboardType="number-pad" maxLength={6} />
      {erreur ? <Text className="text-danger">{erreur}</Text> : null}
      <Bouton titre="Effacer toutes les données" variante="danger" onPress={lancer} chargement={enCours} desactive={pin.length < 4} />
    </Carte>
  );
}
