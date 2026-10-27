import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ChampDate } from '../../components/ui/ChampDate';
import { Bouton, Champ } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, lireMontant } from '../../domain/format';
import { corrigerLocataire, supprimerLocataireDefinitivement } from '../../repositories/correctionsRepository';
import type { Contrat, Locataire } from '../../repositories/locataireRepository';
import { pinService } from '../../security/native';
import { reinitialiserNotifications } from '../../services/notifications';

/** Vérifie le code PIN ; renvoie un message d'erreur, ou null si le code est bon. */
async function verifierPin(pin: string): Promise<string | null> {
  const r = await pinService.verify(pin);
  if (r.status === 'ok') return null;
  if (r.status === 'locked') return 'Trop d’essais : saisie du code bloquée pour un moment.';
  return 'Code PIN incorrect.';
}

function Confirmation({ motif, setMotif, pin, setPin }: { motif: string; setMotif: (v: string) => void; pin: string; setPin: (v: string) => void }) {
  return (
    <View className="gap-3 bg-accent/10 rounded-2xl p-4">
      <Champ libelle="Motif" obligatoire value={motif} onChangeText={setMotif} placeholder="Ex. erreur de saisie à l’entrée" multiline />
      <Champ
        libelle="Votre code PIN"
        obligatoire
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
      />
      <Text className="text-muted text-xs">Le motif est inscrit au journal des modifications (Paramètres), avec la date et l’heure.</Text>
    </View>
  );
}

/** Corriger toutes les informations du locataire et de son contrat (motif + code PIN). */
export function FormCorrection({ locataire, contrat, onEnregistre }: { locataire: Locataire; contrat: Contrat; onEnregistre: () => void }) {
  const [v, setV] = useState({
    nom: locataire.nom_complet,
    telephone: locataire.telephone ?? '',
    piece: locataire.piece_identite ?? '',
    loyer: String(contrat.loyer),
    toilettes: String(contrat.toilettes),
    caution: String(contrat.caution),
    cautionElec: String(contrat.caution_electricite ?? 0),
    cautionEau: String(contrat.caution_eau ?? 0),
    jour: String(contrat.jour_echeance),
    prixKwh: String(contrat.prix_kwh),
    releve: String(contrat.releve_initial).replace('.', ','),
  });
  const [dateDebut, setDateDebut] = useState(contrat.date_debut);
  const [motif, setMotif] = useState('');
  const [pin, setPin] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const champ = (cle: keyof typeof v) => ({ value: v[cle], onChangeText: (t: string) => setV((x) => ({ ...x, [cle]: t })) });

  const enregistrer = async () => {
    setErreur('');
    const montants = [v.loyer, v.toilettes, v.caution, v.cautionElec, v.cautionEau, v.jour, v.prixKwh].map(lireMontant);
    const releve = Number(v.releve.replace(',', '.'));
    if (montants.some((m) => m === null) || !Number.isFinite(releve)) return setErreur('Vérifiez les montants (chiffres uniquement).');
    if (motif.trim().length < 3) return setErreur('Indiquez le motif de la correction.');
    setEnCours(true);
    try {
      const erreurPin = await verifierPin(pin);
      if (erreurPin) return setErreur(erreurPin);
      await corrigerLocataire(
        await getDatabase(),
        contrat.id,
        { nom_complet: v.nom, telephone: v.telephone, piece_identite: v.piece },
        {
          date_debut: dateDebut,
          loyer: montants[0]!,
          toilettes: montants[1]!,
          caution: montants[2]!,
          caution_electricite: montants[3]!,
          caution_eau: montants[4]!,
          jour_echeance: montants[5]!,
          prix_kwh: montants[6]!,
          releve_initial: releve,
        },
        motif,
        aujourdhui()
      );
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Correction impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const deux = (a: ReactNode, b: ReactNode) => (
    <View className="flex-row gap-3">
      <View className="flex-1">{a}</View>
      <View className="flex-1">{b}</View>
    </View>
  );

  return (
    <>
      <Text className="text-muted">
        Pour corriger une erreur de saisie. Les mois déjà payés ne changent pas ; les autres sont recalculés avec les nouvelles conditions.
      </Text>
      <Champ libelle="Nom complet" obligatoire {...champ('nom')} />
      {deux(<Champ libelle="Téléphone (WhatsApp)" keyboardType="phone-pad" {...champ('telephone')} />, <Champ libelle="Pièce d’identité" {...champ('piece')} />)}
      <ChampDate libelle="Date d’entrée" valeur={dateDebut} onChange={setDateDebut} />
      {deux(<Champ libelle="Loyer" keyboardType="number-pad" {...champ('loyer')} />, <Champ libelle="Toilettes" keyboardType="number-pad" {...champ('toilettes')} />)}
      {deux(<Champ libelle="Caution loyer" keyboardType="number-pad" {...champ('caution')} />, <Champ libelle="Échéance (jour)" keyboardType="number-pad" {...champ('jour')} />)}
      {deux(
        <Champ libelle="Caution électricité" keyboardType="number-pad" {...champ('cautionElec')} />,
        <Champ libelle="Caution eau" keyboardType="number-pad" {...champ('cautionEau')} />
      )}
      {deux(
        <Champ libelle="Prix du kWh" keyboardType="number-pad" {...champ('prixKwh')} />,
        <Champ libelle="Relevé initial" keyboardType="decimal-pad" {...champ('releve')} />
      )}
      <Confirmation motif={motif} setMotif={setMotif} pin={pin} setPin={setPin} />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer la correction" onPress={enregistrer} chargement={enCours} desactive={pin.length < 4} />
    </>
  );
}

/** Supprimer définitivement le locataire et tout son historique (motif + code PIN + nom recopié). */
export function FormSuppression({ locataire, onSupprime }: { locataire: Locataire; onSupprime: () => void }) {
  const [motif, setMotif] = useState('');
  const [pin, setPin] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const nomOk = nom.trim().toLowerCase() === locataire.nom_complet.trim().toLowerCase();

  const supprimer = async () => {
    setErreur('');
    if (motif.trim().length < 3) return setErreur('Indiquez le motif de la suppression.');
    setEnCours(true);
    try {
      const erreurPin = await verifierPin(pin);
      if (erreurPin) return setErreur(erreurPin);
      await supprimerLocataireDefinitivement(await getDatabase(), locataire.id, motif);
      await reinitialiserNotifications();
      onSupprime();
    } catch (error) {
      setErreur(messageErreur(error, 'Suppression impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <>
      <View className="rounded-2xl p-4 bg-danger/10">
        <Text className="text-danger font-bold">Action définitive</Text>
        <Text className="text-ink text-sm mt-1">
          {locataire.nom_complet}, ses contrats, loyers, paiements, reçus, factures, électricité, contrat de bail et états des lieux seront
          effacés, ainsi que les montants correspondants en trésorerie. Seule une ligne du journal en gardera la trace.
        </Text>
        <Text className="text-muted text-xs mt-2">
          Pour un locataire simplement parti, utilisez plutôt « Enregistrer le départ » : son historique reste consultable.
        </Text>
      </View>
      <Champ libelle={`Recopiez le nom : ${locataire.nom_complet}`} value={nom} onChangeText={setNom} autoCapitalize="words" />
      <Confirmation motif={motif} setMotif={setMotif} pin={pin} setPin={setPin} />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Supprimer définitivement" variante="danger" onPress={supprimer} chargement={enCours} desactive={!nomOk || pin.length < 4} />
    </>
  );
}
