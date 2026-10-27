import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users } from 'lucide-react-native';

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
} from '../../components/ui/kit';
import { Cible, useVisite } from '../../components/visite/Visite';
import { VISITES } from '../../components/visite/visites';
import { OutilsEnTete } from '../../components/navigation/OutilsEnTete';
import { Text } from '../../components/ui/Text';
import { messageErreur } from '../../domain/erreurs';
import { formatDate, formatFCFA, initiales } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { listerLocataires, type LocataireAvecContrat } from '../../repositories/locataireRepository';
import { colors } from '../../theme/colors';
import { EntreeLocataireForm } from './EntreeLocataireForm';
import { LocataireDetail } from './LocataireDetail';

type Filtre = 'actifs' | 'partis' | 'tous';

const AUCUN: LocataireAvecContrat[] = [];

export function LocatairesScreen() {
  const { donnees: locataires, chargement, erreur, rafraichir } = useRessource(listerLocataires, AUCUN);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('actifs');
  const [entree, setEntree] = useState(false);
  const [selection, setSelection] = useState<number | null>(null);

  const actifs = locataires.filter((l) => l.contrat_statut === 'actif').length;
  useVisite('locataires', VISITES.locataires, { pret: !chargement });
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return locataires.filter((l) => {
      const actif = l.contrat_statut === 'actif';
      if (filtre === 'actifs' && !actif) return false;
      if (filtre === 'partis' && actif) return false;
      return !q || l.nom_complet.toLowerCase().includes(q) || (l.logement_reference ?? '').toLowerCase().includes(q);
    });
  }, [locataires, recherche, filtre]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <EnTete outils={<OutilsEnTete />} titre="Locataires" sousTitre={locataires.length ? `${actifs} locataire(s) actif(s)` : undefined} />
      {locataires.length > 0 ? (
        <>
          <Cible id="locataires.recherche">
            <BarreRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un locataire ou un logement…" />
          </Cible>
          <Filtres
            options={[
              { valeur: 'actifs', libelle: `Actifs (${actifs})` },
              { valeur: 'partis', libelle: `Partis (${locataires.length - actifs})` },
              { valeur: 'tous', libelle: 'Tous' },
            ]}
            valeur={filtre}
            onChange={setFiltre}
          />
        </>
      ) : null}

      {erreur ? (
        <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
      ) : chargement && locataires.length === 0 ? (
        <Chargement />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110, gap: 10 }}
          ListEmptyComponent={
            locataires.length === 0 ? (
              <EtatVide
                icone={<Users size={30} color={colors.primary} />}
                titre="Aucun locataire"
                message="Enregistrez l’entrée d’un locataire dans un de vos logements libres."
                action={<Bouton titre="Ajouter un locataire" onPress={() => setEntree(true)} />}
              />
            ) : (
              <Text className="text-muted text-center py-10">Aucun locataire ne correspond.</Text>
            )
          }
          renderItem={({ item, index }) => (
            <Cible id={index === 0 ? 'locataires.carte' : `locataires.carte.${item.id}`}>
              <CarteLocataire locataire={item} onPress={() => setSelection(item.id)} />
            </Cible>
          )}
        />
      )}

      {locataires.length > 0 ? <BoutonFlottant cible="locataires.ajouter" libelle="Ajouter un locataire" onPress={() => setEntree(true)} /> : null}

      <EntreeLocataireForm
        ouverte={entree}
        onFermer={() => setEntree(false)}
        onEnregistre={(id) => {
          setEntree(false);
          rafraichir();
          setSelection(id);
        }}
      />
      <LocataireDetail locataireId={selection} onFermer={() => setSelection(null)} onModifie={rafraichir} />
    </SafeAreaView>
  );
}

function CarteLocataire({ locataire, onPress }: { locataire: LocataireAvecContrat; onPress: () => void }) {
  const actif = locataire.contrat_statut === 'actif';
  return (
    <Carte onPress={onPress}>
      <View className="flex-row items-center">
        <View className={`w-11 h-11 rounded-full items-center justify-center ${actif ? 'bg-primary' : 'bg-border'}`}>
          <Text className={`font-bold ${actif ? 'text-white' : 'text-muted'}`}>{initiales(locataire.nom_complet)}</Text>
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {locataire.nom_complet}
          </Text>
          <Text className="text-sm text-muted" numberOfLines={1}>
            {actif
              ? `${locataire.logement_reference} · ${formatFCFA((locataire.loyer ?? 0) + (locataire.toilettes ?? 0))} / mois`
              : locataire.date_sortie
                ? `Parti le ${formatDate(locataire.date_sortie)}`
                : 'Sans contrat'}
          </Text>
        </View>
        <Badge libelle={actif ? 'Actif' : 'Parti'} ton={actif ? 'succes' : 'neutre'} />
      </View>
    </Carte>
  );
}
