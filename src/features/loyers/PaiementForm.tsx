import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { CheckCircle2, Share2 } from 'lucide-react-native';

import { ChampDate } from '../../components/ui/ChampDate';
import { Feuille } from '../../components/ui/Feuille';
import { Bouton, Carte, Champ, Choix, LigneInfo } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import { preparerRecu } from '../../documents';
import { useApercu } from '../../components/documents/Apercu';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatFCFA, formatMois, lireMontant } from '../../domain/format';
import { payeJusquaApres, type Echeancier } from '../../domain/echeances';
import type { SqlDatabase } from '../../db/types';
import { useRessource } from '../../hooks/useRessource';
import { creerMouvement, listerCategories, type Categorie } from '../../repositories/financesRepository';
import { echeancierDuLocataire, enregistrerPaiement, LIBELLES_MODE, type ModePaiement, type ResultatPaiement } from '../../repositories/loyerRepository';
import { colors } from '../../theme/colors';

const MODES = (Object.keys(LIBELLES_MODE) as ModePaiement[]).map((m) => ({ valeur: m, libelle: LIBELLES_MODE[m] }));

type Objet = 'loyer' | 'frais';
/** Catégories réservées aux encaissements automatiques (loyers, cautions, électricité). */
const CATEGORIES_AUTOMATIQUES = ['loyer', 'toilettes', 'caution', 'electricite'];

interface Contexte {
  echeancier: Echeancier | null;
  categories: Categorie[];
}

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  locataire: { id: number; nom: string } | null;
  /** Montant proposé (reste dû). */
  montantSuggere: number;
  /** Appelé après l'enregistrement (rafraîchir les listes). */
  onEnregistre: () => void;
}

export function PaiementForm({ ouverte, onFermer, locataire, montantSuggere, onEnregistre }: Props) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Encaisser un paiement">
      {locataire ? (
        <Formulaire locataire={locataire} montantSuggere={montantSuggere} onEnregistre={onEnregistre} onTerminer={onFermer} />
      ) : null}
    </Feuille>
  );
}

function Formulaire({
  locataire,
  montantSuggere,
  onEnregistre,
  onTerminer,
}: {
  locataire: { id: number; nom: string };
  montantSuggere: number;
  onEnregistre: () => void;
  onTerminer: () => void;
}) {
  const [montant, setMontant] = useState(montantSuggere > 0 ? String(montantSuggere) : '');
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [date, setDate] = useState(aujourdhui());
  const [reference, setReference] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatPaiement | null>(null);
  const [objet, setObjet] = useState<Objet>('loyer');
  const [categorieId, setCategorieId] = useState<number | null>(null);
  const [libelle, setLibelle] = useState('');
  const [fraisEnregistres, setFraisEnregistres] = useState(false);
  const ouvrirApercu = useApercu();
  const lire = useCallback(
    async (db: SqlDatabase): Promise<Contexte> => {
      const [echeancier, categories] = await Promise.all([
        echeancierDuLocataire(db, locataire.id, aujourdhui(), 24),
        listerCategories(db, 'entree'),
      ]);
      return { echeancier, categories: categories.filter((c) => !CATEGORIES_AUTOMATIQUES.includes(c.code ?? '')) };
    },
    [locataire.id]
  );
  const { donnees: ctx } = useRessource<Contexte>(lire, { echeancier: null, categories: [] });
  const m = lireMontant(montant);
  // Calculé une fois l'échéancier chargé (avant enregistrement) : jusqu'où ce montant règle le loyer.
  const couvre = objet === 'loyer' && m && ctx.echeancier ? payeJusquaApres(ctx.echeancier, m) : null;
  const [couvreEnregistre, setCouvreEnregistre] = useState<typeof couvre>(null);

  const enregistrerFrais = async () => {
    if (!m) return setErreur('Indiquez le montant reçu en FCFA (chiffres uniquement).');
    if (!categorieId) return setErreur('Choisissez la nature des frais.');
    if (!libelle.trim()) return setErreur('Précisez l’objet des frais (ex. réparation du robinet).');
    setEnCours(true);
    setErreur('');
    try {
      await creerMouvement(await getDatabase(), {
        sens: 'entree',
        date,
        montant: m,
        categorieId,
        mode,
        description: `${libelle.trim()} — ${locataire.nom}`,
        beneficiaire: locataire.nom,
      });
      setFraisEnregistres(true);
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const enregistrer = async () => {
    if (objet === 'frais') return enregistrerFrais();
    if (!m) {
      setErreur('Indiquez le montant reçu en FCFA (chiffres uniquement).');
      return;
    }
    setEnCours(true);
    setErreur('');
    try {
      const r = await enregistrerPaiement(await getDatabase(), {
        locataireId: locataire.id,
        montant: m,
        mode,
        datePaiement: date,
        reference,
      });
      setCouvreEnregistre(couvre);
      setResultat(r);
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const partager = () => resultat && ouvrirApercu(() => preparerRecu(resultat.paiementId));

  if (fraisEnregistres) {
    return (
      <>
        <View className="items-center py-2">
          <CheckCircle2 size={56} color={colors.secondary} />
          <Text className="text-xl font-bold text-ink mt-2">Frais encaissés</Text>
          <Text className="text-muted text-center">
            {formatFCFA(m ?? 0)} · {libelle.trim()} : ajouté aux recettes (Finances). Le loyer n’est pas concerné.
          </Text>
        </View>
        <Bouton titre="Terminer" variante="secondaire" onPress={onTerminer} />
      </>
    );
  }

  if (resultat) {
    return (
      <>
        <View className="items-center py-2">
          <CheckCircle2 size={56} color={colors.secondary} />
          <Text className="text-xl font-bold text-ink mt-2">Paiement enregistré</Text>
          <Text className="text-muted">Reçu {resultat.recuNumero}</Text>
        </View>
        <Carte>
          <LigneInfo libelle="Locataire" valeur={locataire.nom} />
          <LigneInfo libelle="Montant reçu" valeur={formatFCFA(lireMontant(montant) ?? 0)} />
          <LigneInfo libelle="Reste à payer" valeur={formatFCFA(resultat.dette)} />
          {resultat.credit > 0 ? <LigneInfo libelle="Avance (crédit)" valeur={formatFCFA(resultat.credit)} /> : null}
          {couvreEnregistre ? <LigneInfo libelle="Loyer payé jusqu’à" valeur={formatMois(couvreEnregistre.mois, couvreEnregistre.annee)} /> : null}
        </Carte>
        <Bouton titre="Voir et partager le reçu" variante="action" icone={<Share2 size={18} color={colors.ink} />} onPress={partager} />
        <Bouton titre="Terminer" variante="secondaire" onPress={onTerminer} />
      </>
    );
  }

  return (
    <>
      <Carte>
        <Text className="text-muted">Locataire</Text>
        <Text className="text-lg font-semibold text-ink">{locataire.nom}</Text>
        {montantSuggere > 0 ? <Text className="text-muted mt-1">Reste à payer : {formatFCFA(montantSuggere)}</Text> : null}
      </Carte>
      <Choix
        libelle="Ce paiement concerne"
        options={[
          { valeur: 'loyer' as Objet, libelle: 'Le loyer' },
          { valeur: 'frais' as Objet, libelle: 'D’autres frais' },
        ]}
        valeur={objet}
        onChange={(o) => {
          setObjet(o);
          setErreur('');
        }}
      />
      <Champ libelle="Montant reçu (FCFA)" obligatoire value={montant} onChangeText={setMontant} keyboardType="number-pad" />
      {objet === 'loyer' && m && ctx.echeancier ? (
        <View className="bg-primary/10 rounded-xl px-4 py-3">
          {couvre ? (
            <Text className="text-ink text-sm">
              Après ce paiement, le loyer est réglé jusqu’à <Text className="font-bold text-primary">{formatMois(couvre.mois, couvre.annee)}</Text>
              {m > montantSuggere ? ', dont une avance sur les mois suivants.' : '.'}
            </Text>
          ) : (
            <Text className="text-ink text-sm">Ce montant ne règle pas encore entièrement le premier mois dû : il sera enregistré en paiement partiel.</Text>
          )}
        </View>
      ) : null}
      {objet === 'frais' ? (
        <>
          <Choix
            libelle="Nature des frais"
            options={ctx.categories.map((c) => ({ valeur: c.id, libelle: c.nom }))}
            valeur={categorieId}
            onChange={setCategorieId}
          />
          <Champ libelle="Objet" obligatoire value={libelle} onChangeText={setLibelle} placeholder="Ex. remplacement du robinet, facture d’eau" />
        </>
      ) : null}
      <Choix libelle="Mode de paiement" options={MODES} valeur={mode} onChange={setMode} />
      <ChampDate libelle="Date du paiement" valeur={date} onChange={setDate} />
      <Champ libelle="Référence" value={reference} onChangeText={setReference} placeholder="N° de transaction Mobile Money (facultatif)" />
      {objet === 'loyer' ? (
        <Text className="text-muted text-xs">
          Le paiement règle d’abord les mois les plus anciens. Un montant supérieur au dû est gardé en avance et règle automatiquement les
          mois suivants.
        </Text>
      ) : null}
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre={objet === 'loyer' ? 'Enregistrer le paiement du loyer' : 'Enregistrer les frais'} onPress={enregistrer} chargement={enCours} />
    </>
  );
}
