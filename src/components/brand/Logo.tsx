import { View } from 'react-native';
import { Text } from '../ui/Text';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '../../theme/colors';

/** Vert de la bande du symbole (légèrement plus clair que le vert principal, comme sur le guide de marque). */
const VERT_BANDE = '#17885A';

type Variante = 'couleur' | 'fond-vert';

/** Symbole Onílé (maison, fenêtre, bande verte, soleil). Source : assets/brand/onile-symbole.svg. */
export function LogoSymbole({ taille = 64, variante = 'couleur' }: { taille?: number; variante?: Variante }) {
  const surFondVert = variante === 'fond-vert';
  const trait = surFondVert ? colors.white : colors.primary;
  return (
    <Svg width={taille} height={taille} viewBox="0 0 512 512" accessibilityLabel="Logo Onílé">
      <Path
        d="M118 392V214L252 96l134 116v26"
        fill="none"
        stroke={trait}
        strokeWidth={58}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <G fill={colors.accent}>
        <Rect x={207} y={194} width={35} height={35} rx={8} />
        <Rect x={250} y={194} width={35} height={35} rx={8} />
        <Rect x={207} y={237} width={35} height={35} rx={8} />
        <Rect x={250} y={237} width={35} height={35} rx={8} />
      </G>
      <Path
        d="M89 392c86-58 210-92 346-102-26 54-120 92-224 120-44 12-82 26-104 34-18 6-26-8-18-52Z"
        fill={surFondVert ? colors.white : VERT_BANDE}
      />
      <Path d="M152 458c112-12 214-58 286-130 6 76-42 138-118 156-62 14-122 4-168-26Z" fill={colors.accent} />
      <Circle cx={384} cy={418} r={13} fill={surFondVert ? colors.primary : VERT_BANDE} />
    </Svg>
  );
}

interface LogoProps {
  variante?: Variante;
  /** Disposition : symbole au-dessus du nom, ou à sa gauche. */
  disposition?: 'verticale' | 'horizontale';
  taille?: number;
  avecSignature?: boolean;
}

/** Logo complet : symbole + « Onílé » + signature facultative. */
export function Logo({ variante = 'couleur', disposition = 'verticale', taille = 72, avecSignature = true }: LogoProps) {
  const surFondVert = variante === 'fond-vert';
  const couleurNom = surFondVert ? 'text-white' : 'text-primary';
  const couleurSignature = surFondVert ? 'text-white/80' : 'text-primary';
  const horizontal = disposition === 'horizontale';

  return (
    <View className={horizontal ? 'flex-row items-center' : 'items-center'}>
      <LogoSymbole taille={taille} variante={variante} />
      <View className={horizontal ? 'ml-3' : 'items-center mt-2'}>
        <Text
          className={`${couleurNom} font-bold`}
          style={{ fontSize: Math.round(taille * (horizontal ? 0.5 : 0.48)), letterSpacing: -0.5 }}
        >
          Onílé
        </Text>
        {avecSignature ? (
          <Text className={`${couleurSignature} font-medium`} style={{ fontSize: Math.max(11, Math.round(taille * 0.17)) }}>
            Gérer aujourd’hui, habiter demain
          </Text>
        ) : null}
      </View>
    </View>
  );
}
