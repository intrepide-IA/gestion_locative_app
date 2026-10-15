/**
 * Composants d'interface Onílé (d'après le guide de marque) : boutons, badges, cartes, champs, filtres, états.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { AlertCircle, CheckCircle2, Plus, Search, TriangleAlert } from 'lucide-react-native';

import { Text } from './Text';
import { FONT_FAMILY } from '../../theme/fonts';
import { colors } from '../../theme/colors';

/* ---------- Boutons ---------- */

type VarianteBouton = 'principal' | 'secondaire' | 'action' | 'danger' | 'discret';

const STYLES_BOUTON: Record<VarianteBouton, { fond: string; texte: string }> = {
  principal: { fond: 'bg-primary', texte: 'text-white' },
  secondaire: { fond: 'bg-white border-2 border-primary', texte: 'text-primary' },
  action: { fond: 'bg-accent', texte: 'text-ink' },
  danger: { fond: 'bg-white border-2 border-danger', texte: 'text-danger' },
  discret: { fond: 'bg-transparent', texte: 'text-primary' },
};

export function Bouton({
  titre,
  onPress,
  variante = 'principal',
  icone,
  chargement = false,
  desactive = false,
  className = '',
}: {
  titre: string;
  onPress: () => void;
  variante?: VarianteBouton;
  icone?: ReactNode;
  chargement?: boolean;
  desactive?: boolean;
  className?: string;
}) {
  const s = STYLES_BOUTON[variante];
  const inactif = desactive || chargement;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactif}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactif, busy: chargement }}
      className={`${s.fond} flex-row items-center justify-center rounded-xl px-5 py-3.5 active:opacity-80 ${inactif ? 'opacity-50' : ''} ${className}`}
    >
      {chargement ? (
        <ActivityIndicator color={variante === 'principal' ? colors.white : colors.primary} />
      ) : (
        <>
          {icone ? <View className="mr-2">{icone}</View> : null}
          <Text className={`${s.texte} font-semibold text-base`}>{titre}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Bouton flottant « + » en bas à droite. */
export function BoutonFlottant({ onPress, libelle }: { onPress: () => void; libelle: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      className="absolute right-5 bottom-6 w-14 h-14 rounded-full bg-primary items-center justify-center shadow-lg active:opacity-80"
    >
      <Plus size={28} color={colors.white} />
    </Pressable>
  );
}

/* ---------- Badges de statut (couleur + libellé + icône) ---------- */

type TonBadge = 'succes' | 'attention' | 'erreur' | 'neutre';

const STYLES_BADGE: Record<TonBadge, { fond: string; texte: string; couleur: string }> = {
  succes: { fond: 'bg-secondary/15', texte: 'text-primary', couleur: colors.primary },
  attention: { fond: 'bg-accent/20', texte: 'text-[#8A6500]', couleur: '#8A6500' },
  erreur: { fond: 'bg-danger/10', texte: 'text-[#B91C1C]', couleur: '#B91C1C' },
  neutre: { fond: 'bg-border', texte: 'text-muted', couleur: colors.muted },
};

export function Badge({ libelle, ton }: { libelle: string; ton: TonBadge }) {
  const s = STYLES_BADGE[ton];
  const Icone = ton === 'succes' ? CheckCircle2 : ton === 'erreur' ? AlertCircle : ton === 'attention' ? TriangleAlert : null;
  return (
    <View className={`${s.fond} flex-row items-center rounded-full px-2.5 py-1`}>
      {Icone ? <Icone size={12} color={s.couleur} /> : null}
      <Text className={`${s.texte} text-xs font-semibold ${Icone ? 'ml-1' : ''}`}>{libelle}</Text>
    </View>
  );
}

/* ---------- Cartes ---------- */

export function Carte({ children, onPress, className = '' }: { children: ReactNode; onPress?: () => void; className?: string }) {
  const base = `bg-white rounded-2xl border border-border p-4 ${className}`;
  if (!onPress) return <View className={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className={`${base} active:bg-background`}>
      {children}
    </Pressable>
  );
}

/** Pastille d'icône verte (cartes d'information du guide). */
export function PastilleIcone({ children, ton = 'vert' }: { children: ReactNode; ton?: 'vert' | 'jaune' | 'gris' }) {
  const fond = ton === 'vert' ? 'bg-primary' : ton === 'jaune' ? 'bg-accent/20' : 'bg-border';
  return <View className={`w-11 h-11 rounded-xl items-center justify-center ${fond}`}>{children}</View>;
}

/* ---------- En-tête d'écran ---------- */

export function EnTete({ titre, sousTitre, droite }: { titre: string; sousTitre?: string; droite?: ReactNode }) {
  return (
    <View className="flex-row items-end justify-between px-5 pt-4 pb-3">
      <View className="flex-1">
        <Text className="text-2xl font-bold text-ink" accessibilityRole="header">
          {titre}
        </Text>
        {sousTitre ? <Text className="text-muted mt-0.5">{sousTitre}</Text> : null}
      </View>
      {droite}
    </View>
  );
}

/* ---------- Champs ---------- */

export function Champ({
  libelle,
  erreur,
  aide,
  obligatoire,
  ...props
}: TextInputProps & { libelle: string; erreur?: string; aide?: string; obligatoire?: boolean }) {
  return (
    <View>
      <Text className="text-sm font-medium text-ink mb-1.5">
        {libelle}
        {obligatoire ? <Text className="text-danger"> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={libelle}
        {...props}
        style={[{ fontFamily: FONT_FAMILY }, props.style]}
        className={`bg-white border rounded-xl px-4 py-3 text-base text-ink ${erreur ? 'border-danger' : 'border-border'}`}
      />
      {erreur ? (
        <Text className="text-danger text-xs mt-1">{erreur}</Text>
      ) : aide ? (
        <Text className="text-muted text-xs mt-1">{aide}</Text>
      ) : null}
    </View>
  );
}

export function BarreRecherche({ valeur, onChange, placeholder }: { valeur: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View className="mx-5 mb-3 flex-row items-center bg-white border border-border rounded-xl px-3">
      <Search size={18} color={colors.muted} />
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={placeholder}
        style={{ fontFamily: FONT_FAMILY }}
        className="flex-1 py-3 px-2 text-base text-ink"
      />
    </View>
  );
}

/* ---------- Filtres (pastilles) ---------- */

export function Filtres<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: { valeur: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap px-5 mb-3 gap-2">
      {options.map((o) => {
        const actif = o.valeur === valeur;
        return (
          <Pressable
            key={o.valeur}
            onPress={() => onChange(o.valeur)}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            className={`px-4 py-2 rounded-full border ${actif ? 'bg-primary border-primary' : 'bg-white border-border'}`}
          >
            <Text className={`text-sm font-medium ${actif ? 'text-white' : 'text-ink'}`}>{o.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Choix unique sous forme de pastilles (type de logement, logement libre…). */
export function Choix<T extends string | number>({
  libelle,
  options,
  valeur,
  onChange,
  erreur,
}: {
  libelle: string;
  options: { valeur: T; libelle: string; detail?: string }[];
  valeur: T | null;
  onChange: (v: T) => void;
  erreur?: string;
}) {
  return (
    <View>
      <Text className="text-sm font-medium text-ink mb-1.5">{libelle}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const actif = o.valeur === valeur;
          return (
            <Pressable
              key={String(o.valeur)}
              onPress={() => onChange(o.valeur)}
              accessibilityRole="radio"
              accessibilityState={{ checked: actif }}
              className={`px-4 py-2.5 rounded-xl border ${actif ? 'bg-primary/10 border-primary' : 'bg-white border-border'}`}
            >
              <Text className={`text-sm font-semibold ${actif ? 'text-primary' : 'text-ink'}`}>{o.libelle}</Text>
              {o.detail ? <Text className="text-xs text-muted">{o.detail}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {erreur ? <Text className="text-danger text-xs mt-1">{erreur}</Text> : null}
    </View>
  );
}

/* ---------- États ---------- */

export function EtatVide({ icone, titre, message, action }: { icone: ReactNode; titre: string; message: string; action?: ReactNode }) {
  return (
    <View className="items-center px-8 py-12">
      <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-4">{icone}</View>
      <Text className="text-lg font-semibold text-ink text-center">{titre}</Text>
      <Text className="text-muted text-center mt-1 mb-5">{message}</Text>
      {action}
    </View>
  );
}

export function EtatErreur({ message, onReessayer }: { message: string; onReessayer: () => void }) {
  return (
    <View className="items-center px-8 py-12">
      <AlertCircle size={36} color={colors.danger} />
      <Text className="text-lg font-semibold text-ink text-center mt-3">Chargement impossible</Text>
      <Text className="text-muted text-center mt-1 mb-5">{message}</Text>
      <Bouton titre="Réessayer" variante="secondaire" onPress={onReessayer} />
    </View>
  );
}

export function Chargement() {
  return (
    <View className="py-16 items-center">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/** Ligne « libellé — valeur » pour les fiches de détail. */
export function LigneInfo({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  return (
    <View className="flex-row justify-between items-center py-2.5 border-b border-border">
      <Text className="text-muted">{libelle}</Text>
      {typeof valeur === 'string' ? <Text className="text-ink font-medium">{valeur}</Text> : valeur}
    </View>
  );
}
