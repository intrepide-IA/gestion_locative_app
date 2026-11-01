import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarClock, ChevronRight, Database, Download, FileText, Receipt, Zap } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { BoutonRetour, Chargement, EnTete, EtatErreur, Filtres } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import type { SqlDatabase } from '../../db/types';
import { getDatabase } from '../../db/client';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate } from '../../domain/format';
import { ecartJours, type Alerte, type GraviteAlerte, type TypeAlerte } from '../../domain/rappels';
import { useRessource } from '../../hooks/useRessource';
import { lireNotificationsLues, listerAlertes, marquerNotifications, signatureAlerte } from '../../repositories/rappelsRepository';
import { nouvelleVersion } from '../../services/miseAJour';
import { colors } from '../../theme/colors';

type Filtre = 'toutes' | 'non_lues' | 'lues' | TypeAlerte;

interface Donnees {
  alertes: Alerte[];
  lues: Set<string>;
}

/** Alertes de la maison, plus la mise à jour de l'application si une nouvelle version est publiée. */
const lire = async (db: SqlDatabase): Promise<Donnees> => {
  const jour = aujourdhui();
  const [alertes, lues, version] = await Promise.all([listerAlertes(db, jour), lireNotificationsLues(db), nouvelleVersion().catch(() => null)]);
  if (version) {
    const notes = (version.notes ?? '')
      .split('\n')
      .map((l) => l.replace(/^[-*•\s]+/, '').trim())
      .filter(Boolean);
    alertes.unshift({
      cle: `maj-${version.version}`,
      type: 'mise_a_jour',
      gravite: 'attention',
      qui: null,
      titre: `Onílé ${version.version} est disponible`,
      detail: 'Touchez pour mettre à jour',
      description: notes.length ? `Nouveautés : ${notes.join(' · ')}` : 'Corrections et améliorations. Vos données sont conservées pendant la mise à jour.',
      jour,
    });
  }
  return { alertes, lues };
};

const VIDE: Donnees = { alertes: [], lues: new Set() };

const ICONES: Record<TypeAlerte, ComponentType<{ size: number; color: string }>> = {
  loyer: Receipt,
  electricite: Zap,
  fin_contrat: FileText,
  sauvegarde: Database,
  mise_a_jour: Download,
};

const LIBELLES_TYPE: Record<TypeAlerte, string> = {
  loyer: 'Loyers et factures',
  electricite: 'Électricité',
  fin_contrat: 'Contrats',
  sauvegarde: 'Sauvegarde',
  mise_a_jour: 'Mises à jour',
};

/** Couleur de la pastille d'icône selon l'urgence. */
const TEINTE: Record<GraviteAlerte, { fond: string; icone: string; libelle: string }> = {
  urgent: { fond: '#FDECEA', icone: colors.danger, libelle: 'Urgent' },
  attention: { fond: '#FFF4D6', icone: '#8A6500', libelle: 'À surveiller' },
  info: { fond: colors.background, icone: colors.muted, libelle: 'Conseil' },
};

/** « il y a 3 jours », « aujourd'hui », « dans 2 jours » (par rapport à la date de l'alerte). */
function quand(jourAlerte: string, jour: string): string {
  const e = ecartJours(jour, jourAlerte);
  if (e === 0) return 'Aujourd’hui';
  if (e === -1) return 'Hier';
  if (e === 1) return 'Demain';
  return e < 0 ? `Depuis le ${formatDate(jourAlerte)}` : `Le ${formatDate(jourAlerte)}`;
}

/**
 * Notifications : filtres en haut (lues, non lues, par sujet), chaque alerte expliquée en clair.
 * Toucher ouvre ce qui est concerné et marque l'alerte comme lue ; appui long : lue / non lue.
 */
export function NotificationsScreen({ onRetour }: { onRetour: () => void }) {
  const { donnees, chargement, erreur, rafraichir } = useRessource(lire, VIDE);
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const navigation = useNavigation<{ navigate: (ecran: string, params?: object) => void }>();
  const jour = aujourdhui();

  const { alertes, lues } = donnees;
  const estLue = useCallback((a: Alerte) => lues.has(signatureAlerte(a)), [lues]);
  const nonLues = alertes.filter((a) => !estLue(a)).length;

  const visibles = useMemo(
    () =>
      alertes.filter((a) =>
        filtre === 'toutes' ? true : filtre === 'non_lues' ? !estLue(a) : filtre === 'lues' ? estLue(a) : a.type === filtre
      ),
    [alertes, filtre, estLue]
  );

  const options = useMemo(() => {
    const parType = (t: TypeAlerte) => alertes.filter((a) => a.type === t).length;
    const types = (Object.keys(LIBELLES_TYPE) as TypeAlerte[]).map((t) => ({ valeur: t as Filtre, libelle: `${LIBELLES_TYPE[t]} (${parType(t)})` }));
    return [
      { valeur: 'toutes' as Filtre, libelle: `Toutes (${alertes.length})` },
      { valeur: 'non_lues' as Filtre, libelle: `Non lues (${nonLues})` },
      { valeur: 'lues' as Filtre, libelle: `Lues (${alertes.length - nonLues})` },
      ...types,
    ];
  }, [alertes, nonLues]);

  const marquer = async (liste: Alerte[], lu: boolean) => {
    await marquerNotifications(await getDatabase(), liste.map(signatureAlerte), lu, alertes.map(signatureAlerte));
    rafraichir();
  };

  const ouvrir = async (a: Alerte) => {
    await marquer([a], true);
    if (a.type === 'loyer' || a.type === 'fin_contrat') {
      navigation.navigate('Main', a.locataireId ? { screen: 'Tenants', params: { ouvrir: a.locataireId } } : { screen: 'Invoices' });
    } else if (a.type === 'electricite') navigation.navigate('Electricite', a.contratId ? { ouvrir: a.contratId } : undefined);
    else if (a.type === 'mise_a_jour') navigation.navigate('Parametres');
    else navigation.navigate('Sauvegarde');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete
        titre="Notifications"
        sousTitre={alertes.length ? (nonLues ? `${nonLues} non lue(s) sur ${alertes.length}` : 'Tout est lu') : undefined}
        droite={
          nonLues ? (
            <Pressable onPress={() => marquer(alertes, true)} accessibilityRole="button" hitSlop={8}>
              <Text className="text-primary font-medium">Tout marquer comme lu</Text>
            </Pressable>
          ) : undefined
        }
      />
      {alertes.length ? <Filtres options={options} valeur={filtre} onChange={setFiltre} /> : null}
      {erreur ? (
        <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
      ) : chargement && !alertes.length ? (
        <Chargement />
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(a) => a.cle}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 10 }}
          ListEmptyComponent={
            <View className="px-8 py-16 items-center">
              <Text className="text-ink font-semibold text-base">{alertes.length ? 'Aucune notification ici' : 'Rien à signaler'}</Text>
              <Text className="text-muted text-center mt-1">
                {alertes.length ? 'Choisissez un autre filtre pour voir les autres notifications.' : 'Tous les loyers sont à jour et aucun compteur n’est à vérifier.'}
              </Text>
            </View>
          }
          renderItem={({ item: a }) => {
            const lu = estLue(a);
            const teinte = TEINTE[a.gravite];
            const Icone = ICONES[a.type];
            return (
              <Pressable
                onPress={() => ouvrir(a)}
                onLongPress={() => marquer([a], !lu)}
                accessibilityRole="button"
                accessibilityHint="Appui long pour marquer comme lue ou non lue"
                accessibilityLabel={`${lu ? '' : 'Non lue. '}${a.qui ? `${a.qui}, ` : ''}${a.titre}. ${a.description}`}
                className={`rounded-2xl border p-4 active:opacity-80 ${lu ? 'bg-white border-border' : 'bg-primary/5 border-primary/25'}`}
              >
                <View className="flex-row">
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: teinte.fond }}>
                    <Icone size={18} color={teinte.icone} />
                  </View>
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center">
                      <Text className={`flex-1 text-ink ${lu ? 'font-medium' : 'font-bold'}`} numberOfLines={2}>
                        {a.titre}
                      </Text>
                      {!lu ? <View className="w-2.5 h-2.5 rounded-full bg-primary ml-2" accessibilityElementsHidden /> : null}
                    </View>
                    {a.qui || a.detail ? (
                      <Text className="text-ink text-sm mt-0.5" numberOfLines={1}>
                        {[a.qui, a.detail].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    <Text className="text-muted text-sm mt-1.5 leading-5">{a.description}</Text>
                    <View className="flex-row items-center mt-2.5">
                      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: teinte.fond }}>
                        <Text className="text-xs font-semibold" style={{ color: teinte.icone }}>
                          {teinte.libelle}
                        </Text>
                      </View>
                      <CalendarClock size={13} color={colors.muted} style={{ marginLeft: 10 }} />
                      <Text className="text-xs text-muted ml-1 flex-1">{quand(a.jour, jour)}</Text>
                      <ChevronRight size={16} color={colors.muted} />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
