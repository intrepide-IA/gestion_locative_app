import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { ChampDate } from '../../components/ui/ChampDate';
import { Feuille } from '../../components/ui/Feuille';
import { Bouton, Champ, Chargement, Choix } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate, formatFCFA, lireMontant } from '../../domain/format';
import { dateEcheance, jourEcheanceParDefaut, premierMoisFacture } from '../../domain/echeances';
import { useRessource } from '../../hooks/useRessource';
import { listerLogements, type LogementAvecOccupant } from '../../repositories/logementRepository';
import { entrerLocataire } from '../../repositories/locataireRepository';
import { lireParametreNombre } from '../../repositories/parametresRepository';

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  /** Logement présélectionné (depuis la fiche d'un logement libre). */
  logementId?: number | null;
  onEnregistre: (locataireId: number) => void;
}

/** Entrée d'un locataire : fiche, logement libre et conditions du contrat, enregistrés ensemble. */
export function EntreeLocataireForm({ ouverte, onFermer, logementId, onEnregistre }: Props) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Nouveau locataire">
      <Formulaire logementInitial={logementId ?? null} onEnregistre={onEnregistre} />
    </Feuille>
  );
}

interface Contexte {
  logementsLibres: LogementAvecOccupant[];
  prixKwh: number;
  jourEcheance: number;
}

const lireContexte = async (db: SqlDatabase): Promise<Contexte> => {
  const [logements, prixKwh, jourEcheance] = await Promise.all([
    listerLogements(db),
    lireParametreNombre(db, 'prix_kwh_defaut'),
    lireParametreNombre(db, 'jour_echeance_defaut'),
  ]);
  return { logementsLibres: logements.filter((l) => l.contrat_id === null), prixKwh, jourEcheance };
};

const CONTEXTE_VIDE: Contexte = { logementsLibres: [], prixKwh: 250, jourEcheance: 5 };

function Formulaire({ logementInitial, onEnregistre }: { logementInitial: number | null; onEnregistre: (id: number) => void }) {
  const { donnees: ctx, chargement } = useRessource(lireContexte, CONTEXTE_VIDE);
  if (chargement) return <Chargement />;
  if (ctx.logementsLibres.length === 0) {
    return (
      <View className="py-6">
        <Text className="text-ink font-semibold text-center">Aucun logement libre</Text>
        <Text className="text-muted text-center mt-1">
          Ajoutez un logement, ou enregistrez le départ d’un locataire, avant une nouvelle entrée.
        </Text>
      </View>
    );
  }
  return <Champs ctx={ctx} logementInitial={logementInitial} onEnregistre={onEnregistre} />;
}

function Champs({ ctx, logementInitial, onEnregistre }: { ctx: Contexte; logementInitial: number | null; onEnregistre: (id: number) => void }) {
  const initial = ctx.logementsLibres.find((l) => l.id === logementInitial) ?? (ctx.logementsLibres.length === 1 ? ctx.logementsLibres[0] : null);

  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [piece, setPiece] = useState('');
  const [logementId, setLogementId] = useState<number | null>(initial?.id ?? null);
  const [dateEntree, setDateEntree] = useState(aujourdhui());
  const [loyer, setLoyer] = useState(initial ? String(initial.loyer_indicatif) : '');
  const [toilettes, setToilettes] = useState(initial ? String(initial.toilettes) : '');
  const [caution, setCaution] = useState('');
  const [prixKwh, setPrixKwh] = useState(String(ctx.prixKwh));
  const [jour, setJour] = useState(String(jourEcheanceParDefaut(aujourdhui())));
  const [releve, setReleve] = useState('');
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [erreurGenerale, setErreurGenerale] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Choisir un logement propose son loyer et ses toilettes (modifiables).
  const choisirLogement = useCallback(
    (id: number) => {
      setLogementId(id);
      const l = ctx.logementsLibres.find((x) => x.id === id);
      if (l) {
        setLoyer(String(l.loyer_indicatif));
        setToilettes(String(l.toilettes));
      }
    },
    [ctx.logementsLibres]
  );

  const enregistrer = async () => {
    const montants = {
      loyer: lireMontant(loyer),
      toilettes: toilettes.trim() === '' ? 0 : lireMontant(toilettes),
      caution: caution.trim() === '' ? 0 : lireMontant(caution),
      prixKwh: lireMontant(prixKwh),
      jour: lireMontant(jour),
      releve: releve.trim() === '' ? 0 : Number(releve.replace(',', '.')),
    };
    const e: Record<string, string> = {};
    if (!nom.trim()) e.nom = 'Indiquez le nom du locataire.';
    if (logementId === null) e.logement = 'Choisissez le logement.';
    if (montants.loyer === null) e.loyer = 'Montant en FCFA, chiffres uniquement.';
    if (montants.toilettes === null) e.toilettes = 'Montant en FCFA, chiffres uniquement.';
    if (montants.caution === null) e.caution = 'Montant en FCFA, chiffres uniquement.';
    if (!montants.prixKwh) e.prixKwh = 'Prix en FCFA, supérieur à 0.';
    if (montants.jour === null || montants.jour < 1 || montants.jour > 28) e.jour = 'Un jour entre 1 et 28.';
    if (!Number.isFinite(montants.releve) || montants.releve < 0) e.releve = 'Index du compteur invalide.';
    setErreurs(e);
    if (Object.keys(e).length) return;

    setEnCours(true);
    setErreurGenerale('');
    try {
      const { locataireId } = await entrerLocataire(
        await getDatabase(),
        { nom_complet: nom, telephone, piece_identite: piece },
        logementId!,
        {
          date_debut: dateEntree,
          loyer: montants.loyer!,
          toilettes: montants.toilettes!,
          caution: montants.caution!,
          prix_kwh: montants.prixKwh!,
          jour_echeance: montants.jour!,
          releve_initial: montants.releve,
        }
      );
      onEnregistre(locataireId);
    } catch (error) {
      setErreurGenerale(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Text className="text-xs font-bold text-muted uppercase tracking-wider">Locataire</Text>
      <Champ libelle="Nom complet" obligatoire value={nom} onChangeText={setNom} erreur={erreurs.nom} placeholder="Ex. Awa Houngbo" />
      <Champ libelle="Téléphone" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" placeholder="+229 …" />
      <Champ libelle="Pièce d’identité" value={piece} onChangeText={setPiece} placeholder="N° CNI ou passeport (facultatif)" />

      <Text className="text-xs font-bold text-muted uppercase tracking-wider mt-2">Logement</Text>
      <Choix
        libelle="Logement libre"
        options={ctx.logementsLibres.map((l) => ({ valeur: l.id, libelle: l.reference, detail: formatFCFA(l.loyer_indicatif) }))}
        valeur={logementId}
        onChange={choisirLogement}
        erreur={erreurs.logement}
      />

      <Text className="text-xs font-bold text-muted uppercase tracking-wider mt-2">Contrat</Text>
      <ChampDate
        libelle="Date d’entrée (remise des clés)"
        valeur={dateEntree}
        onChange={(d) => {
          setDateEntree(d);
          setJour(String(jourEcheanceParDefaut(d)));
        }}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ libelle="Loyer (FCFA)" obligatoire value={loyer} onChangeText={setLoyer} keyboardType="number-pad" erreur={erreurs.loyer} />
        </View>
        <View className="flex-1">
          <Champ libelle="Toilettes (FCFA)" value={toilettes} onChangeText={setToilettes} keyboardType="number-pad" erreur={erreurs.toilettes} />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ libelle="Caution reçue (FCFA)" value={caution} onChangeText={setCaution} keyboardType="number-pad" placeholder="0" erreur={erreurs.caution} />
        </View>
        <View className="flex-1">
          <Champ libelle="Échéance (jour)" value={jour} onChangeText={setJour} keyboardType="number-pad" erreur={erreurs.jour} />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ libelle="Prix du kWh (FCFA)" value={prixKwh} onChangeText={setPrixKwh} keyboardType="number-pad" erreur={erreurs.prixKwh} />
        </View>
        <View className="flex-1">
          <Champ
            libelle="Relevé du compteur"
            value={releve}
            onChangeText={setReleve}
            keyboardType="decimal-pad"
            placeholder="0"
            erreur={erreurs.releve}
          />
        </View>
      </View>
      <PremierLoyer dateEntree={dateEntree} jour={jour} />
      {erreurGenerale ? <Text className="text-danger text-center">{erreurGenerale}</Text> : null}
      <Bouton titre="Enregistrer l’entrée" onPress={enregistrer} chargement={enCours} />
    </>
  );
}

/** Rappel de la règle : caution à l'entrée, premier loyer le mois suivant. */
function PremierLoyer({ dateEntree, jour }: { dateEntree: string; jour: string }) {
  const j = Number(jour);
  if (!Number.isInteger(j) || j < 1 || j > 28) return null;
  const [annee, mois] = premierMoisFacture(dateEntree).split('-').map(Number);
  return (
    <View className="bg-primary/10 rounded-xl px-4 py-3">
      <Text className="text-ink text-sm">
        La caution est versée à l’entrée. Premier loyer dû le{' '}
        <Text className="font-bold text-primary">{formatDate(dateEcheance(annee, mois, j, dateEntree))}</Text>, puis le {j} de chaque mois.
      </Text>
    </View>
  );
}
