import { Pressable, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Database } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { BoutonRetour, Chargement, EnTete, EtatErreur } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, initiales } from '../../domain/format';
import type { Alerte, GraviteAlerte } from '../../domain/rappels';
import { useRessource } from '../../hooks/useRessource';
import { listerAlertes } from '../../repositories/rappelsRepository';
import { colors } from '../../theme/colors';

const lire = (db: SqlDatabase) => listerAlertes(db, aujourdhui());

/** Pastille discrète : rouge si urgent, ambre si à surveiller, rien pour un conseil. */
const POINT: Record<GraviteAlerte, string | null> = { urgent: colors.danger, attention: colors.accent, info: null };

/** Notifications : une liste simple, comme une boîte de messages — qui, quoi, combien. */
export function NotificationsScreen({ onRetour }: { onRetour: () => void }) {
  const { donnees, chargement, erreur, rafraichir } = useRessource(lire, [] as Alerte[]);
  const navigation = useNavigation<{ navigate: (ecran: string, params?: object) => void }>();

  const ouvrir = (a: Alerte) => {
    if (a.type === 'loyer') navigation.navigate('Main', { screen: 'Invoices' });
    else if (a.type === 'fin_contrat') navigation.navigate('Main', { screen: 'Tenants' });
    else if (a.type === 'electricite') navigation.navigate('Electricite');
    else navigation.navigate('Sauvegarde');
  };

  const sections = [
    { titre: 'À traiter', data: donnees.filter((a) => a.gravite !== 'info') },
    { titre: 'Conseils', data: donnees.filter((a) => a.gravite === 'info') },
  ].filter((s) => s.data.length);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete titre="Notifications" />
      {erreur ? (
        <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
      ) : chargement && !donnees.length ? (
        <Chargement />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.cle}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListEmptyComponent={
            <View className="px-8 py-16 items-center">
              <Text className="text-ink font-semibold text-base">Rien à signaler</Text>
              <Text className="text-muted text-center mt-1">Tous les loyers sont à jour et aucun compteur n’est à vérifier.</Text>
            </View>
          }
          renderSectionHeader={({ section }) => <Text className="text-muted text-sm font-medium px-5 pt-4 pb-2">{section.titre}</Text>}
          renderItem={({ item: a, index, section }) => {
            const point = POINT[a.gravite];
            return (
              <Pressable
                onPress={() => ouvrir(a)}
                accessibilityRole="button"
                accessibilityLabel={`${a.qui ? `${a.qui}, ` : ''}${a.titre}, ${a.detail}`}
                className="bg-white flex-row items-center px-5 py-3.5 active:bg-background"
                style={{
                  borderTopWidth: index === 0 ? 1 : 0,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                  marginBottom: index === section.data.length - 1 ? 4 : 0,
                }}
              >
                <View className="w-10 h-10 rounded-full bg-background items-center justify-center">
                  {a.qui ? <Text className="text-ink font-semibold">{initiales(a.qui)}</Text> : <Database size={18} color={colors.muted} />}
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-ink font-semibold" numberOfLines={1}>
                    {a.qui ?? a.titre}
                  </Text>
                  <Text className="text-muted text-sm" numberOfLines={2}>
                    {a.qui ? `${a.titre}${a.detail ? ` · ${a.detail}` : ''}` : a.detail}
                  </Text>
                </View>
                {point ? <View className="w-2.5 h-2.5 rounded-full ml-2" style={{ backgroundColor: point }} /> : null}
                <ChevronRight size={16} color={colors.muted} style={{ marginLeft: 6 }} />
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
