/**
 * Visite guidée : sur chaque écran, une flèche animée pointe un bouton et une bulle explique à quoi il sert,
 * étape par étape. Chaque étape vue est retenue sur l'appareil : un nouvel utilisateur voit tout, et après
 * une mise à jour, seules les étapes ajoutées (nouvelles fonctionnalités) sont présentées.
 *
 *   <Cible id="accueil.notifications">…bouton…</Cible>        marque un élément à montrer
 *   useVisite('accueil', VISITES.accueil, { defiler })          propose la visite quand l'écran est affiché
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { ArrowBigDown, ArrowBigUp, Sparkles } from 'lucide-react-native';

import { Text } from '../ui/Text';
import { ecrirePreferences, lirePreferences } from '../../services/preferences';
import { colors } from '../../theme/colors';

export interface EtapeVisite {
  /** Identifiant de la cible (voir <Cible id>). */
  cible: string;
  titre: string;
  texte: string;
  /** Fonctionnalité récente : badge « Nouveau ». */
  nouveau?: boolean;
  /** Élément fixe (barre d'onglets) : ne pas faire défiler l'écran pour le montrer. */
  fixe?: boolean;
}

type Rect = { x: number; y: number; w: number; h: number };
type Defiler = (decalage: number) => void;

interface Contexte {
  enregistrer: (id: string, vue: View | null) => void;
  proposer: (nom: string, etapes: EtapeVisite[], defiler?: Defiler) => void;
  /** Efface les étapes vues : la visite reprend sur chaque écran. */
  reinitialiser: () => Promise<void>;
}

const Ctx = createContext<Contexte | null>(null);
const CLE_VUES = 'visite.vues';
const MARGE = 6;

const cleEtape = (nom: string, e: EtapeVisite) => `${nom}:${e.cible}`;

function mesurer(vue: View): Promise<Rect | null> {
  return new Promise((resolve) => {
    try {
      vue.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null));
    } catch {
      resolve(null);
    }
  });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function FournisseurVisite({ children }: { children: ReactNode }) {
  const cibles = useRef(new Map<string, View>());
  const vues = useRef<Set<string> | null>(null);
  const occupee = useRef(false);
  const [visite, setVisite] = useState<{ nom: string; etapes: EtapeVisite[]; index: number; defiler?: Defiler } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [taille, setTaille] = useState({ l: 0, h: 0 });

  const chargerVues = useCallback(async () => {
    if (!vues.current) {
      const p = await lirePreferences();
      vues.current = new Set(Array.isArray(p[CLE_VUES]) ? (p[CLE_VUES] as string[]) : []);
    }
    return vues.current;
  }, []);

  const retenir = useCallback(
    async (cles: string[]) => {
      const v = await chargerVues();
      cles.forEach((c) => v.add(c));
      const p = await lirePreferences();
      await ecrirePreferences({ ...p, [CLE_VUES]: [...v] });
    },
    [chargerVues]
  );

  const enregistrer = useCallback((id: string, vue: View | null) => {
    if (vue) cibles.current.set(id, vue);
    else cibles.current.delete(id);
  }, []);

  const proposer = useCallback(
    async (nom: string, etapes: EtapeVisite[], defiler?: Defiler) => {
      if (occupee.current) return;
      occupee.current = true;
      const v = await chargerVues();
      const aMontrer = etapes.filter((e) => !v.has(cleEtape(nom, e)) && cibles.current.has(e.cible));
      if (!aMontrer.length) {
        occupee.current = false;
        return;
      }
      setRect(null);
      setVisite({ nom, etapes: aMontrer, index: 0, defiler });
    },
    [chargerVues]
  );

  const terminer = useCallback(() => {
    setVisite(null);
    setRect(null);
    occupee.current = false;
  }, []);

  // Affiche l'étape courante : fait défiler si la cible est hors de l'écran, puis la mesure.
  useEffect(() => {
    if (!visite) return;
    let annule = false;
    const etape = visite.etapes[visite.index];
    (async () => {
      setRect(null);
      const vue = cibles.current.get(etape.cible);
      let r = vue ? await mesurer(vue) : null;
      const hauteur = taille.h || 800;
      if (r && !etape.fixe && visite.defiler && (r.y < 80 || r.y + r.h > hauteur - 140)) {
        visite.defiler(r.y - hauteur * 0.3);
        // On attend la fin du défilement : deux mesures identiques de suite (au plus ~2 s).
        let precedente: Rect | null = null;
        for (let i = 0; i < 12; i++) {
          await pause(160);
          r = vue ? await mesurer(vue) : null;
          if (r && precedente && Math.abs(r.y - precedente.y) < 1) break;
          precedente = r;
        }
      }
      if (annule) return;
      // Hors de l'écran malgré le défilement : on ne la montre pas maintenant (elle reviendra plus tard).
      if (r && (r.y + r.h < 0 || r.y > hauteur)) r = null;
      if (r) void retenir([cleEtape(visite.nom, etape)]);
      if (!r) {
        // Cible absente (élément masqué) : étape suivante.
        if (visite.index < visite.etapes.length - 1) setVisite({ ...visite, index: visite.index + 1 });
        else terminer();
        return;
      }
      setRect(r);
    })();
    return () => {
      annule = true;
    };
  }, [visite, retenir, terminer, taille.h]);

  const valeur = useMemo<Contexte>(
    () => ({
      enregistrer,
      proposer: (nom, etapes, defiler) => void proposer(nom, etapes, defiler),
      reinitialiser: async () => {
        vues.current = new Set();
        const p = await lirePreferences();
        await ecrirePreferences({ ...p, [CLE_VUES]: [] });
      },
    }),
    [enregistrer, proposer]
  );

  const passer = () => {
    if (visite) void retenir(visite.etapes.map((e) => cleEtape(visite.nom, e)));
    terminer();
  };

  return (
    <Ctx.Provider value={valeur}>
      {children}
      {/* Créée à l'ouverture seulement : elle passe au-dessus d'une feuille ou d'un aperçu déjà ouverts. */}
      {visite ? (
        <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={passer}>
          <View style={{ flex: 1 }} onLayout={(e) => setTaille({ l: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {rect && taille.h ? (
              <Calque
                rect={rect}
                taille={taille}
                etape={visite.etapes[visite.index]}
                position={visite.index}
                total={visite.etapes.length}
                onPrecedent={visite.index > 0 ? () => setVisite({ ...visite, index: visite.index - 1 }) : undefined}
                onSuivant={() => (visite.index < visite.etapes.length - 1 ? setVisite({ ...visite, index: visite.index + 1 }) : terminer())}
                onPasser={passer}
              />
            ) : (
              <View style={{ flex: 1, backgroundColor: 'rgba(10,20,15,0.35)' }} />
            )}
          </View>
        </Modal>
      ) : null}
    </Ctx.Provider>
  );
}

const VOILE = 'rgba(10,20,15,0.72)';

function Calque({
  rect,
  taille,
  etape,
  position,
  total,
  onPrecedent,
  onSuivant,
  onPasser,
}: {
  rect: Rect;
  taille: { l: number; h: number };
  etape: EtapeVisite;
  position: number;
  total: number;
  onPrecedent?: () => void;
  onSuivant: () => void;
  onPasser: () => void;
}) {
  const trou = {
    x: Math.max(4, rect.x - MARGE),
    y: Math.max(4, rect.y - MARGE),
    w: Math.min(rect.w + MARGE * 2, taille.l - 8),
    h: rect.h + MARGE * 2,
  };
  const enHaut = trou.y + trou.h / 2 < taille.h / 2;
  const largeurBulle = Math.min(taille.l - 32, 360);
  const gauche = Math.min(Math.max(16, trou.x + trou.w / 2 - largeurBulle / 2), taille.l - largeurBulle - 16);
  const flecheX = Math.min(Math.max(12, trou.x + trou.w / 2 - 20), taille.l - 52);

  const [rebond] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(rebond, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(rebond, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    boucle.start();
    return () => boucle.stop();
  }, [rebond]);
  const decalage = rebond.interpolate({ inputRange: [0, 1], outputRange: [0, enHaut ? 8 : -8] });

  const dernier = position === total - 1;
  return (
    <>
      {/* Voile autour de l'élément montré (4 bandes), qui reste visible et net. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: trou.y, backgroundColor: VOILE }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: trou.y + trou.h, bottom: 0, backgroundColor: VOILE }} />
      <View style={{ position: 'absolute', left: 0, width: trou.x, top: trou.y, height: trou.h, backgroundColor: VOILE }} />
      <View style={{ position: 'absolute', left: trou.x + trou.w, right: 0, top: trou.y, height: trou.h, backgroundColor: VOILE }} />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: trou.x, top: trou.y, width: trou.w, height: trou.h, borderRadius: 16, borderWidth: 3, borderColor: colors.accent }}
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: flecheX,
          top: enHaut ? trou.y + trou.h + 4 : trou.y - 46,
          transform: [{ translateY: decalage }],
        }}
      >
        {enHaut ? <ArrowBigUp size={40} color={colors.accent} fill={colors.accent} /> : <ArrowBigDown size={40} color={colors.accent} fill={colors.accent} />}
      </Animated.View>

      <View
        accessibilityRole="alert"
        style={{
          position: 'absolute',
          left: gauche,
          width: largeurBulle,
          ...(enHaut ? { top: Math.min(trou.y + trou.h + 50, taille.h - 230) } : { bottom: Math.min(taille.h - trou.y + 50, taille.h - 230) }),
          backgroundColor: colors.white,
          borderRadius: 20,
          padding: 18,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        {etape.nouveau ? (
          <View className="flex-row items-center self-start rounded-full bg-accent/25 px-2.5 py-1 mb-2">
            <Sparkles size={13} color="#8A6500" />
            <Text className="text-[11px] font-bold text-[#8A6500] ml-1">NOUVEAU</Text>
          </View>
        ) : null}
        <Text className="text-lg font-bold text-ink">{etape.titre}</Text>
        <Text className="text-muted mt-1.5" style={{ lineHeight: 21 }}>
          {etape.texte}
        </Text>
        <View className="flex-row items-center mt-4">
          <Text className="text-xs text-muted flex-1">
            {position + 1} / {total}
          </Text>
          {!dernier ? (
            <Pressable onPress={onPasser} accessibilityRole="button" hitSlop={8} className="px-2 py-2 mr-1">
              <Text className="text-muted font-medium">Passer</Text>
            </Pressable>
          ) : null}
          {onPrecedent ? (
            <Pressable onPress={onPrecedent} accessibilityRole="button" hitSlop={8} className="px-3 py-2 mr-1">
              <Text className="text-primary font-semibold">Précédent</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onSuivant} accessibilityRole="button" className="bg-primary rounded-xl px-4 py-2.5 active:opacity-80">
            <Text className="text-white font-semibold">{dernier ? 'Compris' : 'Suivant'}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

/** Marque un élément que la visite peut montrer (une seule fois par identifiant à l'écran). */
export function Cible({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ctx = useContext(Ctx);
  const ref = useCallback((vue: View | null) => ctx?.enregistrer(id, vue), [ctx, id]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

/** Propose la visite d'un écran de navigation quand il est affiché (et que ses données sont prêtes). */
export function useVisite(nom: string, etapes: EtapeVisite[], options: { pret?: boolean; defiler?: Defiler } = {}) {
  const focus = useIsFocused();
  useVisiteSi(nom, etapes, focus && (options.pret ?? true), options.defiler);
}

/** Variante sans navigation (feuilles, aperçu de document) : proposée quand `actif` devient vrai. */
export function useVisiteSi(nom: string, etapes: EtapeVisite[], actif: boolean, defiler?: Defiler) {
  const ctx = useContext(Ctx);
  const defilerRef = useRef(defiler);
  useEffect(() => {
    defilerRef.current = defiler;
  }, [defiler]);
  useEffect(() => {
    if (!ctx || !actif) return;
    const t = setTimeout(() => ctx.proposer(nom, etapes, defilerRef.current ? (d) => defilerRef.current?.(d) : undefined), 900);
    return () => clearTimeout(t);
  }, [ctx, actif, nom, etapes]);
}

export function useReinitialiserVisite(): () => Promise<void> {
  const ctx = useContext(Ctx);
  return ctx?.reinitialiser ?? (async () => undefined);
}

/** Défilement d'un ScrollView piloté par la visite : garder l'élément montré dans l'écran. */
export function useDefilementVisite() {
  const ref = useRef<{ scrollTo: (o: { y: number; animated: boolean }) => void } | null>(null);
  const position = useRef(0);
  const defiler = useCallback<Defiler>((d) => ref.current?.scrollTo({ y: Math.max(0, position.current + d), animated: true }), []);
  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    position.current = e.nativeEvent.contentOffset.y;
  }, []);
  /** À passer en `ref` du ScrollView. */
  const attacher = useCallback((vue: { scrollTo: (o: { y: number; animated: boolean }) => void } | null) => {
    ref.current = vue;
  }, []);
  return { attacher, defiler, onScroll };
}
