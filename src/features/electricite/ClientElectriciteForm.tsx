import { useState } from 'react';
import { View } from 'react-native';

import { ChampDate } from '../../components/ui/ChampDate';
import { Feuille } from '../../components/ui/Feuille';
import { Bouton, Champ } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, lireMontant } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { creerClientElectricite } from '../../repositories/electriciteRepository';
import { lireParametreNombre } from '../../repositories/parametresRepository';

/**
 * Nouveau client « électricité seule » : une personne qui ne loue pas mais achète l'électricité.
 * Aucun loyer ni échéance : seulement ses ventes de kWh, ses relevés et ses avis.
 */
export function ClientElectriciteForm({
  ouverte,
  onFermer,
  onEnregistre,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onEnregistre: (contratId: number) => void;
}) {
  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Nouveau client électricité">
      {ouverte ? <Formulaire onEnregistre={onEnregistre} /> : null}
    </Feuille>
  );
}

const lirePrix = (db: Parameters<typeof lireParametreNombre>[0]) => lireParametreNombre(db, 'prix_kwh_defaut');

function Formulaire({ onEnregistre }: { onEnregistre: (contratId: number) => void }) {
  const { donnees: prixDefaut } = useRessource(lirePrix, 250);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [emplacement, setEmplacement] = useState('');
  const [index, setIndex] = useState('');
  const [prix, setPrix] = useState('');
  const [caution, setCaution] = useState('');
  const [date, setDate] = useState(aujourdhui());
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async () => {
    const releve = Number(index.replace(',', '.'));
    if (!nom.trim()) return setErreur('Indiquez le nom du client.');
    if (index.trim() === '' || !Number.isFinite(releve) || releve < 0) return setErreur('Indiquez l’index actuel du compteur.');
    const prixKwh = prix.trim() === '' ? prixDefaut : lireMontant(prix);
    const montantCaution = caution.trim() === '' ? 0 : lireMontant(caution);
    if (!prixKwh) return setErreur('Prix du kWh invalide.');
    if (montantCaution === null) return setErreur('Caution invalide (chiffres uniquement).');
    setEnCours(true);
    setErreur('');
    try {
      const { contratId } = await creerClientElectricite(await getDatabase(), {
        nom_complet: nom,
        telephone,
        emplacement,
        prix_kwh: prixKwh,
        releve_initial: releve,
        date_debut: date,
        caution_electricite: montantCaution,
      });
      onEnregistre(contratId);
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Text className="text-muted">
        Pour une personne qui n’habite pas chez vous mais vous achète l’électricité : pas de loyer, seulement les ventes de kWh, les relevés et
        les avis.
      </Text>
      <Champ libelle="Nom complet" obligatoire value={nom} onChangeText={setNom} />
      <Champ libelle="Téléphone (WhatsApp)" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" placeholder="01 XX XX XX XX" />
      <Champ
        libelle="Emplacement du compteur"
        value={emplacement}
        onChangeText={setEmplacement}
        placeholder={nom.trim() ? `Compteur — ${nom.trim()}` : 'Ex. Boutique devant la maison'}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ libelle="Index actuel" obligatoire value={index} onChangeText={setIndex} keyboardType="decimal-pad" />
        </View>
        <View className="flex-1">
          <Champ libelle="Prix du kWh" value={prix} onChangeText={setPrix} keyboardType="number-pad" placeholder={String(prixDefaut)} />
        </View>
      </View>
      <Champ
        libelle="Caution électricité (FCFA)"
        value={caution}
        onChangeText={setCaution}
        keyboardType="number-pad"
        placeholder="0"
        aide="Facultative. À l’arrêt du suivi, l’électricité consommée sans crédit y est retenue."
      />
      <ChampDate libelle="Début du suivi" valeur={date} onChange={setDate} />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer le client" onPress={enregistrer} chargement={enCours} />
    </>
  );
}
