import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, House, Pencil, Trash2, UserPlus, UserRound, Wallet, Zap } from 'lucide-react-native';

import { BoutonsContact } from '../../components/ui/Contact';
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
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate, formatFCFA, formatMois } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import {
  LIBELLES_TYPE_LOGEMENT,
  listerLogements,
  retirerLogement,
  type LogementAvecOccupant,
} from '../../repositories/logementRepository';
import { echeancierDuLocataire, situationLocataire } from '../../repositories/loyerRepository';
import { colors } from '../../theme/colors';
import { ElectriciteDetail } from '../electricite/ElectriciteDetail';
import { EntreeLocataireForm } from '../locataires/EntreeLocataireForm';
import { LocataireDetail } from '../locataires/LocataireDetail';
import { PaiementForm } from '../loyers/PaiementForm';
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
  // Accès direct depuis la chambre : fiche du locataire, encaissement, électricité.
  const [fiche, setFiche] = useState<number | null>(null);
  const [encaisser, setEncaisser] = useState<{ id: number; nom: string; du: number } | null>(null);
  const [electricite, setElectricite] = useState<number | null>(null);

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
          renderItem={({ item }) => (
            <CarteLogement logement={item} onPress={() => setSelection(item)} onLocataire={item.locataire_id ? () => setFiche(item.locataire_id) : undefined} />
          )}
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
            onFiche={(id) => {
              setSelection(null);
              setFiche(id);
            }}
            onEncaisser={(l) => {
              setSelection(null);
              setEncaisser(l);
            }}
            onElectricite={(contratId) => {
              setSelection(null);
              setElectricite(contratId);
            }}
          />
        ) : null}
      </Feuille>

      <LocataireDetail locataireId={fiche} onFermer={() => setFiche(null)} onModifie={rafraichir} />
      <ElectriciteDetail contratId={electricite} onFermer={() => setElectricite(null)} onModifie={rafraichir} />
      <PaiementForm
        ouverte={encaisser !== null}
        locataire={encaisser ? { id: encaisser.id, nom: encaisser.nom } : null}
        montantSuggere={encaisser?.du ?? 0}
        onFermer={() => setEncaisser(null)}
        onEnregistre={() => {
          setEncaisser(null);
          rafraichir();
        }}
      />

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

/** Carte d'un logement : touche = détail du logement ; bandeau du bas = fiche du locataire (deux zones distinctes). */
function CarteLogement({ logement, onPress, onLocataire }: { logement: LogementAvecOccupant; onPress: () => void; onLocataire?: () => void }) {
  const occupe = logement.contrat_id !== null;
  const loyer = occupe ? (logement.loyer_contrat ?? 0) + (logement.toilettes_contrat ?? 0) : logement.loyer_indicatif + logement.toilettes;
  return (
    <View className="bg-white rounded-2xl border border-border overflow-hidden">
      <Pressable onPress={onPress} accessibilityRole="button" className="p-4 active:bg-background">
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
      </Pressable>
      {occupe && onLocataire ? (
        <Pressable
          onPress={onLocataire}
          accessibilityRole="button"
          accessibilityLabel={`Fiche de ${logement.locataire_nom ?? 'locataire'}`}
          className="flex-row items-center px-4 py-2.5 border-t border-border active:bg-background"
        >
          <UserRound size={16} color={colors.primary} />
          <Text className="flex-1 ml-2 text-sm text-primary font-medium" numberOfLines={1}>
            Fiche de {logement.locataire_nom}
          </Text>
          <ChevronRight size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function DetailLogement({
  logement,
  onModifier,
  onAttribuer,
  onRetirer,
  onFiche,
  onEncaisser,
  onElectricite,
}: {
  logement: LogementAvecOccupant;
  onModifier: () => void;
  onAttribuer: () => void;
  onRetirer: () => void;
  onFiche: (locataireId: number) => void;
  onEncaisser: (l: { id: number; nom: string; du: number }) => void;
  onElectricite: (contratId: number) => void;
}) {
  const occupe = logement.contrat_id !== null && logement.locataire_id !== null;
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
        <Occupant logement={logement} onFiche={onFiche} onEncaisser={onEncaisser} onElectricite={onElectricite} />
      ) : (
        <Bouton titre="Attribuer à un locataire" icone={<UserPlus size={18} color={colors.white} />} onPress={onAttribuer} />
      )}
      <Bouton titre="Modifier le logement" variante="secondaire" icone={<Pencil size={18} color={colors.primary} />} onPress={onModifier} />
      {!occupe ? (
        <Bouton titre="Retirer ce logement" variante="danger" icone={<Trash2 size={18} color={colors.danger} />} onPress={onRetirer} />
      ) : null}
    </>
  );
}

/** Locataire de la chambre : situation des paiements et accès direct à sa fiche, à l'encaissement et à l'électricité. */
function Occupant({
  logement,
  onFiche,
  onEncaisser,
  onElectricite,
}: {
  logement: LogementAvecOccupant;
  onFiche: (locataireId: number) => void;
  onEncaisser: (l: { id: number; nom: string; du: number }) => void;
  onElectricite: (contratId: number) => void;
}) {
  const locataireId = logement.locataire_id!;
  const lire = useCallback(
    async (db: SqlDatabase) => {
      const [situation, echeancier] = await Promise.all([
        situationLocataire(db, locataireId),
        echeancierDuLocataire(db, locataireId, aujourdhui(), 1),
      ]);
      return { situation, payeJusqua: echeancier.payeJusqua, prochain: echeancier.prochain };
    },
    [locataireId]
  );
  const { donnees, chargement } = useRessource(lire, null);
  const nom = logement.locataire_nom ?? '';
  return (
    <>
      <Carte onPress={() => onFiche(locataireId)}>
        <View className="flex-row items-center">
          <View className="flex-1">
            <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Locataire</Text>
            <Text className="text-base font-semibold text-ink">{nom}</Text>
            {logement.locataire_telephone ? <Text className="text-muted">{logement.locataire_telephone}</Text> : null}
          </View>
          <ChevronRight size={20} color={colors.muted} />
        </View>
        <View className="mt-2">
          <LigneInfo libelle="Loyer du contrat" valeur={`${formatFCFA((logement.loyer_contrat ?? 0) + (logement.toilettes_contrat ?? 0))} / mois`} />
          {chargement && !donnees ? (
            <Chargement />
          ) : donnees ? (
            <>
              <LigneInfo
                libelle="Reste à payer"
                valeur={
                  <Text className={`font-bold ${donnees.situation.dette > 0 ? 'text-danger' : 'text-primary'}`}>{formatFCFA(donnees.situation.dette)}</Text>
                }
              />
              {donnees.situation.credit > 0 ? <LigneInfo libelle="Avance" valeur={formatFCFA(donnees.situation.credit)} /> : null}
              <LigneInfo
                libelle="Payé jusqu’à"
                valeur={donnees.payeJusqua ? formatMois(donnees.payeJusqua.mois, donnees.payeJusqua.annee) : 'Aucun mois'}
              />
              {donnees.prochain ? (
                <LigneInfo
                  libelle={donnees.prochain.enRetard ? 'En retard depuis' : 'Prochain paiement'}
                  valeur={`${formatDate(donnees.prochain.date)} · ${formatFCFA(donnees.prochain.montant)}`}
                />
              ) : null}
            </>
          ) : null}
        </View>
      </Carte>
      <BoutonsContact telephone={logement.locataire_telephone} />
      <Bouton titre="Voir la fiche du locataire" icone={<UserRound size={18} color={colors.white} />} onPress={() => onFiche(locataireId)} />
      <Bouton
        titre="Encaisser un paiement"
        variante="secondaire"
        icone={<Wallet size={18} color={colors.primary} />}
        onPress={() => onEncaisser({ id: locataireId, nom, du: donnees?.situation.dette ?? 0 })}
      />
      <Bouton
        titre="Électricité de la chambre"
        variante="secondaire"
        icone={<Zap size={18} color={colors.primary} />}
        onPress={() => onElectricite(logement.contrat_id!)}
      />
    </>
  );
}
