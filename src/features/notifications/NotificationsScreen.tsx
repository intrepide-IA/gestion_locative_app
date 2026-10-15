import type { ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellOff, CalendarClock, ChevronRight, Database, Wallet, Zap } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { BoutonRetour, Chargement, EnTete, EtatErreur, EtatVide } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui } from '../../domain/format';
import type { Alerte, GraviteAlerte } from '../../domain/rappels';
import { useRessource } from '../../hooks/useRessource';
import { listerAlertes } from '../../repositories/rappelsRepository';
import { colors } from '../../theme/colors';

const lire = (db: SqlDatabase) => listerAlertes(db, aujourdhui());

const TONS: Record<GraviteAlerte, { fond: string; trait: string; icone: string; libelle: string }> = {
  urgent: { fond: 'bg-danger/10', trait: 'bg-danger', icone: colors.danger, libelle: 'Urgent' },
  attention: { fond: 'bg-accent/20', trait: 'bg-accent', icone: '#8A6500', libelle: 'À surveiller' },
  info: { fond: 'bg-primary/10', trait: 'bg-primary', icone: colors.primary, libelle: 'Conseil' },
};

function icone(type: Alerte['type'], couleur: string): ReactNode {
  if (type === 'loyer') return <Wallet size={20} color={couleur} />;
  if (type === 'fin_contrat') return <CalendarClock size={20} color={couleur} />;
  if (type === 'electricite') return <Zap size={20} color={couleur} />;
  return <Database size={20} color={couleur} />;
}

/** Page Notifications : ce qui demande l'attention aujourd'hui, du plus urgent au simple conseil. */
export function NotificationsScreen({ onRetour }: { onRetour: () => void }) {
  const { donnees, chargement, erreur, rafraichir } = useRessource(lire, [] as Alerte[]);
  const navigation = useNavigation<{ navigate: (ecran: string, params?: object) => void }>();
  const urgentes = donnees.filter((a) => a.gravite === 'urgent').length;

  const ouvrir = (a: Alerte) => {
    if (a.type === 'loyer') navigation.navigate('Main', { screen: 'Invoices' });
    else if (a.type === 'fin_contrat') navigation.navigate('Main', { screen: 'Tenants' });
    else if (a.type === 'electricite') navigation.navigate('Electricite');
    else navigation.navigate('Sauvegarde');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete
        titre="Notifications"
        sousTitre={donnees.length ? `${donnees.length} élément(s)${urgentes ? ` dont ${urgentes} urgent(s)` : ''}` : undefined}
      />
      {erreur ? (
        <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
      ) : chargement && !donnees.length ? (
        <Chargement />
      ) : (
        <FlatList
          data={donnees}
          keyExtractor={(a) => a.cle}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, gap: 10 }}
          ListEmptyComponent={
            <EtatVide
              icone={<BellOff size={30} color={colors.primary} />}
              titre="Tout est à jour"
              message="Aucun loyer en retard, aucun contrat qui se termine bientôt, aucun stock d’électricité bas."
            />
          }
          renderItem={({ item: a }) => {
            const ton = TONS[a.gravite];
            return (
              <Pressable
                onPress={() => ouvrir(a)}
                accessibilityRole="button"
                className="bg-white rounded-2xl border border-border flex-row items-center overflow-hidden active:bg-background"
              >
                <View className={`w-1.5 self-stretch ${ton.trait}`} />
                <View className={`w-11 h-11 rounded-xl items-center justify-center ml-3 ${ton.fond}`}>{icone(a.type, ton.icone)}</View>
                <View className="flex-1 px-3 py-3.5">
                  <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: ton.icone }}>
                    {ton.libelle}
                  </Text>
                  <Text className="font-semibold text-ink mt-0.5">{a.titre}</Text>
                  <Text className="text-muted text-sm mt-0.5">{a.detail}</Text>
                </View>
                <View className="pr-3">
                  <ChevronRight size={18} color={colors.muted} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
