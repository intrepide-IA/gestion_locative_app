import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { House, Pencil, Trash2, UserPlus } from 'lucide-react-native';

import { Feuille } from '../../components/ui/Feuille';
import { confirmer, informer } from '../../components/ui/confirmer';
import {
  Badge,
  BarreRecherche,
  Bouton,
  BoutonFlottant,
  Carte,
  Chargement,
  EnTete,
  EtatErreur,
  EtatVide,
  Filtres,
  LigneInfo,
  PastilleIcone,
} from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import { messageErreur } from '../../domain/erreurs';
import { formatFCFA } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import {
  LIBELLES_TYPE_LOGEMENT,
  listerLogements,
  retirerLogement,
  type LogementAvecOccupant,
} from '../../repositories/logementRepository';
import { colors } from '../../theme/colors';
import { EntreeLocataireForm } from '../locataires/EntreeLocataireForm';
import { LogementForm } from './LogementForm';

type Filtre = 'tous' | 'occupes' | 'libres';

const AUCUN: LogementAvecOccupant[] = [];

export function LogementsScreen() {
  const { donnees: logements, chargement, erreur, rafraichir } = useRessource(listerLogements, AUCUN);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [creation, setCreation] = useState(false);
  const [selection, setSelection] = useState<LogementAvecOccupant | null>(null);
  const [edition, setEdition] = useState<LogementAvecOccupant | null>(null);
  const [attribution, setAttribution] = useState<number | null>(null);

  const occupes = logements.filter((l) => l.contrat_id !== null).length;
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return logements.filter((l) => {
      if (filtre === 'occupes' && l.contrat_id === null) return false;
      if (filtre === 'libres' && l.contrat_id !== null) return false;
      return !q || l.reference.toLowerCase().includes(q) || (l.locataire_nom ?? '').toLowerCase().includes(q);
    });
  }, [logements, recherche, filtre]);

  const retirer = async (l: LogementAvecOccupant) => {
    const ok = await confirmer(
      'Retirer ce logement ?',
      'S’il a un historique (anciens contrats), il sera archivé et son historique conservé. Sinon il sera supprimé.',
      'Retirer',
      true
    );
    if (!ok) return;
    try {
      const resultat = await retirerLogement(await getDatabase(), l.id);
      setSelection(null);
      rafraichir();
      informer('Logement retiré', resultat === 'archive' ? 'Le logement est archivé, son historique est conservé.' : 'Le logement a été supprimé.');
    } catch (error) {
      informer('Impossible de retirer', messageErreur(error));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <EnTete
        titre="Logements"
        sousTitre={logements.length ? `${logements.length} logement(s) · ${occupes} occupé(s) · ${logements.length - occupes} libre(s)` : undefined}
      />
      {logements.length > 0 ? (
        <>
          <BarreRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un logement ou un locataire…" />
          <Filtres
            options={[
              { valeur: 'tous', libelle: `Tous (${logements.length})` },
              { valeur: 'occupes', libelle: `Occupés (${occupes})` },
              { valeur: 'libres', libelle: `Libres (${logements.length - occupes})` },
            ]}
            valeur={filtre}
            onChange={setFiltre}
          />
        </>
      ) : null}

      {erreur ? (
        <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
      ) : chargement && logements.length === 0 ? (
        <Chargement />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110, gap: 10 }}
          ListEmptyComponent={
            logements.length === 0 ? (
              <EtatVide
                icone={<House size={30} color={colors.primary} />}
                titre="Aucun logement"
                message="Ajoutez les chambres et appartements de votre maison pour commencer."
                action={<Bouton titre="Ajouter un logement" onPress={() => setCreation(true)} />}
              />
            ) : (
              <Text className="text-muted text-center py-10">Aucun logement ne correspond.</Text>
            )
          }
          renderItem={({ item }) => <CarteLogement logement={item} onPress={() => setSelection(item)} />}
        />
      )}

      {logements.length > 0 ? <BoutonFlottant libelle="Ajouter un logement" onPress={() => setCreation(true)} /> : null}

      <LogementForm
        ouverte={creation || edition !== null}
        logement={edition}
        onFermer={() => {
          setCreation(false);
          setEdition(null);
        }}
        onEnregistre={() => {
          setCreation(false);
          setEdition(null);
          rafraichir();
        }}
      />

      <Feuille ouverte={selection !== null} onFermer={() => setSelection(null)} titre={selection?.reference ?? ''}>
        {selection ? (
          <DetailLogement
            logement={selection}
            onModifier={() => {
              setEdition(selection);
              setSelection(null);
            }}
            onAttribuer={() => {
              setAttribution(selection.id);
              setSelection(null);
            }}
            onRetirer={() => retirer(selection)}
          />
        ) : null}
      </Feuille>

      <EntreeLocataireForm
        ouverte={attribution !== null}
        logementId={attribution}
        onFermer={() => setAttribution(null)}
        onEnregistre={() => {
          setAttribution(null);
          rafraichir();
        }}
      />
    </SafeAreaView>
  );
}

function CarteLogement({ logement, onPress }: { logement: LogementAvecOccupant; onPress: () => void }) {
  const occupe = logement.contrat_id !== null;
  const loyer = occupe ? (logement.loyer_contrat ?? 0) + (logement.toilettes_contrat ?? 0) : logement.loyer_indicatif + logement.toilettes;
  return (
    <Carte onPress={onPress}>
      <View className="flex-row items-center">
        <PastilleIcone ton={occupe ? 'vert' : 'jaune'}>
          <House size={22} color={occupe ? colors.white : '#8A6500'} />
        </PastilleIcone>
        <View className="flex-1 ml-3">
          <Text className="text-base font-semibold text-ink">{logement.reference}</Text>
          <Text className="text-sm text-muted" numberOfLines={1}>
            {occupe ? logement.locataire_nom : LIBELLES_TYPE_LOGEMENT[logement.type]}
          </Text>
        </View>
        <View className="items-end">
          <Badge libelle={occupe ? 'Occupé' : 'Libre'} ton={occupe ? 'succes' : 'attention'} />
          <Text className="text-sm font-semibold text-ink mt-1.5">{formatFCFA(loyer)}</Text>
        </View>
      </View>
    </Carte>
  );
}

function DetailLogement({
  logement,
  onModifier,
  onAttribuer,
  onRetirer,
}: {
  logement: LogementAvecOccupant;
  onModifier: () => void;
  onAttribuer: () => void;
  onRetirer: () => void;
}) {
  const occupe = logement.contrat_id !== null;
  return (
    <>
      <Carte>
        <LigneInfo libelle="Type" valeur={LIBELLES_TYPE_LOGEMENT[logement.type]} />
        <LigneInfo libelle="Statut" valeur={<Badge libelle={occupe ? 'Occupé' : 'Libre'} ton={occupe ? 'succes' : 'attention'} />} />
        <LigneInfo libelle="Loyer proposé" valeur={formatFCFA(logement.loyer_indicatif)} />
        <LigneInfo libelle="Toilettes" valeur={formatFCFA(logement.toilettes)} />
        {logement.description ? <Text className="text-muted pt-3">{logement.description}</Text> : null}
      </Carte>
      {occupe ? (
        <Carte>
          <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Occupant</Text>
          <Text className="text-base font-semibold text-ink">{logement.locataire_nom}</Text>
          <Text className="text-muted">
            Loyer du contrat : {formatFCFA((logement.loyer_contrat ?? 0) + (logement.toilettes_contrat ?? 0))} / mois
          </Text>
          <Text className="text-muted text-xs mt-2">Gérez le contrat depuis l’onglet Locataires.</Text>
        </Carte>
      ) : (
        <Bouton titre="Attribuer à un locataire" icone={<UserPlus size={18} color={colors.white} />} onPress={onAttribuer} />
      )}
      <Bouton titre="Modifier" variante="secondaire" icone={<Pencil size={18} color={colors.primary} />} onPress={onModifier} />
      {!occupe ? (
        <Bouton titre="Retirer ce logement" variante="danger" icone={<Trash2 size={18} color={colors.danger} />} onPress={onRetirer} />
      ) : null}
    </>
  );
}
