import { useMemo, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Eraser } from 'lucide-react-native';

import { Text } from './Text';
import { Bouton } from './kit';
import { colors } from '../../theme/colors';

type Point = { x: number; y: number };

/** Trait lissé : courbes passant par le milieu des segments successifs. */
function tracer(points: Point[]): string {
  if (points.length === 0) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  if (points.length < 3) return `M${f(points[0].x)},${f(points[0].y)} ${points.map((p) => `L${f(p.x)},${f(p.y)}`).join(' ')}`;
  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const milieu = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += ` Q${f(points[i].x)},${f(points[i].y)} ${f(milieu.x)},${f(milieu.y)}`;
  }
  const dernier = points[points.length - 1];
  return `${d} L${f(dernier.x)},${f(dernier.y)}`;
}

/** Image SVG « data: » des traits (encre bleu nuit, fond transparent). */
export function signatureEnImage(traits: Point[][], largeur: number, hauteur: number): string {
  const chemins = traits
    .filter((t) => t.length)
    .map((t) => `<path d="${tracer(t)}" fill="none" stroke="#1E2A5A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(largeur)} ${Math.round(hauteur)}" width="${Math.round(
    largeur
  )}" height="${Math.round(hauteur)}">${chemins}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Zone de signature au doigt. « Valider » renvoie une image SVG ; rien n'est enregistré avant.
 */
export function PadSignature({ nom, onValider, chargement }: { nom: string; onValider: (image: string) => void; chargement?: boolean }) {
  const [traits, setTraits] = useState<Point[][]>([]);
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });

  const repondeur = useMemo(() => {
    const point = (e: { nativeEvent: { locationX: number; locationY: number } }) => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
    // Le dernier trait de la liste est celui en cours de tracé.
    const prolonger = (p: Point) =>
      setTraits((t) => (t.length ? [...t.slice(0, -1), [...t[t.length - 1], p]] : [[p]]));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // La signature ne doit pas faire défiler la feuille qui la contient.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const p = point(e);
        setTraits((t) => [...t, [p]]);
      },
      onPanResponderMove: (e) => prolonger(point(e)),
      onPanResponderRelease: () =>
        // Un simple toucher laisse un point visible.
        setTraits((t) => {
          const dernier = t[t.length - 1];
          return dernier?.length === 1 ? [...t.slice(0, -1), [dernier[0], { x: dernier[0].x + 0.5, y: dernier[0].y + 0.5 }]] : t;
        }),
    });
  }, []);

  const vide = traits.length === 0;
  return (
    <View className="gap-3">
      <View
        className="bg-white rounded-2xl border-2 border-dashed border-border overflow-hidden"
        style={{ height: 200 }}
        onLayout={(e) => setTaille({ largeur: e.nativeEvent.layout.width, hauteur: e.nativeEvent.layout.height })}
        {...repondeur.panHandlers}
      >
        <Svg width="100%" height="100%">
          {traits.map((t, i) => (
            <Path key={i} d={tracer(t)} fill="none" stroke="#1E2A5A" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        <View pointerEvents="none" className="absolute left-5 right-5 bottom-10 border-b border-border" />
        <Text pointerEvents="none" className="absolute left-5 bottom-3 text-xs text-muted">
          {vide ? 'Signez ici avec le doigt' : nom}
        </Text>
        {!vide ? (
          <Pressable
            onPress={() => setTraits([])}
            accessibilityRole="button"
            accessibilityLabel="Effacer la signature"
            className="absolute top-2 right-2 flex-row items-center bg-background rounded-full px-3 py-1.5"
          >
            <Eraser size={14} color={colors.muted} />
            <Text className="text-xs text-muted ml-1">Effacer</Text>
          </Pressable>
        ) : null}
      </View>
      <Bouton
        titre="Valider la signature"
        onPress={() => onValider(signatureEnImage(traits, taille.largeur, taille.hauteur))}
        desactive={vide}
        chargement={chargement}
      />
    </View>
  );
}
