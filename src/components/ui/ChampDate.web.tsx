import { createElement } from 'react';
import { View } from 'react-native';

import { Text } from './Text';
import { FONT_FAMILY } from '../../theme/fonts';
import { colors } from '../../theme/colors';

/** Aperçu web : champ date HTML natif (même valeur AAAA-MM-JJ que sur Android). */
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
  return (
    <View>
      <Text className="text-sm font-medium text-ink mb-1.5">{libelle}</Text>
      {createElement('input', {
        type: 'date',
        value: valeur,
        min: minimum,
        'aria-label': libelle,
        onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
        style: {
          fontFamily: FONT_FAMILY,
          fontSize: 16,
          color: colors.ink,
          background: colors.white,
          border: `1px solid ${erreur ? colors.danger : colors.border}`,
          borderRadius: 12,
          padding: '12px 16px',
        },
      })}
      {erreur ? <Text className="text-danger text-xs mt-1">{erreur}</Text> : null}
    </View>
  );
}
