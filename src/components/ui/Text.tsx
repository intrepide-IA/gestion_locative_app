import { Text as RNText, type TextProps } from 'react-native';

import { FONT_FAMILY } from '../../theme/fonts';

/**
 * Texte Onílé : applique la police Inter ; la graisse vient des classes (`font-medium`, `font-bold`…).
 * À utiliser à la place du `Text` de react-native.
 */
export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[{ fontFamily: FONT_FAMILY }, style]} />;
}
