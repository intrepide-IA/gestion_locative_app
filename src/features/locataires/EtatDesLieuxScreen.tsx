import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, ClipboardCheck, Plus, Share2 } from 'lucide-react-native';

import { BlocSignature } from '../../components/ui/BlocSignature';
import { ChampDate } from '../../components/ui/ChampDate';
import { Feuille } from '../../components/ui/Feuille';
import { informer } from '../../components/ui/confirmer';
import { Bouton, BoutonRetour, Carte, Chargement, EnTete, EtatErreur } from '../../components/ui/kit';
import { PadSignature } from '../../components/ui/PadSignature';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { preparerEtatDesLieux } from '../../documents';
import { useApercu } from '../../components/documents/Apercu';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import {
  degradations,
  enregistrerEtatDesLieux,
  getEtatDesLieux,
  LIBELLES_NOTE,
  signerEtatDesLieux,
  type EtatDesLieux,
  type LigneEtat,
  type Note,
  type TypeEtat,
} from '../../repositories/etatDesLieuxRepository';
import { getProprietaire } from '../../repositories/proprietaireRepository';
import { colors } from '../../theme/colors';

const erreurTexte = (error: unknown) => messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.');

interface Donnees {
  etat: EtatDesLieux;
  /** À la sortie : l'état d'entrée, pour comparer. */
  entree: EtatDesLieux | null;
  locataire: string;
  proprietaire: string;
  signatureProfil: string | null;
}

const COULEURS: Record<Note, string> = { bon: colors.secondary, moyen: colors.accent, mauvais: colors.danger };

/** État des lieux d'entrée ou de sortie : grille Bon / Moyen / Mauvais, observations, signatures, PDF. */
export function EtatDesLieuxScreen({ contratId, type, onRetour }: { contratId: number; type: TypeEtat; onRetour: () => void }) {
  const lire = useCallback(
    async (db: SqlDatabase): Promise<Donnees> => {
      const jour = aujourdhui();
      const [etat, entree, p, t] = await Promise.all([
        getEtatDesLieux(db, contratId, type, jour),
        type === 'sortie' ? getEtatDesLieux(db, contratId, 'entree', jour) : Promise.resolve(null),
        getProprietaire(db),
        db.get<{ nom_complet: string }>('SELECT t.nom_complet FROM contrats c JOIN locataires t ON t.id = c.locataire_id WHERE c.id = ?', [contratId]),
      ]);
      return {
        etat,
        entree: entree?.enregistre ? entree : null,
        locataire: t?.nom_complet ?? '',
        proprietaire: p?.nom ?? '',
        signatureProfil: p?.signature ?? null,
      };
    },
    [contratId, type]
  );
  const { donnees: d, chargement, erreur, rafraichir } = useRessource<Donnees | null>(lire, null);
  const titre = type === 'entree' ? 'État des lieux d’entrée' : 'État des lieux de sortie';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete titre={titre} sousTitre={d?.locataire} />
      {erreur ? (
        <EtatErreur message={erreurTexte(erreur)} onReessayer={rafraichir} />
      ) : !d ? (
        chargement ? <Chargement /> : null
      ) : (
        // La clé recrée le formulaire avec les valeurs enregistrées après chaque rechargement.
        <Contenu key={`${d.etat.enregistre}-${d.etat.signe_le}-${d.etat.signature_bailleur?.length}-${d.etat.signature_locataire?.length}`} d={d} contratId={contratId} type={type} onModifie={rafraichir} />
      )}
    </SafeAreaView>
  );
}

function Contenu({ d, contratId, type, onModifie }: { d: Donnees; contratId: number; type: TypeEtat; onModifie: () => void }) {
  const [date, setDate] = useState(d.etat.date_etat);
  const [lignes, setLignes] = useState<LigneEtat[]>(d.etat.elements);
  const [observations, setObservations] = useState(d.etat.observations ?? '');
  const [nouvel, setNouvel] = useState('');
  const [modifie, setModifie] = useState(!d.etat.enregistre);
  const [signataire, setSignataire] = useState<'bailleur' | 'locataire' | null>(null);
  const ouvrirApercu = useApercu();
  const [enCours, setEnCours] = useState<string | null>(null);

  const noter = (i: number, note: Note) => {
    setLignes((l) => l.map((x, j) => (j === i ? { ...x, etat: x.etat === note ? null : note } : x)));
    setModifie(true);
  };
  const tousBons = () => {
    setLignes((l) => l.map((x) => ({ ...x, etat: x.etat ?? 'bon' })));
    setModifie(true);
  };
  const ajouter = () => {
    if (!nouvel.trim()) return;
    setLignes((l) => [...l, { element: nouvel.trim(), etat: null }]);
    setNouvel('');
    setModifie(true);
  };

  const action = async (cle: string, f: () => Promise<void>, titreErreur: string) => {
    setEnCours(cle);
    try {
      await f();
      onModifie();
    } catch (error) {
      informer(titreErreur, erreurTexte(error));
    } finally {
      setEnCours(null);
    }
  };

  const enregistrer = () =>
    action(
      'enregistrer',
      async () => {
        await enregistrerEtatDesLieux(await getDatabase(), contratId, type, { date_etat: date, elements: lignes, observations });
        setModifie(false);
      },
      'Enregistrement impossible'
    );

  const signer = (qui: 'bailleur' | 'locataire', image: string) =>
    action(
      `signer-${qui}`,
      async () => {
        await signerEtatDesLieux(await getDatabase(), contratId, type, qui, image, aujourdhui());
        setSignataire(null);
      },
      'Signature impossible'
    );

  const notees = lignes.filter((l) => l.etat).length;
  const pertes = d.entree ? degradations(d.entree.elements, lignes) : [];
  const avant = (element: string) => d.entree?.elements.find((l) => l.element === element)?.etat ?? null;
  const signe = Boolean(d.etat.signe_le) && !modifie;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View className={`rounded-2xl p-4 flex-row items-center ${signe ? 'bg-primary' : 'bg-accent/25'}`}>
          {signe ? <CheckCircle2 size={22} color={colors.white} /> : <ClipboardCheck size={22} color="#8A6500" />}
          <View className="flex-1 ml-3">
            <Text className={`font-bold ${signe ? 'text-white' : 'text-ink'}`}>
              {signe ? `Signé le ${formatDate(d.etat.signe_le!)}` : `${notees} élément(s) noté(s) sur ${lignes.length}`}
            </Text>
            <Text className={`text-sm ${signe ? 'text-white/80' : 'text-muted'}`}>
              {signe ? 'Partagez la fiche au locataire.' : 'Faites le tour du logement avec le locataire, notez chaque élément, puis signez.'}
            </Text>
          </View>
        </View>

        <ChampDate
          libelle={type === 'entree' ? 'Date d’entrée' : 'Date de sortie'}
          valeur={date}
          onChange={(v) => {
            setDate(v);
            setModifie(true);
          }}
        />

        <Carte>
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-xs font-bold text-muted uppercase tracking-wider">Éléments</Text>
            <Pressable onPress={tousBons} accessibilityRole="button" hitSlop={8}>
              <Text className="text-primary text-sm font-medium">Le reste en « Bon »</Text>
            </Pressable>
          </View>
          {lignes.map((l, i) => {
            const a = avant(l.element);
            return (
              <View key={`${l.element}-${i}`} className={`py-2.5 ${i < lignes.length - 1 ? 'border-b border-border' : ''}`}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-ink font-medium flex-1 pr-2">{l.element}</Text>
                  {a ? <Text className="text-xs text-muted">Entrée : {LIBELLES_NOTE[a].toLowerCase()}</Text> : null}
                </View>
                <View className="flex-row gap-2 mt-2">
                  {(['bon', 'moyen', 'mauvais'] as Note[]).map((n) => {
                    const choisi = l.etat === n;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => noter(i, n)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: choisi }}
                        accessibilityLabel={`${l.element} : ${LIBELLES_NOTE[n]}`}
                        className="flex-1 items-center rounded-full py-2 border"
                        style={{ backgroundColor: choisi ? COULEURS[n] : colors.white, borderColor: choisi ? COULEURS[n] : colors.border }}
                      >
                        <Text className="text-sm font-semibold" style={{ color: choisi ? (n === 'moyen' ? colors.ink : colors.white) : colors.muted }}>
                          {LIBELLES_NOTE[n]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <View className="flex-row items-center gap-2 mt-3">
            <TextInput
              value={nouvel}
              onChangeText={setNouvel}
              onSubmitEditing={ajouter}
              placeholder="Autre élément (ex. ventilateur)"
              placeholderTextColor={colors.muted}
              className="flex-1 bg-white border border-border rounded-xl px-4 py-3 text-ink"
              style={{ fontFamily: 'Inter' }}
            />
            <Pressable onPress={ajouter} accessibilityRole="button" accessibilityLabel="Ajouter l’élément" className="w-12 h-12 rounded-xl bg-primary items-center justify-center">
              <Plus size={20} color={colors.white} />
            </Pressable>
          </View>
        </Carte>

        {pertes.length ? (
          <View className="rounded-2xl p-4 bg-danger/10 border border-danger/30">
            <Text className="font-bold text-danger">Dégradations par rapport à l’entrée</Text>
            {pertes.map((p) => (
              <Text key={p.element} className="text-ink text-sm mt-1">
                • {p.element} : {LIBELLES_NOTE[p.avant].toLowerCase()} → {LIBELLES_NOTE[p.apres].toLowerCase()}
              </Text>
            ))}
            <Text className="text-muted text-xs mt-2">À prendre en compte avant de restituer la caution.</Text>
          </View>
        ) : null}

        <View>
          <Text className="text-sm font-medium text-ink mb-1.5">Observations</Text>
          <TextInput
            value={observations}
            onChangeText={(v) => {
              setObservations(v);
              setModifie(true);
            }}
            placeholder="Ex. fissure au mur du salon, clé de la fenêtre manquante…"
            placeholderTextColor={colors.muted}
            multiline
            className="bg-white border border-border rounded-xl px-4 py-3 text-ink"
            style={{ minHeight: 90, textAlignVertical: 'top', fontFamily: 'Inter' }}
          />
        </View>

        {modifie ? (
          <Bouton titre="Enregistrer l’état des lieux" onPress={enregistrer} chargement={enCours === 'enregistrer'} />
        ) : (
          <Carte>
            <Text className="text-xs font-bold text-muted uppercase tracking-wider">Signatures</Text>
            <BlocSignature
              titre="Le locataire"
              nom={d.locataire}
              image={d.etat.signature_locataire}
              desactive={false}
              onSigner={() =>
                ouvrirApercu(() => preparerEtatDesLieux(contratId), { titre: 'Lu et approuvé : signer', onPress: () => setSignataire('locataire') })
              }
            />
            <BlocSignature
              titre="Le propriétaire"
              nom={d.proprietaire}
              image={d.etat.signature_bailleur}
              desactive={false}
              onSigner={() => setSignataire('bailleur')}
              supplement={
                d.signatureProfil && !d.etat.signature_bailleur ? (
                  <Bouton
                    titre="Apposer ma signature enregistrée"
                    onPress={() => signer('bailleur', d.signatureProfil!)}
                    chargement={enCours === 'signer-bailleur'}
                  />
                ) : null
              }
            />
            {d.etat.signature_bailleur || d.etat.signature_locataire ? (
              <Text className="text-xs text-muted">Modifier la grille efface les signatures : il faudra signer à nouveau.</Text>
            ) : null}
          </Carte>
        )}

        {d.etat.enregistre && !modifie ? (
          <Bouton
            titre="Voir et partager la fiche"
            variante={signe ? 'action' : 'secondaire'}
            icone={<Share2 size={18} color={signe ? colors.ink : colors.primary} />}
            onPress={() => ouvrirApercu(() => preparerEtatDesLieux(contratId))}
          />
        ) : null}
      </ScrollView>

      <Feuille
        ouverte={signataire !== null}
        onFermer={() => setSignataire(null)}
        titre={signataire === 'bailleur' ? 'Signature du propriétaire' : 'Signature du locataire'}
      >
        {signataire ? (
          <PadSignature
            nom={signataire === 'bailleur' ? d.proprietaire : d.locataire}
            onValider={(image) => signer(signataire, image)}
            chargement={enCours === `signer-${signataire}`}
          />
        ) : null}
      </Feuille>
    </>
  );
}
