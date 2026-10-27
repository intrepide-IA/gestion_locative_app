import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bell, Settings } from 'lucide-react-native';

import { Text } from '../ui/Text';
import { Cible } from '../visite/Visite';
import type { SqlDatabase } from '../../db/types';
import { aujourdhui } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { listerAlertes } from '../../repositories/rappelsRepository';
import { colors } from '../../theme/colors';

const lireATraiter = async (db: SqlDatabase) => (await listerAlertes(db, aujourdhui())).filter((a) => a.gravite !== 'info').length;

/**
 * Notifications (avec le nombre de choses à traiter) et Paramètres, en haut de chaque onglet :
 * plus besoin de revenir à l'accueil pour les ouvrir.
 */
export function OutilsEnTete({ cible }: { /** Étape de visite guidée. */ cible?: string } = {}) {
  const navigation = useNavigation<{ navigate: (ecran: string) => void }>();
  const { donnees: aTraiter } = useRessource(lireATraiter, 0);
  const contenu = (
    <View className="flex-row items-center">
      <BoutonRond
        libelle={aTraiter ? `Notifications, ${aTraiter} à traiter` : 'Notifications'}
        onPress={() => navigation.navigate('Notifications')}
        pastille={aTraiter}
      >
        <Bell size={19} color={colors.ink} />
      </BoutonRond>
      <BoutonRond libelle="Paramètres" onPress={() => navigation.navigate('Parametres')}>
        <Settings size={19} color={colors.ink} />
      </BoutonRond>
    </View>
  );
  return cible ? <Cible id={cible}>{contenu}</Cible> : contenu;
}

function BoutonRond({ children, libelle, onPress, pastille }: { children: ReactNode; libelle: string; onPress: () => void; pastille?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      hitSlop={4}
      className="w-10 h-10 rounded-full bg-white border border-border items-center justify-center ml-2 active:bg-background"
    >
      {children}
      {pastille ? (
        <View
          className="absolute items-center justify-center rounded-full bg-danger border-2 border-background"
          style={{ top: -4, right: -4, minWidth: 19, height: 19, paddingHorizontal: 4 }}
        >
          <Text className="text-white text-[10px] font-bold">{pastille > 9 ? '9+' : pastille}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
