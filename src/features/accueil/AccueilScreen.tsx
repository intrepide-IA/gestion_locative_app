import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  AlertCircle,
  Bell,
  ChevronRight,
  Database,
  House,
  KeyRound,
  Receipt,
  Settings,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Cible, useDefilementVisite, useVisite } from '../../components/visite/Visite';
import { VISITES } from '../../components/visite/visites';

import { LogoSymbole } from '../../components/brand/Logo';
import { BoutonMaison } from '../../components/maisons/Maisons';
import { Carte, EtatErreur } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatFCFA, formatMois, initiales } from '../../domain/format';
import type { Alerte } from '../../domain/rappels';
import { useRessource } from '../../hooks/useRessource';
import { listerLogements } from '../../repositories/logementRepository';
import { listerLocataires } from '../../repositories/locataireRepository';
import { genererEcheances, syntheseDuMois, type SyntheseMois } from '../../repositories/loyerRepository';
import { getProprietaire } from '../../repositories/proprietaireRepository';
import { listerAlertes } from '../../repositories/rappelsRepository';
import { synchroniserNotifications } from '../../services/notifications';
import { colors } from '../../theme/colors';
import { EntreeLocataireForm } from '../locataires/EntreeLocataireForm';
import { LogementForm } from '../logements/LogementForm';

interface Synthese {
  prenom: string;
  logements: number;
  occupes: number;
  locatairesActifs: number;
  loyers: SyntheseMois;
  periode: { annee: number; mois: number };
  alertes: Alerte[];
}

const lireSynthese = async (db: SqlDatabase): Promise<Synthese> => {
  const jour = aujourdhui();
  await genererEcheances(db, jour);
  void synchroniserNotifications();
  const periode = { annee: Number(jour.slice(0, 4)), mois: Number(jour.slice(5, 7)) };
  const [proprietaire, logements, locataires, loyers, alertes] = await Promise.all([
    getProprietaire(db),
    listerLogements(db),
    listerLocataires(db),
    syntheseDuMois(db, periode.annee, periode.mois, jour),
    listerAlertes(db, jour),
  ]);
  return {
    prenom: proprietaire?.nom.split(/\s+/)[0] ?? '',
    logements: logements.length,
    occupes: logements.filter((l) => l.contrat_id !== null).length,
    locatairesActifs: locataires.filter((l) => l.contrat_statut === 'actif').length,
    loyers,
    periode,
    alertes,
  };
};

const VIDE: Synthese = {
  prenom: '',
  logements: 0,
  occupes: 0,
  locatairesActifs: 0,
  loyers: { attendu: 0, regle: 0, reste: 0, encaisse: 0, enRetard: 0 },
  periode: { annee: 2026, mois: 1 },
  alertes: [],
};

type Nav = { navigate: (ecran: string, params?: object) => void };

function salutation(): string {
  const h = new Date().getHours();
  return h < 18 ? 'Bonjour' : 'Bonsoir';
}

export function AccueilScreen() {
  const { donnees: s, erreur, rafraichir } = useRessource(lireSynthese, VIDE);
  const [nouveauLogement, setNouveauLogement] = useState(false);
  const [nouveauLocataire, setNouveauLocataire] = useState(false);
  const navigation = useNavigation<Nav>();
  const { attacher: attacherDefilement, onScroll: suivreDefilement, defiler } = useDefilementVisite();
  useVisite('accueil', VISITES.accueil, { defiler });

  const taux = s.logements ? Math.round((s.occupes / s.logements) * 100) : 0;
  const part = s.loyers.attendu ? Math.min(1, s.loyers.regle / s.loyers.attendu) : 0;
  const aTraiter = s.alertes.filter((a) => a.gravite !== 'info').length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        ref={attacherDefilement}
        onScroll={suivreDefilement}
        scrollEventThrottle={32}
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
      >
        <View className="flex-row items-center">
          <LogoSymbole taille={40} />
          <View className="flex-1 ml-3">
            <Text className="text-xl font-bold text-ink" numberOfLines={1}>
              {salutation()}
              {s.prenom ? `, ${s.prenom}` : ''}
            </Text>
            <Cible id="accueil.maison" style={{ alignSelf: 'flex-start' }}>
              <BoutonMaison />
            </Cible>
          </View>
          <Cible id="accueil.notifications">
            <BoutonRond
              libelle={aTraiter ? `Notifications, ${aTraiter} à traiter` : 'Notifications'}
              onPress={() => navigation.navigate('Notifications')}
              pastille={aTraiter}
            >
              <Bell size={20} color={colors.ink} />
            </BoutonRond>
          </Cible>
          <Cible id="accueil.parametres">
            <BoutonRond libelle="Paramètres" onPress={() => navigation.navigate('Parametres')}>
              <Settings size={20} color={colors.ink} />
            </BoutonRond>
          </Cible>
        </View>

        {erreur ? <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} /> : null}

        <Cible id="accueil.loyers">
        <Pressable onPress={() => navigation.navigate('Invoices')} accessibilityRole="button" className="bg-primary rounded-3xl p-5 overflow-hidden">
          <View className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5" />
          <View className="absolute right-8 -bottom-20 w-36 h-36 rounded-full bg-accent/10" />
          <Text className="text-white/80">Loyers de {formatMois(s.periode.mois, s.periode.annee)}</Text>
          <Text className="text-white text-3xl font-bold mt-1">{formatFCFA(s.loyers.regle)}</Text>
          <Text className="text-white/80">encaissés sur {formatFCFA(s.loyers.attendu)} attendus</Text>
          <BarreProgression part={part} />
          <View className="flex-row justify-between mt-3">
            <Text className="text-white/90">Reste à percevoir</Text>
            <Text className="text-accent font-bold">{formatFCFA(s.loyers.reste)}</Text>
          </View>
          {s.loyers.enRetard ? (
            <View className="flex-row items-center mt-3 bg-white/10 rounded-xl px-3 py-2">
              <AlertCircle size={16} color={colors.accent} />
              <Text className="text-white ml-2 font-medium flex-1">{s.loyers.enRetard} échéance(s) en retard</Text>
              <ChevronRight size={16} color={colors.white} />
            </View>
          ) : null}
        </Pressable>
        </Cible>

        <View className="flex-row gap-3">
          <Chiffre
            icone={<House size={18} color={colors.primary} />}
            libelle={`Occupation · ${s.occupes}/${s.logements}`}
            valeur={`${taux} %`}
            onPress={() => navigation.navigate('Properties')}
          />
          <Chiffre
            icone={<Users size={18} color={colors.primary} />}
            libelle="Locataires actifs"
            valeur={String(s.locatairesActifs)}
            onPress={() => navigation.navigate('Tenants')}
          />
        </View>

        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-xs font-bold text-muted uppercase tracking-wider">À traiter</Text>
          {s.alertes.length ? (
            <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={8} accessibilityRole="button">
              <Text className="text-primary font-medium text-sm">Tout voir ({s.alertes.length})</Text>
            </Pressable>
          ) : null}
        </View>
        {s.alertes.length === 0 ? (
          <Carte>
            <Text className="text-ink font-semibold">Tout est à jour</Text>
            <Text className="text-muted text-sm mt-0.5">Aucun retard ni alerte pour le moment.</Text>
          </Carte>
        ) : (
          <View className="bg-white rounded-2xl border border-border overflow-hidden">
            {s.alertes.slice(0, 3).map((a, i, liste) => (
              <LigneAlerte key={a.cle} alerte={a} dernier={i === liste.length - 1} onPress={() => navigation.navigate('Notifications')} />
            ))}
          </View>
        )}

        <Text className="text-xs font-bold text-muted uppercase tracking-wider mt-1">Actions rapides</Text>
        <Cible id="accueil.actions">
        <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
          <Raccourci icone={<Wallet size={22} color={colors.primary} />} libelle="Encaisser un loyer" onPress={() => navigation.navigate('Invoices')} />
          <Raccourci icone={<Receipt size={22} color={colors.primary} />} libelle="Ajouter une dépense" onPress={() => navigation.navigate('Finances')} />
          <Raccourci icone={<Zap size={22} color={colors.primary} />} libelle="Électricité" onPress={() => navigation.navigate('Electricite')} />
          <Raccourci icone={<KeyRound size={22} color={colors.primary} />} libelle="Ajouter un logement" onPress={() => setNouveauLogement(true)} />
          <Raccourci icone={<UserPlus size={22} color={colors.primary} />} libelle="Nouveau locataire" onPress={() => setNouveauLocataire(true)} />
          <Raccourci icone={<Database size={22} color={colors.primary} />} libelle="Sauvegarde" onPress={() => navigation.navigate('Sauvegarde')} />
        </View>
        </Cible>
      </ScrollView>

      <LogementForm
        ouverte={nouveauLogement}
        onFermer={() => setNouveauLogement(false)}
        onEnregistre={() => {
          setNouveauLogement(false);
          rafraichir();
        }}
      />
      <EntreeLocataireForm
        ouverte={nouveauLocataire}
        onFermer={() => setNouveauLocataire(false)}
        onEnregistre={() => {
          setNouveauLocataire(false);
          rafraichir();
        }}
      />
    </SafeAreaView>
  );
}

/** Barre de progression des loyers, qui se remplit en douceur. */
function BarreProgression({ part }: { part: number }) {
  const largeur = useSharedValue(0);
  useEffect(() => {
    largeur.set(withTiming(part, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [part, largeur]);
  // Tout le style dans le style animé : sur Android, la partie fixe d'un tableau de styles peut être perdue.
  const style = useAnimatedStyle(() => ({ width: `${largeur.value * 100}%`, height: '100%', borderRadius: 999, backgroundColor: colors.accent }));
  return (
    <View className="h-2.5 rounded-full bg-white/20 mt-4 overflow-hidden">
      <Animated.View style={style} />
    </View>
  );
}

function BoutonRond({ children, libelle, onPress, pastille }: { children: ReactNode; libelle: string; onPress: () => void; pastille?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      className="w-11 h-11 rounded-full bg-white border border-border items-center justify-center ml-2 active:bg-background"
    >
      {children}
      {pastille ? (
        <View
          className="absolute items-center justify-center rounded-full bg-danger border-2 border-background"
          style={{ top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 4 }}
        >
          <Text className="text-white text-[10px] font-bold">{pastille > 9 ? '9+' : pastille}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Chiffre({ icone, libelle, valeur, onPress }: { icone: ReactNode; libelle: string; valeur: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-1 bg-white border border-border rounded-2xl p-4 active:bg-background">
      <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">{icone}</View>
      <Text className="text-ink font-bold text-2xl mt-3">{valeur}</Text>
      <Text className="text-muted text-sm" numberOfLines={1}>
        {libelle}
      </Text>
    </Pressable>
  );
}

const POINT_GRAVITE = { urgent: colors.danger, attention: colors.accent, info: null } as const;

function LigneAlerte({ alerte: a, dernier, onPress }: { alerte: Alerte; dernier: boolean; onPress: () => void }) {
  const point = POINT_GRAVITE[a.gravite];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center px-4 py-3 active:bg-background ${dernier ? '' : 'border-b border-border'}`}
    >
      <View className="w-9 h-9 rounded-full bg-background items-center justify-center">
        {a.qui ? <Text className="text-ink font-semibold text-sm">{initiales(a.qui)}</Text> : <Database size={16} color={colors.muted} />}
      </View>
      <View className="flex-1 ml-3">
        <Text className="font-semibold text-ink" numberOfLines={1}>
          {a.qui ?? a.titre}
        </Text>
        <Text className="text-muted text-sm" numberOfLines={1}>
          {a.qui ? a.titre : a.detail}
        </Text>
      </View>
      {point ? <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: point }} /> : null}
      <ChevronRight size={16} color={colors.muted} />
    </Pressable>
  );
}

function Raccourci({ icone, libelle, onPress }: { icone: ReactNode; libelle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="bg-white border border-border rounded-2xl p-3 items-center active:bg-background"
      style={{ width: '31.5%' }}
    >
      <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">{icone}</View>
      <Text className="text-xs font-semibold text-ink mt-2 text-center" numberOfLines={2}>
        {libelle}
      </Text>
    </Pressable>
  );
}
