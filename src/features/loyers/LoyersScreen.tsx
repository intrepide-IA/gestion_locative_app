import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, FileText, Receipt, Wallet } from 'lucide-react-native';

import { Feuille } from '../../components/ui/Feuille';
import { confirmer, informer } from '../../components/ui/confirmer';
import {
  Badge,
  Bouton,
  Carte,
  Chargement,
  EnTete,
  EtatErreur,
  EtatVide,
  Filtres,
  LigneInfo,
} from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { partagerFactureEcheance, partagerRecu } from '../../documents';
import { LIBELLES_STATUT } from '../../domain/echeances';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate, formatFCFA, formatMois } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import {
  annulerPaiement,
  genererEcheances,
  getEcheance,
  LIBELLES_MODE,
  listerEcheancesDuMois,
  paiementsDeLEcheance,
  syntheseDuMois,
  type EcheanceDetaillee,
  type SyntheseMois,
} from '../../repositories/loyerRepository';
import { colors } from '../../theme/colors';
import { PaiementForm } from './PaiementForm';

type Filtre = 'toutes' | 'retard' | 'attente' | 'partielles' | 'payees';

export function tonStatut(e: Pick<EcheanceDetaillee, 'statut' | 'enRetard'>): 'succes' | 'attention' | 'erreur' {
  if (e.statut === 'payee') return 'succes';
  return e.enRetard ? 'erreur' : 'attention';
}

export function libelleStatut(e: Pick<EcheanceDetaillee, 'statut' | 'enRetard'>): string {
  return e.statut === 'partielle' && e.enRetard ? 'Partielle · en retard' : LIBELLES_STATUT[e.statut];
}

interface DonneesMois {
  echeances: EcheanceDetaillee[];
  synthese: SyntheseMois;
}

const VIDE: DonneesMois = { echeances: [], synthese: { attendu: 0, regle: 0, reste: 0, encaisse: 0, enRetard: 0 } };

export function LoyersScreen() {
  const maintenant = new Date();
  const [periode, setPeriode] = useState({ annee: maintenant.getFullYear(), mois: maintenant.getMonth() + 1 });
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [selection, setSelection] = useState<number | null>(null);
  const [encaissement, setEncaissement] = useState<{ id: number; nom: string; reste: number } | null>(null);

  const lire = useCallback(
    async (db: SqlDatabase): Promise<DonneesMois> => {
      const jour = aujourdhui();
      await genererEcheances(db, jour);
      const [echeances, synthese] = await Promise.all([
        listerEcheancesDuMois(db, periode.annee, periode.mois, jour),
        syntheseDuMois(db, periode.annee, periode.mois, jour),
      ]);
      return { echeances, synthese };
    },
    [periode]
  );
  const { donnees, chargement, erreur, rafraichir } = useRessource(lire, VIDE);
  const { echeances, synthese } = donnees;

  const decaler = (delta: number) =>
    setPeriode(({ annee, mois }) => {
      const m = mois + delta;
      return m < 1 ? { annee: annee - 1, mois: 12 } : m > 12 ? { annee: annee + 1, mois: 1 } : { annee, mois: m };
    });

  const visibles = useMemo(
    () =>
      echeances.filter((e) => {
        if (filtre === 'retard') return e.enRetard;
        if (filtre === 'attente') return e.statut === 'en_attente';
        if (filtre === 'partielles') return e.statut === 'partielle';
        if (filtre === 'payees') return e.statut === 'payee';
        return true;
      }),
    [echeances, filtre]
  );
  const taux = synthese.attendu ? Math.round((synthese.regle / synthese.attendu) * 100) : 0;
  const titreMois = formatMois(periode.mois, periode.annee);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <EnTete
        titre="Loyers"
        droite={
          <View className="flex-row items-center bg-white border border-border rounded-full">
            <Pressable onPress={() => decaler(-1)} accessibilityLabel="Mois précédent" className="p-2">
              <ChevronLeft size={18} color={colors.ink} />
            </Pressable>
            <Text className="text-sm font-semibold text-ink capitalize">{titreMois}</Text>
            <Pressable onPress={() => decaler(1)} accessibilityLabel="Mois suivant" className="p-2">
              <ChevronRight size={18} color={colors.ink} />
            </Pressable>
          </View>
        }
      />

      <FlatList
        data={visibles}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
        ListHeaderComponent={
          <View className="gap-3 mb-1">
            <View className="bg-primary rounded-3xl p-5">
              <View className="flex-row justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-white/80 text-sm">Loyers attendus</Text>
                  <Text className="text-white text-xl font-bold">{formatFCFA(synthese.attendu)}</Text>
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-white/80 text-sm">Réglés</Text>
                  <Text className="text-white text-xl font-bold">{formatFCFA(synthese.regle)}</Text>
                </View>
              </View>
              <View className="h-2 rounded-full bg-white/20 mt-4 overflow-hidden">
                <View className="h-full bg-accent rounded-full" style={{ width: `${taux}%` }} />
              </View>
              <View className="flex-row justify-between mt-3">
                <Text className="text-white/90">Reste à percevoir</Text>
                <Text className="text-accent font-bold">{formatFCFA(synthese.reste)}</Text>
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-white/70 text-sm">Encaissé ce mois (tous loyers)</Text>
                <Text className="text-white/90 text-sm font-semibold">{formatFCFA(synthese.encaisse)}</Text>
              </View>
            </View>
            {echeances.length ? (
              <View className="-mx-5">
                <Filtres
                  options={[
                    { valeur: 'toutes', libelle: `Toutes (${echeances.length})` },
                    { valeur: 'retard', libelle: `En retard (${synthese.enRetard})` },
                    { valeur: 'attente', libelle: 'En attente' },
                    { valeur: 'partielles', libelle: 'Partielles' },
                    { valeur: 'payees', libelle: 'Payées' },
                  ]}
                  valeur={filtre}
                  onChange={setFiltre}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          erreur ? (
            <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} />
          ) : chargement ? (
            <Chargement />
          ) : echeances.length === 0 ? (
            <EtatVide
              icone={<Receipt size={30} color={colors.primary} />}
              titre="Aucune échéance ce mois-ci"
              message="Les échéances sont créées automatiquement pour chaque contrat actif."
            />
          ) : (
            <Text className="text-muted text-center py-10">Aucune échéance ne correspond.</Text>
          )
        }
        renderItem={({ item }) => (
          <Carte onPress={() => setSelection(item.id)}>
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                  {item.locataire_nom}
                </Text>
                <Text className="text-sm text-muted">
                  {item.logement_reference} · échéance le {formatDate(item.date_echeance)}
                </Text>
              </View>
              <View className="items-end">
                <Badge libelle={libelleStatut(item)} ton={tonStatut(item)} />
                <Text className="text-sm font-semibold text-ink mt-1.5">
                  {item.reste > 0 ? `Reste ${formatFCFA(item.reste)}` : formatFCFA(item.montant_du)}
                </Text>
              </View>
            </View>
          </Carte>
        )}
      />

      <Feuille ouverte={selection !== null} onFermer={() => setSelection(null)} titre="Échéance">
        {selection !== null ? (
          <DetailEcheance
            echeanceId={selection}
            onEncaisser={(e) => {
              setSelection(null);
              setEncaissement({ id: e.locataire_id, nom: e.locataire_nom, reste: e.reste });
            }}
            onModifie={rafraichir}
          />
        ) : null}
      </Feuille>

      <PaiementForm
        ouverte={encaissement !== null}
        locataire={encaissement ? { id: encaissement.id, nom: encaissement.nom } : null}
        montantSuggere={encaissement?.reste ?? 0}
        onFermer={() => setEncaissement(null)}
        onEnregistre={rafraichir}
      />
    </SafeAreaView>
  );
}

function DetailEcheance({
  echeanceId,
  onEncaisser,
  onModifie,
}: {
  echeanceId: number;
  onEncaisser: (e: EcheanceDetaillee) => void;
  onModifie: () => void;
}) {
  const lire = useCallback(
    async (db: SqlDatabase) => {
      const [echeance, paiements] = await Promise.all([
        getEcheance(db, echeanceId, aujourdhui()),
        paiementsDeLEcheance(db, echeanceId),
      ]);
      return { echeance, paiements };
    },
    [echeanceId]
  );
  const { donnees, chargement, rafraichir } = useRessource(lire, { echeance: null, paiements: [] });
  const [occupe, setOccupe] = useState<string | null>(null);
  const { echeance, paiements } = donnees;

  if (chargement && !echeance) return <Chargement />;
  if (!echeance) return <Text className="text-muted text-center py-8">Échéance introuvable.</Text>;

  const action = async (cle: string, travail: () => Promise<unknown>) => {
    setOccupe(cle);
    try {
      await travail();
    } catch (error) {
      informer('Action impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
    } finally {
      setOccupe(null);
    }
  };

  const annuler = (paiementId: number) =>
    action(`annuler-${paiementId}`, async () => {
      const ok = await confirmer(
        'Annuler ce paiement ?',
        'Il restera visible dans l’historique, marqué « annulé », et ne comptera plus dans les règlements. Motif enregistré : erreur de saisie.',
        'Annuler le paiement',
        true
      );
      if (!ok) return;
      await annulerPaiement(await getDatabase(), paiementId, 'Erreur de saisie');
      rafraichir();
      onModifie();
    });

  return (
    <>
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-lg font-bold text-ink">{echeance.locataire_nom}</Text>
          <Text className="text-muted capitalize">
            {echeance.logement_reference} · {formatMois(echeance.mois, echeance.annee)}
          </Text>
        </View>
        <Badge libelle={libelleStatut(echeance)} ton={tonStatut(echeance)} />
      </View>

      <Carte>
        <LigneInfo libelle="Loyer" valeur={formatFCFA(echeance.loyer)} />
        <LigneInfo libelle="Toilettes" valeur={formatFCFA(echeance.toilettes)} />
        <LigneInfo libelle="Total dû" valeur={formatFCFA(echeance.montant_du)} />
        <LigneInfo libelle="Déjà réglé" valeur={formatFCFA(echeance.paye)} />
        <LigneInfo libelle="Reste" valeur={<Text className="font-bold text-ink">{formatFCFA(echeance.reste)}</Text>} />
        <LigneInfo libelle="Échéance" valeur={formatDate(echeance.date_echeance)} />
        {echeance.facture_numero ? <LigneInfo libelle="Facture" valeur={echeance.facture_numero} /> : null}
      </Carte>

      {echeance.reste > 0 ? (
        <Bouton
          titre="Encaisser un paiement"
          icone={<Wallet size={18} color={colors.white} />}
          onPress={() => onEncaisser(echeance)}
        />
      ) : null}
      <Bouton
        titre={echeance.facture_numero ? 'Partager la facture (PDF)' : 'Émettre et partager la facture (PDF)'}
        variante="secondaire"
        icone={<FileText size={18} color={colors.primary} />}
        chargement={occupe === 'facture'}
        onPress={() =>
          action('facture', async () => {
            await partagerFactureEcheance(echeance.id);
            rafraichir();
            onModifie();
          })
        }
      />

      <Text className="text-xs font-bold text-muted uppercase tracking-wider mt-2">Paiements affectés</Text>
      {paiements.length === 0 ? <Text className="text-muted">Aucun paiement pour cette échéance.</Text> : null}
      {paiements.map((p) => (
        <Carte key={p.id}>
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text className={`font-semibold ${p.annule_le ? 'text-muted line-through' : 'text-ink'}`}>
                {formatFCFA(p.part)}
              </Text>
              <Text className="text-muted text-sm">
                {formatDate(p.date_paiement)} · {LIBELLES_MODE[p.mode]}
                {p.recu_numero ? ` · ${p.recu_numero}` : ''}
              </Text>
              {p.annule_le ? <Text className="text-danger text-xs mt-1">Annulé : {p.motif_annulation}</Text> : null}
            </View>
            {p.annule_le ? <Badge libelle="Annulé" ton="neutre" /> : null}
          </View>
          <View className="flex-row gap-2 mt-3">
            <Bouton
              titre="Reçu"
              variante="secondaire"
              className="flex-1 py-2.5"
              chargement={occupe === `recu-${p.id}`}
              onPress={() => action(`recu-${p.id}`, () => partagerRecu(p.id))}
            />
            {!p.annule_le ? (
              <Bouton
                titre="Annuler"
                variante="danger"
                className="flex-1 py-2.5"
                chargement={occupe === `annuler-${p.id}`}
                onPress={() => annuler(p.id)}
              />
            ) : null}
          </View>
        </Carte>
      ))}
    </>
  );
}
