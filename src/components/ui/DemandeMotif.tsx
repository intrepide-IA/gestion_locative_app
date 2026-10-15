import { useState } from 'react';

import { Feuille } from './Feuille';
import { Bouton, Champ, Choix } from './kit';
import { Text } from './Text';

const MOTIFS_COURANTS = ['Erreur de saisie', 'Doublon', 'Montant erroné', 'Annulé à la demande du locataire'];

/**
 * Demande le motif d'une annulation (obligatoire pour la traçabilité), puis exécute l'action.
 * Le formulaire n'est monté qu'à l'ouverture : il repart vide à chaque fois.
 */
export function DemandeMotif({
  ouverte,
  titre,
  explication,
  libelleAction,
  onFermer,
  onValider,
}: {
  ouverte: boolean;
  titre: string;
  explication: string;
  libelleAction: string;
  onFermer: () => void;
  /** Reçoit le motif ; une erreur levée est affichée dans la feuille. */
  onValider: (motif: string) => Promise<void>;
}) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={titre}>
      {ouverte ? <Formulaire explication={explication} libelleAction={libelleAction} onValider={onValider} /> : null}
    </Feuille>
  );
}

function Formulaire({ explication, libelleAction, onValider }: { explication: string; libelleAction: string; onValider: (m: string) => Promise<void> }) {
  const [choix, setChoix] = useState<string>(MOTIFS_COURANTS[0]);
  const [autre, setAutre] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    const motif = choix === 'autre' ? autre.trim() : choix;
    if (!motif) return setErreur('Précisez le motif.');
    setEnCours(true);
    setErreur('');
    try {
      await onValider(motif);
    } catch (error) {
      setErreur(error instanceof Error ? error.message : 'Action impossible.');
      setEnCours(false);
    }
  };

  return (
    <>
      <Text className="text-muted">{explication}</Text>
      <Choix
        libelle="Motif"
        options={[...MOTIFS_COURANTS.map((m) => ({ valeur: m, libelle: m })), { valeur: 'autre', libelle: 'Autre motif…' }]}
        valeur={choix}
        onChange={setChoix}
      />
      {choix === 'autre' ? <Champ libelle="Motif" value={autre} onChangeText={setAutre} placeholder="Décrivez la raison" /> : null}
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre={libelleAction} variante="danger" onPress={valider} chargement={enCours} />
    </>
  );
}
