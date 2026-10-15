import { useState } from 'react';

import { Feuille } from '../../components/ui/Feuille';
import { Bouton, Champ, Choix } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import { messageErreur } from '../../domain/erreurs';
import { lireMontant } from '../../domain/format';
import {
  creerLogement,
  LIBELLES_TYPE_LOGEMENT,
  modifierLogement,
  type Logement,
  type TypeLogement,
} from '../../repositories/logementRepository';

const TYPES = (Object.keys(LIBELLES_TYPE_LOGEMENT) as TypeLogement[]).map((t) => ({
  valeur: t,
  libelle: LIBELLES_TYPE_LOGEMENT[t],
}));

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  /** Logement à modifier ; absent pour une création. */
  logement?: Logement | null;
  onEnregistre: (id: number) => void;
}

export function LogementForm({ ouverte, onFermer, logement, onEnregistre }: Props) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre={logement ? 'Modifier le logement' : 'Nouveau logement'}>
      <Formulaire logement={logement ?? null} onEnregistre={onEnregistre} />
    </Feuille>
  );
}

function Formulaire({ logement, onEnregistre }: { logement: Logement | null; onEnregistre: (id: number) => void }) {
  const [reference, setReference] = useState(logement?.reference ?? '');
  const [type, setType] = useState<TypeLogement>(logement?.type ?? 'chambre_salon');
  const [loyer, setLoyer] = useState(logement ? String(logement.loyer_indicatif) : '');
  const [toilettes, setToilettes] = useState(logement ? String(logement.toilettes) : '1000');
  const [description, setDescription] = useState(logement?.description ?? '');
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [erreurGenerale, setErreurGenerale] = useState('');
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async () => {
    const loyerNombre = lireMontant(loyer);
    const toilettesNombre = toilettes.trim() === '' ? 0 : lireMontant(toilettes);
    const nouvellesErreurs: Record<string, string> = {};
    if (!reference.trim()) nouvellesErreurs.reference = 'Indiquez une référence (ex. Chambre 1).';
    if (loyerNombre === null) nouvellesErreurs.loyer = 'Montant en FCFA, chiffres uniquement.';
    if (toilettesNombre === null) nouvellesErreurs.toilettes = 'Montant en FCFA, chiffres uniquement.';
    setErreurs(nouvellesErreurs);
    if (Object.keys(nouvellesErreurs).length) return;

    setEnCours(true);
    setErreurGenerale('');
    try {
      const db = await getDatabase();
      const donnees = { reference, type, description, loyer_indicatif: loyerNombre!, toilettes: toilettesNombre! };
      if (logement) {
        await modifierLogement(db, logement.id, donnees);
        onEnregistre(logement.id);
      } else {
        onEnregistre(await creerLogement(db, donnees));
      }
    } catch (error) {
      setErreurGenerale(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Champ
        libelle="Référence"
        obligatoire
        value={reference}
        onChangeText={setReference}
        placeholder="Ex. Chambre 1, Appartement A"
        erreur={erreurs.reference}
      />
      <Choix libelle="Type" options={TYPES} valeur={type} onChange={setType} />
      <Champ
        libelle="Loyer mensuel (FCFA)"
        obligatoire
        value={loyer}
        onChangeText={setLoyer}
        keyboardType="number-pad"
        placeholder="25000"
        erreur={erreurs.loyer}
        aide="Montant proposé par défaut aux nouveaux locataires."
      />
      <Champ
        libelle="Contribution toilettes (FCFA / mois)"
        value={toilettes}
        onChangeText={setToilettes}
        keyboardType="number-pad"
        erreur={erreurs.toilettes}
        aide="Laissez 0 si elle ne s’applique pas."
      />
      <Champ
        libelle="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Étage, équipements… (facultatif)"
        multiline
      />
      {erreurGenerale ? <Text className="text-danger text-center">{erreurGenerale}</Text> : null}
      <Bouton titre={logement ? 'Enregistrer les modifications' : 'Ajouter le logement'} onPress={enregistrer} chargement={enCours} />
    </>
  );
}
