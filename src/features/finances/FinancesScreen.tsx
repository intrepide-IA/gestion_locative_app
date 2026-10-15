import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Download, Minus, Pencil, Plus } from 'lucide-react-native';

import { Courbe } from '../../components/ui/Courbe';
import { Feuille } from '../../components/ui/Feuille';
import { informer } from '../../components/ui/confirmer';
import { DemandeMotif } from '../../components/ui/DemandeMotif';
import { Badge, Bouton, Carte, Champ, EnTete, EtatErreur, Filtres, LigneInfo } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { partagerFichierTexte } from '../../documents/partage';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate, formatFCFA, formatMois, formatHeure, formatDateHeure } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import {
  annulerMouvement,
  definirSoldeInitial,
  listerMouvements,
  mouvementsEnCsv,
  rapport,
  soldeInitial,
  soldeTresorerie,
  validerMouvement,
  type Mouvement,
  type Rapport,
  type Sens,
} from '../../repositories/financesRepository';
import { genererEcheances, LIBELLES_MODE } from '../../repositories/loyerRepository';
import { colors } from '../../theme/colors';
import { MouvementForm } from './MouvementForm';

type Vue = 'mois' | 'annee';
type Filtre = 'toutes' | 'entrees' | 'sorties' | 'prevues' | 'annulees';

const MOIS_COURTS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MOIS_ABREGES = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/** Fenêtre de la courbe : les 6 mois jusqu'au mois choisi, ou toute l'année. */
function bornesTendance(vue: Vue, annee: number, mois: number) {
  if (vue === 'annee') return bornes('annee', annee, mois);
  const debut = new Date(annee, mois - 6, 1);
  return { debut: `${debut.getFullYear()}-${String(debut.getMonth() + 1).padStart(2, '0')}-01`, fin: bornes('mois', annee, mois).fin };
}

function bornes(vue: Vue, annee: number, mois: number) {
  if (vue === 'annee') return { debut: `${annee}-01-01`, fin: `${annee}-12-31` };
  const p = String(mois).padStart(2, '0');
  const dernier = new Date(annee, mois, 0).getDate();
  return { debut: `${annee}-${p}-01`, fin: `${annee}-${p}-${dernier}` };
}

interface Donnees {
  tresorerie: number;
  soldeDepart: number;
  rapport: Rapport | null;
  tendance: Rapport['parMois'];
  mouvements: Mouvement[];
}

const VIDE: Donnees = { tresorerie: 0, soldeDepart: 0, rapport: null, tendance: [], mouvements: [] };

export function FinancesScreen() {
  const maintenant = new Date();
  const [vue, setVue] = useState<Vue>('mois');
  const [periode, setPeriode] = useState({ annee: maintenant.getFullYear(), mois: maintenant.getMonth() + 1 });
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [saisie, setSaisie] = useState<Sens | null>(null);
  const [selection, setSelection] = useState<Mouvement | null>(null);
  const [editionSolde, setEditionSolde] = useState(false);

  const p = bornes(vue, periode.annee, periode.mois);
  const t = bornesTendance(vue, periode.annee, periode.mois);
  const lire = useCallback(
    async (db: SqlDatabase): Promise<Donnees> => {
      await genererEcheances(db, aujourdhui());
      const [tresorerie, soldeDepart, r, tendance, mouvements] = await Promise.all([
        soldeTresorerie(db),
        soldeInitial(db),
        rapport(db, { debut: p.debut, fin: p.fin }),
        rapport(db, { debut: t.debut, fin: t.fin }),
        listerMouvements(db, { debut: p.debut, fin: p.fin }),
      ]);
      return { tresorerie, soldeDepart, rapport: r, tendance: tendance.parMois, mouvements };
    },
    [p.debut, p.fin, t.debut, t.fin]
  );
  const { donnees, erreur, rafraichir } = useRessource(lire, VIDE);
  const r = donnees.rapport;

  const decaler = (delta: number) =>
    setPeriode(({ annee, mois }) => {
      if (vue === 'annee') return { annee: annee + delta, mois };
      const m = mois + delta;
      return m < 1 ? { annee: annee - 1, mois: 12 } : m > 12 ? { annee: annee + 1, mois: 1 } : { annee, mois: m };
    });

  const visibles = useMemo(
    () =>
      donnees.mouvements.filter((m) => {
        if (filtre === 'entrees') return m.sens === 'entree' && m.statut === 'valide';
        if (filtre === 'sorties') return m.sens === 'sortie' && m.statut === 'valide';
        if (filtre === 'prevues') return m.statut === 'brouillon';
        if (filtre === 'annulees') return m.statut === 'annule';
        return true;
      }),
    [donnees.mouvements, filtre]
  );

  const exporter = async () => {
    try {
      await partagerFichierTexte(
        mouvementsEnCsv(donnees.mouvements),
        `Onile-operations-${p.debut}-au-${p.fin}.csv`,
        'text/csv',
        'Exporter les opérations'
      );
    } catch (error) {
      informer('Export impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
    }
  };

  const libellePeriode = vue === 'annee' ? String(periode.annee) : formatMois(periode.mois, periode.annee);
  const tendance = donnees.tendance;
  const surligne = vue === 'mois' ? tendance.findIndex((m) => m.annee === periode.annee && m.mois === periode.mois) : undefined;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <EnTete titre="Finances" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 14 }}>
        {erreur ? <EtatErreur message={messageErreur(erreur, erreur.message)} onReessayer={rafraichir} /> : null}

        <View className="bg-primary rounded-3xl p-5">
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text className="text-white/80">Trésorerie aujourd’hui</Text>
              <Text className="text-white text-3xl font-bold mt-1">{formatFCFA(donnees.tresorerie)}</Text>
            </View>
            <Pressable onPress={() => setEditionSolde(true)} accessibilityRole="button" accessibilityLabel="Modifier le solde de départ" className="p-2">
              <Pencil size={18} color={colors.white} />
            </Pressable>
          </View>
          <Text className="text-white/70 text-sm mt-1">
            Solde de départ {formatFCFA(donnees.soldeDepart)} + encaissements − dépenses payées
          </Text>
        </View>

        <View className="flex-row gap-3">
          <Bouton titre="Dépense" variante="secondaire" className="flex-1" icone={<Minus size={18} color={colors.primary} />} onPress={() => setSaisie('sortie')} />
          <Bouton titre="Recette" variante="secondaire" className="flex-1" icone={<Plus size={18} color={colors.primary} />} onPress={() => setSaisie('entree')} />
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row bg-white border border-border rounded-full p-1">
            {(['mois', 'annee'] as Vue[]).map((v) => (
              <Pressable
                key={v}
                onPress={() => setVue(v)}
                accessibilityRole="button"
                accessibilityState={{ selected: vue === v }}
                className={`px-3 py-1.5 rounded-full ${vue === v ? 'bg-primary' : ''}`}
              >
                <Text className={`text-sm font-medium ${vue === v ? 'text-white' : 'text-ink'}`}>{v === 'mois' ? 'Mois' : 'Année'}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row items-center bg-white border border-border rounded-full">
            <Pressable onPress={() => decaler(-1)} accessibilityLabel="Période précédente" className="p-2">
              <ChevronLeft size={18} color={colors.ink} />
            </Pressable>
            <Text className="text-sm font-semibold text-ink">{libellePeriode}</Text>
            <Pressable onPress={() => decaler(1)} accessibilityLabel="Période suivante" className="p-2">
              <ChevronRight size={18} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        {r ? (
          <>
            <View className="flex-row gap-3">
              <Carte className="flex-1">
                <ArrowDownLeft size={18} color={colors.secondary} />
                <Text className="text-muted text-sm mt-1">Entrées</Text>
                <Text className="text-lg font-bold text-ink">{formatFCFA(r.entrees)}</Text>
              </Carte>
              <Carte className="flex-1">
                <ArrowUpRight size={18} color={colors.danger} />
                <Text className="text-muted text-sm mt-1">Sorties</Text>
                <Text className="text-lg font-bold text-ink">{formatFCFA(r.sorties)}</Text>
              </Carte>
            </View>
            {tendance.length ? (
              <Carte>
                <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                  {vue === 'annee' ? `Évolution ${periode.annee}` : 'Évolution sur 6 mois'}
                </Text>
                <Courbe
                  series={[
                    { libelle: 'Entrées', couleur: colors.secondary, valeurs: tendance.map((m) => m.entrees) },
                    { libelle: 'Sorties', couleur: colors.danger, valeurs: tendance.map((m) => m.sorties) },
                  ]}
                  etiquettes={tendance.map((m) => (vue === 'annee' ? MOIS_COURTS[m.mois - 1] : MOIS_ABREGES[m.mois - 1]))}
                  surligne={surligne !== undefined && surligne >= 0 ? surligne : undefined}
                />
              </Carte>
            ) : null}
            <Carte>
              <LigneInfo
                libelle="Résultat de la période"
                valeur={<Text className={`font-bold ${r.resultat < 0 ? 'text-danger' : 'text-primary'}`}>{formatFCFA(r.resultat)}</Text>}
              />
              <LigneInfo libelle="Loyers facturés" valeur={formatFCFA(r.loyersFactures)} />
              <LigneInfo libelle="Loyers encaissés" valeur={formatFCFA(r.loyersEncaisses)} />
              <LigneInfo libelle="Loyers impayés (à percevoir)" valeur={formatFCFA(r.impayes)} />
              {r.cautions ? <LigneInfo libelle="Cautions reçues" valeur={formatFCFA(r.cautions)} /> : null}
              {r.depensesPrevues ? <LigneInfo libelle="Dépenses prévues (non payées)" valeur={formatFCFA(r.depensesPrevues)} /> : null}
              <Text className="text-muted text-xs pt-2">Les impayés sont des sommes dues, pas de l’argent disponible.</Text>
            </Carte>


            {r.parCategorie.length ? (
              <Carte>
                <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Par catégorie</Text>
                {r.parCategorie.map((c) => (
                  <LigneInfo
                    key={`${c.sens}-${c.categorie}`}
                    libelle={c.categorie}
                    valeur={
                      <Text className={`font-semibold ${c.sens === 'entree' ? 'text-primary' : 'text-danger'}`}>
                        {c.sens === 'entree' ? '+' : '−'}
                        {formatFCFA(c.total)}
                      </Text>
                    }
                  />
                ))}
              </Carte>
            ) : null}
          </>
        ) : null}

        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-xs font-bold text-muted uppercase tracking-wider">Opérations</Text>
          {donnees.mouvements.length ? (
            <Pressable onPress={exporter} accessibilityRole="button" className="flex-row items-center">
              <Download size={16} color={colors.primary} />
              <Text className="text-primary font-medium ml-1">Exporter (CSV)</Text>
            </Pressable>
          ) : null}
        </View>
        <View className="-mx-5">
          <Filtres
            options={[
              { valeur: 'toutes', libelle: 'Toutes' },
              { valeur: 'entrees', libelle: 'Entrées' },
              { valeur: 'sorties', libelle: 'Sorties' },
              { valeur: 'prevues', libelle: 'Prévues' },
              { valeur: 'annulees', libelle: 'Annulées' },
            ]}
            valeur={filtre}
            onChange={setFiltre}
          />
        </View>
        {visibles.length === 0 ? <Text className="text-muted text-center py-6">Aucune opération sur cette période.</Text> : null}
        {visibles.map((m) => (
          <Carte key={m.id} onPress={() => setSelection(m)}>
            <View className="flex-row items-center">
              <View className={`w-10 h-10 rounded-xl items-center justify-center ${m.sens === 'entree' ? 'bg-secondary/15' : 'bg-danger/10'}`}>
                {m.sens === 'entree' ? <ArrowDownLeft size={18} color={colors.primary} /> : <ArrowUpRight size={18} color={colors.danger} />}
              </View>
              <View className="flex-1 ml-3">
                <Text className="font-semibold text-ink" numberOfLines={1}>
                  {m.categorie_nom}
                </Text>
                <Text className="text-muted text-sm" numberOfLines={1}>
                  {formatDate(m.date_operation)} à {formatHeure(m.cree_le)}
                  {m.description ? ` · ${m.description}` : ''}
                </Text>
              </View>
              <View className="items-end">
                <Text
                  className={`font-bold ${m.statut === 'annule' ? 'text-muted line-through' : m.sens === 'entree' ? 'text-primary' : 'text-danger'}`}
                >
                  {m.sens === 'entree' ? '+' : '−'}
                  {formatFCFA(m.montant)}
                </Text>
                {m.statut !== 'valide' ? <Badge libelle={m.statut === 'brouillon' ? 'Prévue' : 'Annulée'} ton={m.statut === 'brouillon' ? 'attention' : 'neutre'} /> : null}
              </View>
            </View>
          </Carte>
        ))}
      </ScrollView>

      <MouvementForm
        sens={saisie}
        onFermer={() => setSaisie(null)}
        onEnregistre={() => {
          setSaisie(null);
          rafraichir();
        }}
      />

      <Feuille ouverte={selection !== null} onFermer={() => setSelection(null)} titre="Opération">
        {selection ? (
          <DetailMouvement
            mouvement={selection}
            onModifie={() => {
              setSelection(null);
              rafraichir();
            }}
          />
        ) : null}
      </Feuille>

      <Feuille ouverte={editionSolde} onFermer={() => setEditionSolde(false)} titre="Solde de départ">
        <FormSoldeDepart
          initial={donnees.soldeDepart}
          onEnregistre={() => {
            setEditionSolde(false);
            rafraichir();
          }}
        />
      </Feuille>
    </SafeAreaView>
  );
}

const ORIGINES: Record<string, string> = {
  paiement: 'Paiement de loyer (à corriger depuis l’onglet Loyers)',
  achat_electricite: 'Vente d’électricité (à corriger depuis Électricité)',
  caution: 'Caution reçue à l’entrée du locataire',
};

function DetailMouvement({ mouvement: m, onModifie }: { mouvement: Mouvement; onModifie: () => void }) {
  const [enCours, setEnCours] = useState(false);
  const [motif, setMotif] = useState(false);
  const manuel = !m.origine_type;

  const agir = async (travail: () => Promise<void>) => {
    setEnCours(true);
    try {
      await travail();
      onModifie();
    } catch (error) {
      informer('Action impossible', messageErreur(error));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <Carte>
        <LigneInfo libelle="Catégorie" valeur={m.categorie_nom} />
        <LigneInfo libelle="Montant" valeur={`${m.sens === 'entree' ? '+' : '−'}${formatFCFA(m.montant)}`} />
        <LigneInfo libelle="Date" valeur={formatDate(m.date_operation)} />
        <LigneInfo libelle="Enregistrée le" valeur={formatDateHeure(m.cree_le)} />
        {m.reference ? <LigneInfo libelle="Référence" valeur={m.reference} /> : null}
        {m.mode ? <LigneInfo libelle="Moyen" valeur={LIBELLES_MODE[m.mode]} /> : null}
        {m.beneficiaire ? <LigneInfo libelle="Bénéficiaire" valeur={m.beneficiaire} /> : null}
        {m.logement_reference ? <LigneInfo libelle="Logement" valeur={m.logement_reference} /> : null}
        <LigneInfo
          libelle="État"
          valeur={<Badge libelle={m.statut === 'valide' ? 'Validée' : m.statut === 'brouillon' ? 'Prévue' : 'Annulée'} ton={m.statut === 'valide' ? 'succes' : m.statut === 'brouillon' ? 'attention' : 'neutre'} />}
        />
        {m.description ? <Text className="text-muted pt-3">{m.description}</Text> : null}
        {m.motif_annulation ? <Text className="text-danger text-sm pt-2">Motif d’annulation : {m.motif_annulation}</Text> : null}
        {m.origine_type ? <Text className="text-muted text-sm pt-3">{ORIGINES[m.origine_type]}</Text> : null}
      </Carte>
      {manuel && m.statut === 'brouillon' ? (
        <Bouton titre="Marquer comme payée aujourd’hui" chargement={enCours} onPress={() => agir(async () => validerMouvement(await getDatabase(), m.id, aujourdhui()))} />
      ) : null}
      {manuel && m.statut !== 'annule' ? (
        <Bouton
          titre="Annuler l’opération"
          variante="danger"
          chargement={enCours}
          onPress={() => setMotif(true)}
        />
      ) : null}
      <DemandeMotif
        ouverte={motif}
        titre="Annuler l’opération"
        explication="Elle restera visible, marquée annulée, et ne comptera plus dans la trésorerie."
        libelleAction="Annuler l’opération"
        onFermer={() => setMotif(false)}
        onValider={async (raison) => {
          await annulerMouvement(await getDatabase(), m.id, raison);
          setMotif(false);
          onModifie();
        }}
      />
    </>
  );
}

function FormSoldeDepart({ initial, onEnregistre }: { initial: number; onEnregistre: () => void }) {
  const [valeur, setValeur] = useState(String(initial));
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const enregistrer = async () => {
    const n = Number(valeur.replace(/[\s ]/g, ''));
    if (!Number.isInteger(n)) return setErreur('Montant entier en FCFA (négatif autorisé).');
    setEnCours(true);
    try {
      await definirSoldeInitial(await getDatabase(), n);
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error));
      setEnCours(false);
    }
  };
  return (
    <>
      <Text className="text-muted">
        L’argent dont vous disposiez pour la maison avant d’utiliser Onílé. La trésorerie part de ce montant.
      </Text>
      <Champ libelle="Solde de départ (FCFA)" value={valeur} onChangeText={setValeur} keyboardType="numbers-and-punctuation" />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer" onPress={enregistrer} chargement={enCours} />
    </>
  );
}
