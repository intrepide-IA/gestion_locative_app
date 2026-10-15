import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { House, KeyRound, UserPlus, Users, Zap } from 'lucide-react-native';

import { LogoSymbole } from '../../components/brand/Logo';
import { Carte, EtatErreur, PastilleIcone } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { useRessource } from '../../hooks/useRessource';
import { listerLogements } from '../../repositories/logementRepository';
import { listerLocataires } from '../../repositories/locataireRepository';
import { getProprietaire } from '../../repositories/proprietaireRepository';
import { genererEcheances, syntheseDuMois, type SyntheseMois } from '../../repositories/loyerRepository';
import { listerSituationsElectricite, type SituationElectricite } from '../../repositories/electriciteRepository';
import { LIBELLES_STOCK } from '../../domain/electricite';
import { useNavigation } from '@react-navigation/native';
import { aujourdhui, formatFCFA, formatMois } from '../../domain/format';
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
  alertesElectricite: SituationElectricite[];
}

const lireSynthese = async (db: SqlDatabase): Promise<Synthese> => {
  const jour = aujourdhui();
  await genererEcheances(db, jour);
  const periode = { annee: Number(jour.slice(0, 4)), mois: Number(jour.slice(5, 7)) };
  const [proprietaire, logements, locataires, loyers, electricite] = await Promise.all([
    getProprietaire(db),
    listerLogements(db),
    listerLocataires(db),
    syntheseDuMois(db, periode.annee, periode.mois, jour),
    listerSituationsElectricite(db),
  ]);
  return {
    prenom: proprietaire?.nom.split(/\s+/)[0] ?? '',
    logements: logements.length,
    occupes: logements.filter((l) => l.contrat_id !== null).length,
    locatairesActifs: locataires.filter((l) => l.contrat_statut === 'actif').length,
    loyers,
    periode,
    alertesElectricite: electricite.filter((e) => e.etat !== 'ok'),
  };
};

const VIDE: Synthese = {
  prenom: '',
  logements: 0,
  occupes: 0,
  locatairesActifs: 0,
  loyers: { attendu: 0, regle: 0, reste: 0, encaisse: 0, enRetard: 0 },
  periode: { annee: 2026, mois: 1 },
  alertesElectricite: [],
};

export function AccueilScreen() {
  const { donnees: s, erreur, rafraichir } = useRessource(lireSynthese, VIDE);
  const [nouveauLogement, setNouveauLogement] = useState(false);
  const [nouveauLocataire, setNouveauLocataire] = useState(false);
  const navigation = useNavigation<{ navigate: (onglet: string, params?: object) => void }>();

  const taux = s.logements ? Math.round((s.occupes / s.logements) * 100) : 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-2xl font-bold text-ink">Bonjour{s.prenom ? `, ${s.prenom}` : ''}</Text>
            <Text className="text-muted">Voici un aperçu de votre maison</Text>
          </View>
          <LogoSymbole taille={44} />
        </View>

        {erreur ? <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} /> : null}

        <View className="bg-primary rounded-3xl p-5">
          <Text className="text-white/80">Loyers · {formatMois(s.periode.mois, s.periode.annee)}</Text>
          <Text className="text-white text-3xl font-bold mt-1">{formatFCFA(s.loyers.regle)}</Text>
          <Text className="text-white/80">réglés sur {formatFCFA(s.loyers.attendu)} attendus</Text>
          <View className="h-2 rounded-full bg-white/20 mt-3 overflow-hidden">
            <View
              className="h-full bg-accent rounded-full"
              style={{ width: `${s.loyers.attendu ? Math.round((s.loyers.regle / s.loyers.attendu) * 100) : 0}%` }}
            />
          </View>
          <View className="flex-row justify-between mt-3">
            <Text className="text-white/90">Reste à percevoir</Text>
            <Text className="text-accent font-bold">{formatFCFA(s.loyers.reste)}</Text>
          </View>
          {s.loyers.enRetard ? (
            <Text className="text-white mt-2 font-semibold">⚠ {s.loyers.enRetard} échéance(s) en retard — voir l’onglet Loyers</Text>
          ) : null}
        </View>

        <View className="flex-row gap-3">
          <Statistique icone={<House size={20} color={colors.white} />} valeur={taux} suffixe=" %" libelle={`Occupation (${s.occupes}/${s.logements})`} />
          <Statistique icone={<Users size={20} color={colors.white} />} valeur={s.locatairesActifs} libelle="Locataire(s) actif(s)" />
        </View>

        {s.alertesElectricite.length ? (
          <Carte onPress={() => navigation.navigate('Settings', { screen: 'Electricite' })}>
            <View className="flex-row items-center">
              <PastilleIcone ton="jaune">
                <Zap size={20} color="#8A6500" />
              </PastilleIcone>
              <View className="flex-1 ml-3">
                <Text className="font-semibold text-ink">Électricité : {s.alertesElectricite.length} alerte(s)</Text>
                <Text className="text-muted text-sm" numberOfLines={2}>
                  {s.alertesElectricite.map((e) => `${e.locataire_nom} (${LIBELLES_STOCK[e.etat].toLowerCase()})`).join(', ')}
                </Text>
              </View>
            </View>
          </Carte>
        ) : null}

        <Text className="text-xs font-bold text-muted uppercase tracking-wider mt-2">Actions rapides</Text>
        <View className="flex-row gap-3">
          <Raccourci icone={<KeyRound size={22} color={colors.primary} />} libelle="Ajouter un logement" onPress={() => setNouveauLogement(true)} />
          <Raccourci icone={<UserPlus size={22} color={colors.primary} />} libelle="Nouveau locataire" onPress={() => setNouveauLocataire(true)} />
        </View>

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

function Statistique({ icone, valeur, suffixe = '', libelle }: { icone: React.ReactNode; valeur: number; suffixe?: string; libelle: string }) {
  return (
    <Carte className="flex-1">
      <PastilleIcone>{icone}</PastilleIcone>
      <Text className="text-2xl font-bold text-ink mt-3">
        {valeur}
        {suffixe}
      </Text>
      <Text className="text-muted text-sm">{libelle}</Text>
    </Carte>
  );
}

function Raccourci({ icone, libelle, onPress }: { icone: React.ReactNode; libelle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-1 bg-white border border-border rounded-2xl p-4 items-center active:bg-background"
    >
      <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">{icone}</View>
      <Text className="text-sm font-semibold text-ink mt-2 text-center">{libelle}</Text>
    </Pressable>
  );
}
