import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Zap } from 'lucide-react-native';

import { Badge, Bouton, BoutonFlottant, BoutonRetour, Carte, Chargement, EnTete, EtatErreur, EtatVide } from '../../components/ui/kit';
import { Cible, useVisite } from '../../components/visite/Visite';
import { VISITES } from '../../components/visite/visites';
import { Text } from '../../components/ui/Text';
import { LIBELLES_STOCK } from '../../domain/electricite';
import { messageErreur } from '../../domain/erreurs';
import { useRessource } from '../../hooks/useRessource';
import { listerSituationsElectricite, type SituationElectricite } from '../../repositories/electriciteRepository';
import { colors } from '../../theme/colors';
import { ClientElectriciteForm } from './ClientElectriciteForm';
import { ElectriciteDetail, formatKwh, tonStock } from './ElectriciteDetail';
import { synchroniserNotifications } from '../../services/notifications';

const AUCUNE: SituationElectricite[] = [];

const lire = async (db: Parameters<typeof listerSituationsElectricite>[0]) => {
  const situations = await listerSituationsElectricite(db);
  void synchroniserNotifications();
  return situations;
};

export function ElectriciteScreen({ onRetour }: { onRetour?: () => void }) {
  const { donnees, chargement, erreur, rafraichir } = useRessource(lire, AUCUNE);
  const [selection, setSelection] = useState<number | null>(null);
  const [creation, setCreation] = useState(false);
  const alertes = donnees.filter((s) => s.etat !== 'ok' && s.achetes > 0).length;
  useVisite('electricite', VISITES.electricite, { pret: !chargement });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {onRetour ? <BoutonRetour onPress={onRetour} /> : null}
      <EnTete titre="Électricité" sousTitre={donnees.length ? (alertes ? `${alertes} alerte(s) de stock` : 'Tous les stocks sont suffisants') : undefined} />
      {erreur ? (
        <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
      ) : chargement && donnees.length === 0 ? (
        <Chargement />
      ) : (
        <FlatList
          data={donnees}
          keyExtractor={(s) => String(s.contrat_id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110, gap: 10 }}
          ListEmptyComponent={
            <EtatVide
              icone={<Zap size={30} color={colors.primary} />}
              titre="Aucun compteur suivi"
              message="Le suivi apparaît dès qu’un locataire occupe un logement. Vous vendez aussi l’électricité à quelqu’un qui ne loue pas ? Ajoutez-le comme client."
              action={<Bouton titre="Ajouter un client électricité" variante="secondaire" onPress={() => setCreation(true)} />}
            />
          }
          renderItem={({ item, index }) => (
            <Cible id={index === 0 ? 'electricite.carte' : `electricite.carte.${item.contrat_id}`}>
            <Carte onPress={() => setSelection(item.contrat_id)}>
              <View className="flex-row items-center">
                <View className="w-11 h-11 rounded-xl bg-accent/20 items-center justify-center">
                  <Zap size={20} color="#8A6500" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-base font-semibold text-ink">{item.locataire_nom}</Text>
                  <Text className="text-sm text-muted" numberOfLines={1}>
                    {item.type_contrat === 'electricite' ? 'Client électricité' : item.logement_reference}
                  </Text>
                </View>
                <View className="items-end">
                  {item.achetes === 0 && item.consommes === 0 ? (
                    <Badge libelle="Aucun achat" ton="neutre" />
                  ) : (
                    <Badge libelle={LIBELLES_STOCK[item.etat]} ton={tonStock(item.etat)} />
                  )}
                  <Text className="text-sm font-semibold text-ink mt-1.5">
                    {item.stock < 0 ? `−${formatKwh(-item.stock)}` : formatKwh(item.stock)}
                  </Text>
                  {item.achetes > 0 ? (
                    <Text className="text-xs text-muted">Coupure : {String(item.index_coupure).replace('.', ',')}</Text>
                  ) : null}
                </View>
              </View>
            </Carte>
            </Cible>
          )}
        />
      )}
      {donnees.length > 0 ? <BoutonFlottant cible="electricite.client" libelle="Ajouter un client électricité" onPress={() => setCreation(true)} /> : null}
      <ElectriciteDetail contratId={selection} onFermer={() => setSelection(null)} onModifie={rafraichir} />
      <ClientElectriciteForm
        ouverte={creation}
        onFermer={() => setCreation(false)}
        onEnregistre={(contratId) => {
          setCreation(false);
          rafraichir();
          setSelection(contratId);
        }}
      />
    </SafeAreaView>
  );
}
