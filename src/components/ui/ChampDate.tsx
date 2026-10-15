import { Pressable, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';

import { Text } from './Text';
import { aujourdhui, formatDate } from '../../domain/format';
import { colors } from '../../theme/colors';

/** Champ date (AAAA-MM-JJ) avec le calendrier natif Android. */
export function ChampDate({
  libelle,
  valeur,
  onChange,
  erreur,
  minimum,
}: {
  libelle: string;
  valeur: string;
  onChange: (iso: string) => void;
  erreur?: string;
  minimum?: string;
}) {
  const ouvrir = () => {
    const [a, m, j] = valeur.split('-').map(Number);
    DateTimePickerAndroid.open({
      value: a ? new Date(a, m - 1, j) : new Date(),
      mode: 'date',
      minimumDate: minimum ? new Date(`${minimum}T00:00:00`) : undefined,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(aujourdhui(date));
      },
    });
  };

  return (
    <View>
      <Text className="text-sm font-medium text-ink mb-1.5">{libelle}</Text>
      <Pressable
        onPress={ouvrir}
        accessibilityRole="button"
        accessibilityLabel={`${libelle} : ${valeur ? formatDate(valeur) : 'non renseignée'}`}
        className={`bg-white border rounded-xl px-4 py-3 flex-row items-center justify-between ${erreur ? 'border-danger' : 'border-border'}`}
      >
        <Text className={`text-base ${valeur ? 'text-ink' : 'text-muted'}`}>{valeur ? formatDate(valeur) : 'Choisir une date'}</Text>
        <CalendarDays size={18} color={colors.muted} />
      </Pressable>
      {erreur ? <Text className="text-danger text-xs mt-1">{erreur}</Text> : null}
    </View>
  );
}
