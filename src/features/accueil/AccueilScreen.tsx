import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { House, KeyRound, UserPlus, Users } from 'lucide-react-native';

import { LogoSymbole } from '../../components/brand/Logo';
import { Carte, EtatErreur, PastilleIcone } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { useRessource } from '../../hooks/useRessource';
import { listerLogements } from '../../repositories/logementRepository';
import { listerLocataires } from '../../repositories/locataireRepository';
import { getProprietaire } from '../../repositories/proprietaireRepository';
import { colors } from '../../theme/colors';
import { EntreeLocataireForm } from '../locataires/EntreeLocataireForm';
import { LogementForm } from '../logements/LogementForm';

interface Synthese {
  prenom: string;
  logements: number;
  occupes: number;
  locatairesActifs: number;
}

const lireSynthese = async (db: SqlDatabase): Promise<Synthese> => {
  const [proprietaire, logements, locataires] = await Promise.all([getProprietaire(db), listerLogements(db), listerLocataires(db)]);
  return {
    prenom: proprietaire?.nom.split(/\s+/)[0] ?? '',
    logements: logements.length,
    occupes: logements.filter((l) => l.contrat_id !== null).length,
    locatairesActifs: locataires.filter((l) => l.contrat_statut === 'actif').length,
  };
};

const VIDE: Synthese = { prenom: '', logements: 0, occupes: 0, locatairesActifs: 0 };

export function AccueilScreen() {
  const { donnees: s, erreur, rafraichir } = useRessource(lireSynthese, VIDE);
  const [nouveauLogement, setNouveauLogement] = useState(false);
  const [nouveauLocataire, setNouveauLocataire] = useState(false);

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
          <Text className="text-white/80">Taux d’occupation</Text>
          <Text className="text-white text-4xl font-bold mt-1">{taux} %</Text>
          <View className="h-2 rounded-full bg-white/20 mt-3 overflow-hidden">
            <View className="h-full bg-accent rounded-full" style={{ width: `${taux}%` }} />
          </View>
          <Text className="text-white/80 mt-2">
            {s.occupes} logement(s) occupé(s) sur {s.logements}
          </Text>
        </View>

        <View className="flex-row gap-3">
          <Statistique icone={<House size={20} color={colors.white} />} valeur={s.logements - s.occupes} libelle="Logement(s) libre(s)" />
          <Statistique icone={<Users size={20} color={colors.white} />} valeur={s.locatairesActifs} libelle="Locataire(s) actif(s)" />
        </View>

        <Text className="text-xs font-bold text-muted uppercase tracking-wider mt-2">Actions rapides</Text>
        <View className="flex-row gap-3">
          <Raccourci icone={<KeyRound size={22} color={colors.primary} />} libelle="Ajouter un logement" onPress={() => setNouveauLogement(true)} />
          <Raccourci icone={<UserPlus size={22} color={colors.primary} />} libelle="Nouveau locataire" onPress={() => setNouveauLocataire(true)} />
        </View>

        <Carte>
          <Text className="font-semibold text-ink">Loyers, factures et finances</Text>
          <Text className="text-muted mt-1">
            Les échéances, paiements, reçus et le suivi financier arrivent avec les prochaines étapes de la refonte.
          </Text>
        </Carte>
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

function Statistique({ icone, valeur, libelle }: { icone: React.ReactNode; valeur: number; libelle: string }) {
  return (
    <Carte className="flex-1">
      <PastilleIcone>{icone}</PastilleIcone>
      <Text className="text-2xl font-bold text-ink mt-3">{valeur}</Text>
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
