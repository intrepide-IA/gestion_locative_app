import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { Text } from './Text';
import { colors } from '../../theme/colors';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface SerieCourbe {
  libelle: string;
  couleur: string;
  valeurs: number[];
}

type Point = { x: number; y: number };

/** Tracé lissé (Catmull-Rom → Bézier), sans dépasser les bornes verticales entre deux points. */
function tracer(points: Point[]): string {
  if (points.length === 0) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const bas = Math.max(p1.y, p2.y);
    const haut = Math.min(p1.y, p2.y);
    const borne = (y: number) => Math.min(bas, Math.max(haut, y));
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: borne(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: borne(p2.y - (p3.y - p1.y) / 6) };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Longueur approchée (par excès) du tracé, pour l'animation « dessin » du trait. */
function longueur(points: Point[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return l * 1.15 + 1;
}

function abrege(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} k`;
  return String(Math.round(n));
}

function SerieAnimee({ serie, points, bas, cle, rang }: { serie: SerieCourbe; points: Point[]; bas: number; cle: string; rang: number }) {
  const progres = useSharedValue(0);
  const total = longueur(points);
  useEffect(() => {
    progres.set(0);
    progres.set(withDelay(rang * 180, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
  }, [cle, progres, rang]);

  const trait = useAnimatedProps(() => ({ strokeDashoffset: total * (1 - progres.value) }));
  const aire = useAnimatedProps(() => ({ fillOpacity: progres.value }));
  const d = tracer(points);
  const fond = `${d} L${points[points.length - 1].x},${bas} L${points[0].x},${bas} Z`;
  const id = `degrade-${rang}`;

  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={serie.couleur} stopOpacity={0.22} />
          <Stop offset="1" stopColor={serie.couleur} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <AnimatedPath d={fond} fill={`url(#${id})`} animatedProps={aire} />
      <AnimatedPath
        d={d}
        fill="none"
        stroke={serie.couleur}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${total} ${total}`}
        animatedProps={trait}
      />
    </>
  );
}

/**
 * Courbe linéaire animée (entrées / sorties…) : les traits se dessinent de gauche à droite,
 * puis la surface apparaît. `surligne` met en évidence un point (le mois choisi).
 */
export function Courbe({ series, etiquettes, surligne, hauteur = 170 }: { series: SerieCourbe[]; etiquettes: string[]; surligne?: number; hauteur?: number }) {
  const [largeur, setLargeur] = useState(0);
  const marge = { gauche: 34, droite: 10, haut: 10, bas: 22 };
  const max = Math.max(1, ...series.flatMap((s) => s.valeurs));
  const cle = useMemo(() => series.map((s) => s.valeurs.join(',')).join('|'), [series]);
  const n = etiquettes.length;

  const zoneL = Math.max(1, largeur - marge.gauche - marge.droite);
  const zoneH = hauteur - marge.haut - marge.bas;
  const x = (i: number) => marge.gauche + (n > 1 ? (i / (n - 1)) * zoneL : zoneL / 2);
  const y = (v: number) => marge.haut + zoneH - (v / max) * zoneH;
  const bas = marge.haut + zoneH;
  const graduations = [0, 0.5, 1];

  return (
    <View>
      <View onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} style={{ height: hauteur }}>
        {largeur > 0 ? (
          <Svg width={largeur} height={hauteur}>
            {graduations.map((g) => (
              <Line
                key={g}
                x1={marge.gauche}
                x2={largeur - marge.droite}
                y1={y(max * g)}
                y2={y(max * g)}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray={g === 0 ? undefined : '4 4'}
              />
            ))}
            {surligne !== undefined ? (
              <Line x1={x(surligne)} x2={x(surligne)} y1={marge.haut} y2={bas} stroke={colors.primary} strokeOpacity={0.25} strokeWidth={14} strokeLinecap="round" />
            ) : null}
            {series.map((s, rang) => (
              <SerieAnimee key={s.libelle} serie={s} points={s.valeurs.map((v, i) => ({ x: x(i), y: y(v) }))} bas={bas} cle={cle} rang={rang} />
            ))}
            {surligne !== undefined
              ? series.map((s) => (
                  <Circle key={s.libelle} cx={x(surligne)} cy={y(s.valeurs[surligne] ?? 0)} r={4.5} fill={colors.white} stroke={s.couleur} strokeWidth={2.5} />
                ))
              : null}
          </Svg>
        ) : null}
        {largeur > 0
          ? graduations.map((g) => (
              <Text key={g} className="absolute text-[10px] text-muted" style={{ left: 0, top: y(max * g) - 7, width: marge.gauche - 6, textAlign: 'right' }}>
                {abrege(max * g)}
              </Text>
            ))
          : null}
        {largeur > 0
          ? etiquettes.map((e, i) => (
              <Text
                key={i}
                className={`absolute text-[10px] ${i === surligne ? 'text-primary font-bold' : 'text-muted'}`}
                style={{ left: x(i) - 14, width: 28, top: bas + 6, textAlign: 'center' }}
              >
                {e}
              </Text>
            ))
          : null}
      </View>
      <View className="flex-row gap-4 mt-2">
        {series.map((s) => (
          <View key={s.libelle} className="flex-row items-center">
            <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: s.couleur }} />
            <Text className="text-xs text-muted ml-1.5">{s.libelle}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
