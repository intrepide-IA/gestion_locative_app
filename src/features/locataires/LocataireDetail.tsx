import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { DoorOpen, Pencil, Phone, Trash2, FileSignature, Wallet, Zap } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { ChampDate } from '../../components/ui/ChampDate';
import { Feuille } from '../../components/ui/Feuille';
import { confirmer, informer } from '../../components/ui/confirmer';
import { Badge, Bouton, Carte, Champ, Chargement, Choix, LigneInfo } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate, formatFCFA, formatMois, initiales, lireMontant } from '../../domain/format';
import type { Echeancier, StatutLigne } from '../../domain/echeances';
import { useRessource } from '../../hooks/useRessource';
import {
  contratsDuLocataire,
  getContratActif,
  getLocataire,
  modifierConditionsContrat,
  modifierFicheLocataire,
  retirerLocataire,
  cautionTotale,
  proposerSoldeCaution,
  terminerContrat,
  type Contrat,
  type LocataireAvecContrat,
} from '../../repositories/locataireRepository';
import { degradations, getEtatDesLieux } from '../../repositories/etatDesLieuxRepository';
import { situationElectricite } from '../../repositories/electriciteRepository';
import { colors } from '../../theme/colors';
import { preparerRecu } from '../../documents';
import { useApercu } from '../../components/documents/Apercu';
import {
  echeancierDuLocataire,
  genererEcheances,
  LIBELLES_MODE,
  paiementsDuLocataire,
  situationLocataire,
  type PaiementDetaille,
  type SituationLocataire,
} from '../../repositories/loyerRepository';
import { PaiementForm } from '../loyers/PaiementForm';
import { ElectriciteDetail } from '../electricite/ElectriciteDetail';
import { synchroniserNotifications } from '../../services/notifications';

type Vue = 'fiche' | 'modifier' | 'conditions' | 'depart';

interface Props {
  locataireId: number | null;
  onFermer: () => void;
  /** Appelé après toute modification, pour rafraîchir la liste. */
  onModifie: () => void;
}

export function LocataireDetail({ locataireId, onFermer, onModifie }: Props) {
  const [vue, setVue] = useState<Vue>('fiche');
  const navigation = useNavigation<{ navigate: (ecran: string, params?: object) => void }>();
  const fermer = () => {
    setVue('fiche');
    onFermer();
  };
  const titres: Record<Vue, string> = {
    fiche: 'Fiche locataire',
    modifier: 'Modifier la fiche',
    conditions: 'Conditions du contrat',
    depart: 'Départ du locataire',
  };
  return (
    <Feuille ouverte={locataireId !== null} onFermer={fermer} titre={titres[vue]}>
      {locataireId !== null ? (
        <Contenu
          locataireId={locataireId}
          vue={vue}
          setVue={setVue}
          onModifie={() => {
            setVue('fiche');
            onModifie();
          }}
          onRetire={() => {
            setVue('fiche');
            onModifie();
            onFermer();
          }}
          onOuvrirBail={(contratId) => {
            // La feuille se ferme d'abord : une fenêtre modale resterait au-dessus du nouvel écran.
            fermer();
            navigation.navigate('Bail', { contratId });
          }}
        />
      ) : null}
    </Feuille>
  );
}

interface Donnees {
  locataire: LocataireAvecContrat | null;
  contrat: Contrat | null;
  historique: Awaited<ReturnType<typeof contratsDuLocataire>>;
  situation: SituationLocataire;
  paiements: PaiementDetaille[];
  echeancier: Echeancier;
}

function Contenu({
  locataireId,
  vue,
  setVue,
  onModifie,
  onRetire,
  onOuvrirBail,
}: {
  locataireId: number;
  vue: Vue;
  setVue: (v: Vue) => void;
  onModifie: () => void;
  onRetire: () => void;
  onOuvrirBail: (contratId: number) => void;
}) {
  const lire = useCallback(
    async (db: SqlDatabase): Promise<Donnees> => {
      await genererEcheances(db, aujourdhui());
      const jour = aujourdhui();
      const [locataire, contrat, historique, situation, paiements, echeancier] = await Promise.all([
        getLocataire(db, locataireId),
        getContratActif(db, locataireId),
        contratsDuLocataire(db, locataireId),
        situationLocataire(db, locataireId),
        paiementsDuLocataire(db, locataireId),
        echeancierDuLocataire(db, locataireId, jour, 6),
      ]);
      void synchroniserNotifications();
      return { locataire, contrat, historique, situation, paiements, echeancier };
    },
    [locataireId]
  );
  const { donnees, chargement, rafraichir } = useRessource<Donnees>(lire, {
    locataire: null,
    contrat: null,
    historique: [],
    situation: { du: 0, regle: 0, dette: 0, credit: 0 },
    paiements: [],
    echeancier: { lignes: [], payeJusqua: null, prochain: null },
  });
  const { locataire, contrat, historique, situation, paiements, echeancier } = donnees;
  const [encaisser, setEncaisser] = useState(false);
  const ouvrirApercu = useApercu();
  const [electricite, setElectricite] = useState(false);

  if (chargement && !locataire) return <Chargement />;
  if (!locataire) return <Text className="text-muted text-center py-8">Locataire introuvable.</Text>;

  const apres = () => {
    rafraichir();
    onModifie();
  };

  if (vue === 'modifier') return <FormFiche locataire={locataire} onEnregistre={apres} />;
  if (vue === 'conditions' && contrat) return <FormConditions contrat={contrat} onEnregistre={apres} />;
  if (vue === 'depart' && contrat) return <FormDepart contrat={contrat} nom={locataire.nom_complet} onEnregistre={apres} />;

  const retirer = async () => {
    const ok = await confirmer(
      'Retirer ce locataire ?',
      'Sa fiche sera archivée : ses contrats et son historique restent conservés.',
      'Retirer',
      true
    );
    if (!ok) return;
    try {
      await retirerLocataire(await getDatabase(), locataire.id);
      onRetire();
    } catch (error) {
      informer('Impossible de retirer', messageErreur(error));
    }
  };

  return (
    <>
      <View className="items-center">
        <View className="w-16 h-16 rounded-full bg-primary items-center justify-center">
          <Text className="text-white text-xl font-bold">{initiales(locataire.nom_complet)}</Text>
        </View>
        <Text className="text-xl font-bold text-ink mt-2 text-center">{locataire.nom_complet}</Text>
        <View className="mt-1">
          <Badge libelle={contrat ? 'Locataire actif' : 'Parti'} ton={contrat ? 'succes' : 'neutre'} />
        </View>
        {locataire.telephone ? (
          <Bouton
            titre={locataire.telephone}
            variante="discret"
            icone={<Phone size={16} color={colors.primary} />}
            onPress={() => Linking.openURL(`tel:${locataire.telephone!.replace(/\s/g, '')}`)}
          />
        ) : null}
      </View>

      <Carte>
        <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Situation</Text>
        <LigneInfo
          libelle="Reste à payer"
          valeur={<Text className={`font-bold ${situation.dette > 0 ? 'text-danger' : 'text-primary'}`}>{formatFCFA(situation.dette)}</Text>}
        />
        {situation.credit > 0 ? <LigneInfo libelle="Avance (crédit)" valeur={formatFCFA(situation.credit)} /> : null}
        <LigneInfo libelle="Total réglé" valeur={formatFCFA(situation.regle)} />
      </Carte>
      <Bouton titre="Encaisser un paiement" icone={<Wallet size={18} color={colors.white} />} onPress={() => setEncaisser(true)} />

      {echeancier.lignes.length ? <CarteEcheancier echeancier={echeancier} /> : null}

      {contrat ? (
        <Bouton
          titre="Contrat de bail (signature, PDF)"
          variante="secondaire"
          icone={<FileSignature size={18} color={colors.primary} />}
          onPress={() => onOuvrirBail(contrat.id)}
        />
      ) : null}
      {contrat ? (
        <Bouton titre="Électricité (stock, ventes, relevés)" variante="secondaire" icone={<Zap size={18} color={colors.primary} />} onPress={() => setElectricite(true)} />
      ) : null}

      {contrat ? (
        <Carte>
          <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Contrat en cours</Text>
          <LigneInfo libelle="Logement" valeur={locataire.logement_reference ?? '—'} />
          <LigneInfo libelle="Depuis le" valeur={formatDate(contrat.date_debut)} />
          {contrat.date_fin ? <LigneInfo libelle="Fin prévue" valeur={formatDate(contrat.date_fin)} /> : null}
          <LigneInfo libelle="Loyer" valeur={formatFCFA(contrat.loyer)} />
          <LigneInfo libelle="Toilettes" valeur={formatFCFA(contrat.toilettes)} />
          <LigneInfo libelle="Total mensuel" valeur={formatFCFA(contrat.loyer + contrat.toilettes)} />
          <LigneInfo libelle="Échéance" valeur={`le ${contrat.jour_echeance} du mois`} />
          <LigneInfo libelle="Caution loyer" valeur={formatFCFA(contrat.caution)} />
          {contrat.caution_electricite ? <LigneInfo libelle="Caution électricité" valeur={formatFCFA(contrat.caution_electricite)} /> : null}
          {contrat.caution_eau ? <LigneInfo libelle="Caution eau" valeur={formatFCFA(contrat.caution_eau)} /> : null}
          <LigneInfo libelle="Prix du kWh" valeur={formatFCFA(contrat.prix_kwh)} />
          <LigneInfo libelle="Relevé initial" valeur={`${contrat.releve_initial} kWh`} />
        </Carte>
      ) : null}

      {locataire.piece_identite || locataire.notes ? (
        <Carte>
          {locataire.piece_identite ? <LigneInfo libelle="Pièce d’identité" valeur={locataire.piece_identite} /> : null}
          {locataire.notes ? <Text className="text-muted pt-2">{locataire.notes}</Text> : null}
        </Carte>
      ) : null}

      {historique.filter((c) => c.statut === 'termine').length ? (
        <Carte>
          <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Contrats terminés</Text>
          {historique
            .filter((c) => c.statut === 'termine')
            .map((c) => (
              <LigneInfo
                key={c.id}
                libelle={c.logement_reference}
                valeur={`${formatDate(c.date_debut)} → ${c.date_sortie ? formatDate(c.date_sortie) : '—'}`}
              />
            ))}
        </Carte>
      ) : null}

      {paiements.length ? (
        <Carte>
          <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Paiements</Text>
          {paiements.slice(0, 10).map((p) => (
            <LigneInfo
              key={p.id}
              libelle={`${formatDate(p.date_paiement)} · ${LIBELLES_MODE[p.mode]}`}
              valeur={
                <Text
                  onPress={() => ouvrirApercu(() => preparerRecu(p.id))}
                  className={`font-semibold ${p.annule_le ? 'text-muted line-through' : 'text-primary'}`}
                  accessibilityRole="button"
                  accessibilityHint="Voir le reçu"
                >
                  {formatFCFA(p.montant)}
                </Text>
              }
            />
          ))}
          <Text className="text-muted text-xs pt-2">Touchez un montant pour partager son reçu.</Text>
        </Carte>
      ) : null}

      <ElectriciteDetail contratId={electricite && contrat ? contrat.id : null} onFermer={() => setElectricite(false)} onModifie={apres} />

      <PaiementForm
        ouverte={encaisser}
        locataire={{ id: locataire.id, nom: locataire.nom_complet }}
        montantSuggere={situation.dette}
        onFermer={() => setEncaisser(false)}
        onEnregistre={apres}
      />

      <Bouton titre="Modifier la fiche" variante="secondaire" icone={<Pencil size={18} color={colors.primary} />} onPress={() => setVue('modifier')} />
      {contrat ? (
        <>
          <Bouton
            titre="Modifier les conditions"
            variante="secondaire"
            icone={<FileSignature size={18} color={colors.primary} />}
            onPress={() => setVue('conditions')}
          />
          <Bouton titre="Enregistrer le départ" variante="danger" icone={<DoorOpen size={18} color={colors.danger} />} onPress={() => setVue('depart')} />
        </>
      ) : (
        <Bouton titre="Retirer de la liste" variante="danger" icone={<Trash2 size={18} color={colors.danger} />} onPress={retirer} />
      )}
    </>
  );
}

function FormFiche({ locataire, onEnregistre }: { locataire: LocataireAvecContrat; onEnregistre: () => void }) {
  const [nom, setNom] = useState(locataire.nom_complet);
  const [telephone, setTelephone] = useState(locataire.telephone ?? '');
  const [piece, setPiece] = useState(locataire.piece_identite ?? '');
  const [notes, setNotes] = useState(locataire.notes ?? '');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async () => {
    setEnCours(true);
    setErreur('');
    try {
      await modifierFicheLocataire(await getDatabase(), locataire.id, { nom_complet: nom, telephone, piece_identite: piece, notes });
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Champ libelle="Nom complet" obligatoire value={nom} onChangeText={setNom} />
      <Champ libelle="Téléphone" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" />
      <Champ libelle="Pièce d’identité" value={piece} onChangeText={setPiece} />
      <Champ libelle="Notes internes" value={notes} onChangeText={setNotes} multiline placeholder="Visibles par vous seul" />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer" onPress={enregistrer} chargement={enCours} />
    </>
  );
}

function FormConditions({ contrat, onEnregistre }: { contrat: Contrat; onEnregistre: () => void }) {
  const [loyer, setLoyer] = useState(String(contrat.loyer));
  const [toilettes, setToilettes] = useState(String(contrat.toilettes));
  const [caution, setCaution] = useState(String(contrat.caution));
  const [cautionElec, setCautionElec] = useState(String(contrat.caution_electricite ?? 0));
  const [cautionEau, setCautionEau] = useState(String(contrat.caution_eau ?? 0));
  const [prixKwh, setPrixKwh] = useState(String(contrat.prix_kwh));
  const [jour, setJour] = useState(String(contrat.jour_echeance));
  const [avecFin, setAvecFin] = useState<'non' | 'oui'>(contrat.date_fin ? 'oui' : 'non');
  const [dateFin, setDateFin] = useState(contrat.date_fin ?? contrat.date_debut);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async () => {
    const v = [loyer, toilettes, caution, prixKwh, jour, cautionElec, cautionEau].map(lireMontant);
    if (v.some((x) => x === null)) {
      setErreur('Montants en FCFA, chiffres uniquement.');
      return;
    }
    setEnCours(true);
    setErreur('');
    try {
      await modifierConditionsContrat(await getDatabase(), contrat.id, {
        date_fin: avecFin === 'oui' ? dateFin : null,
        loyer: v[0]!,
        toilettes: v[1]!,
        caution: v[2]!,
        caution_electricite: v[5]!,
        caution_eau: v[6]!,
        prix_kwh: v[3]!,
        jour_echeance: v[4]!,
      });
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Text className="text-muted">
        Les nouveaux montants s’appliqueront aux prochaines échéances. Les échéances déjà créées ne changent pas.
      </Text>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ libelle="Loyer (FCFA)" value={loyer} onChangeText={setLoyer} keyboardType="number-pad" />
        </View>
        <View className="flex-1">
          <Champ libelle="Toilettes (FCFA)" value={toilettes} onChangeText={setToilettes} keyboardType="number-pad" />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ libelle="Caution loyer (FCFA)" value={caution} onChangeText={setCaution} keyboardType="number-pad" />
        </View>
        <View className="flex-1">
          <Champ libelle="Échéance (jour)" value={jour} onChangeText={setJour} keyboardType="number-pad" />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Champ libelle="Caution électricité" value={cautionElec} onChangeText={setCautionElec} keyboardType="number-pad" />
        </View>
        <View className="flex-1">
          <Champ libelle="Caution eau" value={cautionEau} onChangeText={setCautionEau} keyboardType="number-pad" />
        </View>
      </View>
      <Champ libelle="Prix du kWh (FCFA)" value={prixKwh} onChangeText={setPrixKwh} keyboardType="number-pad" />
      <Choix
        libelle="Fin du contrat"
        options={[
          { valeur: 'non', libelle: 'Sans date de fin' },
          { valeur: 'oui', libelle: 'Date de fin prévue' },
        ]}
        valeur={avecFin}
        onChange={setAvecFin}
      />
      {avecFin === 'oui' ? (
        <ChampDate libelle="Date de fin" valeur={dateFin} onChange={setDateFin} minimum={contrat.date_debut} />
      ) : null}
      <Text className="text-muted text-xs">Un rappel est envoyé 7 jours avant la date de fin.</Text>
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer les conditions" onPress={enregistrer} chargement={enCours} />
    </>
  );
}

function FormDepart({ contrat, nom, onEnregistre }: { contrat: Contrat; nom: string; onEnregistre: () => void }) {
  const [date, setDate] = useState(aujourdhui());
  const lire = useCallback(
    async (db: SqlDatabase) => {
      const [situation, entree, sortie, elec] = await Promise.all([
        situationLocataire(db, contrat.locataire_id),
        getEtatDesLieux(db, contrat.id, 'entree', aujourdhui()),
        getEtatDesLieux(db, contrat.id, 'sortie', aujourdhui()),
        situationElectricite(db, contrat.id),
      ]);
      return {
        dette: situation.dette,
        // Électricité consommée au-delà du crédit payé : à retenir sur la caution.
        deficitElectricite: elec && elec.stock < 0 ? Math.round(-elec.stock * elec.prix_kwh) : 0,
        degradations: entree.enregistre && sortie.enregistre ? degradations(entree.elements, sortie.elements) : [],
      };
    },
    [contrat.id, contrat.locataire_id]
  );
  const { donnees, chargement } = useRessource(lire, { dette: 0, deficitElectricite: 0, degradations: [] as ReturnType<typeof degradations> });
  const [reparations, setReparations] = useState('');
  const [eau, setEau] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const montantReparations = reparations.trim() === '' ? 0 : lireMontant(reparations);
  const montantEau = eau.trim() === '' ? 0 : lireMontant(eau);
  const charges = donnees.deficitElectricite + (montantEau ?? 0);
  const fonds = cautionTotale(contrat);
  const d = proposerSoldeCaution(fonds, donnees.dette, montantReparations ?? 0, charges);
  const motifCharges = [
    donnees.deficitElectricite ? `électricité consommée ${formatFCFA(donnees.deficitElectricite)}` : '',
    montantEau ? `eau ${formatFCFA(montantEau)}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const enregistrer = async () => {
    if (montantReparations === null) return setErreur('Montant des réparations invalide.');
    if (montantEau === null) return setErreur('Montant de l’eau invalide.');
    const ok = await confirmer(
      'Confirmer le départ ?',
      `Le contrat de ${nom} sera terminé le ${formatDate(date)}. Cautions : ${formatFCFA(d.retenueImpayes)} pour les loyers, ${formatFCFA(
        d.retenueCharges
      )} pour les charges, ${formatFCFA(d.retenueReparations)} pour les réparations, ${formatFCFA(d.cautionRendue)} rendus au locataire.`,
      'Confirmer le départ'
    );
    if (!ok) return;
    setEnCours(true);
    setErreur('');
    try {
      await terminerContrat(await getDatabase(), contrat.id, date, {
        retenueImpayes: d.retenueImpayes,
        retenueReparations: d.retenueReparations,
        retenueCharges: d.retenueCharges,
        motifCharges,
        motifReparations: motif,
        cautionRendue: d.cautionRendue,
      });
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  if (chargement) return <Chargement />;

  return (
    <>
      <Text className="text-muted">
        Le contrat est terminé à cette date et le logement redevient libre. La caution n’est pas un loyer : on en retire les loyers impayés et
        les réparations, et on rend le reste.
      </Text>
      <ChampDate libelle="Date de sortie" valeur={date} onChange={setDate} minimum={contrat.date_debut} />
      {donnees.degradations.length ? (
        <View className="rounded-xl p-3 bg-danger/10">
          <Text className="font-semibold text-danger">Dégradations constatées (état des lieux)</Text>
          {donnees.degradations.map((g) => (
            <Text key={g.element} className="text-ink text-sm">
              • {g.element}
            </Text>
          ))}
        </View>
      ) : null}
      {donnees.deficitElectricite ? (
        <Text className="text-ink text-sm">
          Électricité consommée sans crédit : <Text className="font-bold">{formatFCFA(donnees.deficitElectricite)}</Text>, retenue sur la caution.
        </Text>
      ) : null}
      <Champ
        libelle="Eau à payer (FCFA)"
        value={eau}
        onChangeText={setEau}
        keyboardType="number-pad"
        placeholder="0"
        aide="Facture d’eau restant à régler par le locataire, s’il y en a."
      />
      <Champ
        libelle="Coût des réparations (FCFA)"
        value={reparations}
        onChangeText={setReparations}
        keyboardType="number-pad"
        placeholder="0"
        aide="Dégradations à réparer aux frais du locataire."
      />
      {montantReparations ? <Champ libelle="Réparations concernées" obligatoire value={motif} onChangeText={setMotif} placeholder="Ex. porte, robinet" /> : null}
      <Carte>
        <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Décompte de la caution</Text>
        <LigneInfo libelle="Cautions versées à l’entrée" valeur={formatFCFA(fonds)} />
        <LigneInfo libelle="− Loyers impayés" valeur={formatFCFA(d.retenueImpayes)} />
        <LigneInfo libelle="− Charges (électricité, eau)" valeur={formatFCFA(d.retenueCharges)} />
        <LigneInfo libelle="− Réparations" valeur={formatFCFA(d.retenueReparations)} />
        <LigneInfo libelle="À rendre au locataire" valeur={<Text className="font-bold text-primary">{formatFCFA(d.cautionRendue)}</Text>} />
        {d.resteDu > 0 ? (
          <Text className="text-danger text-sm pt-2">Les cautions ne suffisent pas : {nom} doit encore {formatFCFA(d.resteDu)}.</Text>
        ) : null}
      </Carte>
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer le départ" variante="danger" onPress={enregistrer} chargement={enCours} />
    </>
  );
}

const STATUTS_LIGNE: Record<StatutLigne, { libelle: string; ton: 'succes' | 'attention' | 'erreur' | 'neutre' }> = {
  payee: { libelle: 'Payé', ton: 'succes' },
  avance: { libelle: 'Payé d’avance', ton: 'succes' },
  partielle: { libelle: 'Partiel', ton: 'attention' },
  en_attente: { libelle: 'À payer', ton: 'attention' },
  en_retard: { libelle: 'En retard', ton: 'erreur' },
  a_venir: { libelle: 'À venir', ton: 'neutre' },
};

/** Échéancier : où en est le locataire (payé jusqu'à…), prochain paiement, mois passés et à venir. */
function CarteEcheancier({ echeancier: e }: { echeancier: Echeancier }) {
  const [tout, setTout] = useState(false);
  // Par défaut : les 3 derniers mois facturés et les 4 suivants.
  const premierFutur = e.lignes.findIndex((l) => l.futur);
  const pivot = premierFutur === -1 ? e.lignes.length : premierFutur;
  const visibles = tout ? e.lignes : e.lignes.slice(Math.max(0, pivot - 3), pivot + 4);
  const enRetard = e.prochain?.enRetard ?? false;
  return (
    <Carte>
      <Text className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Échéancier</Text>
      <View className="flex-row gap-3 mb-2">
        <View className="flex-1 rounded-xl bg-primary/10 p-3">
          <Text className="text-xs text-muted">Payé jusqu’à</Text>
          <Text className="font-bold text-primary mt-0.5">{e.payeJusqua ? formatMois(e.payeJusqua.mois, e.payeJusqua.annee) : 'Aucun mois'}</Text>
        </View>
        <View className={`flex-1 rounded-xl p-3 ${enRetard ? 'bg-danger/10' : 'bg-accent/15'}`}>
          <Text className="text-xs text-muted">{enRetard ? 'En retard depuis le' : 'Prochain paiement'}</Text>
          <Text className={`font-bold mt-0.5 ${enRetard ? 'text-danger' : 'text-ink'}`}>
            {e.prochain ? `${formatDate(e.prochain.date)}` : '—'}
          </Text>
          {e.prochain ? <Text className="text-xs text-muted">{formatFCFA(e.prochain.montant)}</Text> : null}
        </View>
      </View>
      {visibles.map((l) => {
        const st = STATUTS_LIGNE[l.statut];
        return (
          <View key={`${l.annee}-${l.mois}`} className="flex-row items-center py-2 border-b border-border">
            <View className="flex-1">
              <Text className={`font-medium ${l.futur ? 'text-muted' : 'text-ink'}`}>{formatMois(l.mois, l.annee)}</Text>
              <Text className="text-xs text-muted">
                Échéance {formatDate(l.date)} · {formatFCFA(l.montant)}
              </Text>
            </View>
            <Badge libelle={st.libelle} ton={st.ton} />
          </View>
        );
      })}
      {e.lignes.length > visibles.length || tout ? (
        <Pressable onPress={() => setTout((t) => !t)} accessibilityRole="button" className="pt-2">
          <Text className="text-primary text-sm font-medium text-center">{tout ? 'Réduire' : `Tout afficher (${e.lignes.length} mois)`}</Text>
        </Pressable>
      ) : null}
    </Carte>
  );
}
