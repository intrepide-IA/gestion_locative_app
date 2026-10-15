import { useState } from 'react';
import { View } from 'react-native';
import { CheckCircle2, Share2 } from 'lucide-react-native';

import { ChampDate } from '../../components/ui/ChampDate';
import { Feuille } from '../../components/ui/Feuille';
import { informer } from '../../components/ui/confirmer';
import { Bouton, Carte, Champ, Choix, LigneInfo } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import { partagerRecu } from '../../documents';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatFCFA, lireMontant } from '../../domain/format';
import { enregistrerPaiement, LIBELLES_MODE, type ModePaiement, type ResultatPaiement } from '../../repositories/loyerRepository';
import { colors } from '../../theme/colors';

const MODES = (Object.keys(LIBELLES_MODE) as ModePaiement[]).map((m) => ({ valeur: m, libelle: LIBELLES_MODE[m] }));

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
  const [partage, setPartage] = useState(false);

  const enregistrer = async () => {
    const m = lireMontant(montant);
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
      setResultat(r);
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const partager = async () => {
    if (!resultat) return;
    setPartage(true);
    try {
      await partagerRecu(resultat.paiementId);
    } catch (error) {
      informer('Partage impossible', messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.'));
    } finally {
      setPartage(false);
    }
  };

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
        </Carte>
        <Bouton titre="Partager le reçu (PDF)" variante="action" icone={<Share2 size={18} color={colors.ink} />} onPress={partager} chargement={partage} />
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
      <Champ libelle="Montant reçu (FCFA)" obligatoire value={montant} onChangeText={setMontant} keyboardType="number-pad" />
      <Choix libelle="Mode de paiement" options={MODES} valeur={mode} onChange={setMode} />
      <ChampDate libelle="Date du paiement" valeur={date} onChange={setDate} />
      <Champ libelle="Référence" value={reference} onChangeText={setReference} placeholder="N° de transaction Mobile Money (facultatif)" />
      <Text className="text-muted text-xs">
        Le paiement règle d’abord les mois les plus anciens. Un montant supérieur au dû est conservé en avance.
      </Text>
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer le paiement" onPress={enregistrer} chargement={enCours} />
    </>
  );
}
