import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Zap } from 'lucide-react-native';

import { Badge, Carte, Chargement, EnTete, EtatErreur, EtatVide } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { LIBELLES_STOCK } from '../../domain/electricite';
import { messageErreur } from '../../domain/erreurs';
import { useRessource } from '../../hooks/useRessource';
import { listerSituationsElectricite, type SituationElectricite } from '../../repositories/electriciteRepository';
import { colors } from '../../theme/colors';
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
  const alertes = donnees.filter((s) => s.etat !== 'ok' && s.achetes > 0).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {onRetour ? (
        <Pressable onPress={onRetour} accessibilityRole="button" className="flex-row items-center px-4 pt-3">
          <ChevronLeft size={20} color={colors.primary} />
          <Text className="text-primary font-medium">Plus</Text>
        </Pressable>
      ) : null}
      <EnTete titre="Électricité" sousTitre={donnees.length ? (alertes ? `${alertes} alerte(s) de stock` : 'Tous les stocks sont suffisants') : undefined} />
      {erreur ? (
        <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
      ) : chargement && donnees.length === 0 ? (
        <Chargement />
      ) : (
        <FlatList
          data={donnees}
          keyExtractor={(s) => String(s.contrat_id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
          ListEmptyComponent={
            <EtatVide
              icone={<Zap size={30} color={colors.primary} />}
              titre="Aucun locataire actif"
              message="Le suivi de l’électricité apparaît dès qu’un locataire occupe un logement."
            />
          }
          renderItem={({ item }) => (
            <Carte onPress={() => setSelection(item.contrat_id)}>
              <View className="flex-row items-center">
                <View className="w-11 h-11 rounded-xl bg-accent/20 items-center justify-center">
                  <Zap size={20} color="#8A6500" />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-base font-semibold text-ink">{item.locataire_nom}</Text>
                  <Text className="text-sm text-muted">{item.logement_reference}</Text>
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
                </View>
              </View>
            </Carte>
          )}
        />
      )}
      <ElectriciteDetail contratId={selection} onFermer={() => setSelection(null)} onModifie={rafraichir} />
    </SafeAreaView>
  );
}
