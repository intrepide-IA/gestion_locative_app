import { useCallback, useState, type ReactNode } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CheckCircle2, ClipboardCheck, FileSignature, ImageIcon, PenLine, Share2 } from 'lucide-react-native';

import { Feuille } from '../../components/ui/Feuille';
import { informer } from '../../components/ui/confirmer';
import { Badge, Bouton, BoutonRetour, Carte, Champ, Chargement, EnTete, EtatErreur, LigneInfo } from '../../components/ui/kit';
import { BlocSignature } from '../../components/ui/BlocSignature';
import { PadSignature } from '../../components/ui/PadSignature';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { partagerContrat } from '../../documents';
import { donneesContrat, type DonneesContrat } from '../../documents/contrat';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, formatDate, formatFCFA } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { definirPhotoPiece, enregistrerClauses, signerBail, type ClausesBail, type Signataire } from '../../repositories/bauxRepository';
import { choisirImage, type SourceImage } from '../../services/images';
import { colors } from '../../theme/colors';

const erreurTexte = (error: unknown) => messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.');

/**
 * Contrat de bail numérique : clauses du modèle, photo de la pièce d'identité, signatures au doigt
 * (ou signature enregistrée du bailleur), puis PDF partagé au locataire.
 */
export function BailScreen({
  contratId,
  onRetour,
  onEtatDesLieux,
}: {
  contratId: number;
  onRetour: () => void;
  onEtatDesLieux: (type: 'entree' | 'sortie') => void;
}) {
  const lire = useCallback((db: SqlDatabase) => donneesContrat(db, contratId), [contratId]);
  const { donnees: d, chargement, erreur, rafraichir } = useRessource<DonneesContrat | null>(lire, null);
  const [clauses, setClauses] = useState(false);
  const [signataire, setSignataire] = useState<Signataire | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const action = async (cle: string, f: () => Promise<void>, titreErreur: string) => {
    setEnCours(cle);
    try {
      await f();
      rafraichir();
    } catch (error) {
      informer(titreErreur, erreurTexte(error));
    } finally {
      setEnCours(null);
    }
  };

  const photo = (source: SourceImage) =>
    action(
      'photo',
      async () => {
        const image = await choisirImage(source, { largeur: 1200, format: 'jpeg' });
        if (image) await definirPhotoPiece(await getDatabase(), contratId, image);
      },
      'Photo impossible'
    );

  const signer = (qui: Signataire, image: string) =>
    action(
      `signer-${qui}`,
      async () => {
        await signerBail(await getDatabase(), contratId, qui, image, aujourdhui());
        setSignataire(null);
      },
      'Signature impossible'
    );

  if (erreur) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BoutonRetour onPress={onRetour} />
        <EtatErreur message={erreurTexte(erreur)} onReessayer={rafraichir} />
      </SafeAreaView>
    );
  }
  if (!d) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BoutonRetour onPress={onRetour} />
        {chargement ? <Chargement /> : null}
      </SafeAreaView>
    );
  }

  const b = d.bail;
  const signe = Boolean(b.signe_le);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete titre="Contrat de bail" sousTitre={`${d.locataire.nom} · ${d.logement}`} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 14 }}>
        <View className={`rounded-2xl p-4 flex-row items-center ${signe ? 'bg-primary' : 'bg-accent/25'}`}>
          {signe ? <CheckCircle2 size={22} color={colors.white} /> : <FileSignature size={22} color="#8A6500" />}
          <View className="flex-1 ml-3">
            <Text className={`font-bold ${signe ? 'text-white' : 'text-ink'}`}>
              {signe ? `Signé le ${formatDate(b.signe_le!)}` : b.enregistre ? 'En attente des signatures' : 'À préparer'}
            </Text>
            <Text className={`text-sm ${signe ? 'text-white/80' : 'text-muted'}`}>
              {signe ? 'Partagez le PDF au locataire : chacun garde son exemplaire.' : 'Vérifiez les clauses, photographiez la pièce, puis signez.'}
            </Text>
          </View>
        </View>

        <Etape numero={1} titre="Clauses du contrat" fait={b.enregistre}>
          <LigneInfo libelle="Loyer · jour de paiement" valeur={`${formatFCFA(d.loyer)} · le ${d.jourEcheance}`} />
          <LigneInfo libelle="Caution" valeur={formatFCFA(d.caution)} />
          <LigneInfo libelle="Prise d’effet" valeur={formatDate(d.dateDebut)} />
          <LigneInfo libelle="Durée · préavis" valeur={`${b.duree_annees} an(s) · ${b.preavis_mois} mois`} />
          <LigneInfo libelle="Résiliation après" valeur={`${b.mois_impayes} mois d’impayés`} />
          <LigneInfo libelle="Adresse du logement" valeur={b.adresse_logement ?? 'À compléter'} />
          <View className="mt-3">
            <Bouton titre={b.enregistre ? 'Modifier les clauses' : 'Vérifier et enregistrer'} variante={b.enregistre ? 'secondaire' : 'principal'} onPress={() => setClauses(true)} />
          </View>
          {b.enregistre && (b.signature_bailleur || b.signature_locataire) ? (
            <Text className="text-xs text-muted mt-2">Modifier les clauses efface les signatures : il faudra signer à nouveau.</Text>
          ) : null}
        </Etape>

        <Etape numero={2} titre="Pièce d’identité du locataire" fait={Boolean(b.photo_piece)} facultatif>
          {b.photo_piece ? (
            <Image source={{ uri: b.photo_piece }} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover" accessibilityLabel="Pièce d’identité" />
          ) : (
            <Text className="text-muted text-sm">Photographiez la carte d’identité (ou le passeport) : elle est jointe au contrat en annexe.</Text>
          )}
          <View className="flex-row gap-3 mt-3">
            <Bouton
              titre="Photographier"
              className="flex-1"
              variante="secondaire"
              icone={<Camera size={18} color={colors.primary} />}
              onPress={() => photo('camera')}
              desactive={!b.enregistre}
              chargement={enCours === 'photo'}
            />
            <Bouton
              titre="Galerie"
              className="flex-1"
              variante="secondaire"
              icone={<ImageIcon size={18} color={colors.primary} />}
              onPress={() => photo('galerie')}
              desactive={!b.enregistre}
            />
          </View>
        </Etape>

        <Etape numero={3} titre="Signatures" fait={signe}>
          <BlocSignature
            titre="Le locataire"
            nom={d.locataire.nom}
            image={b.signature_locataire}
            desactive={!b.enregistre}
            onSigner={() => setSignataire('locataire')}
          />
          <BlocSignature
            titre="Le bailleur"
            nom={d.bailleur.nom}
            image={b.signature_bailleur}
            desactive={!b.enregistre}
            onSigner={() => setSignataire('bailleur')}
            supplement={
              d.bailleur.signatureProfil && !b.signature_bailleur ? (
                <Bouton
                  titre="Apposer ma signature enregistrée"
                  icone={<PenLine size={18} color={colors.white} />}
                  onPress={() => signer('bailleur', d.bailleur.signatureProfil!)}
                  desactive={!b.enregistre}
                  chargement={enCours === 'signer-bailleur'}
                />
              ) : null
            }
          />
        </Etape>

        <Etape numero={4} titre="État des lieux" fait={false} facultatif>
          <Text className="text-muted text-sm">Faites le tour du logement avec le locataire : chaque élément est noté bon, moyen ou mauvais, puis signé.</Text>
          <View className="flex-row gap-3 mt-3">
            <Bouton titre="Entrée" className="flex-1" variante="secondaire" icone={<ClipboardCheck size={18} color={colors.primary} />} onPress={() => onEtatDesLieux('entree')} />
            <Bouton titre="Sortie" className="flex-1" variante="secondaire" icone={<ClipboardCheck size={18} color={colors.primary} />} onPress={() => onEtatDesLieux('sortie')} />
          </View>
        </Etape>

        <Bouton
          titre={signe ? 'Partager le contrat signé (PDF)' : 'Aperçu / imprimer le contrat (PDF)'}
          variante={signe ? 'action' : 'secondaire'}
          icone={<Share2 size={18} color={signe ? colors.ink : colors.primary} />}
          chargement={enCours === 'pdf'}
          onPress={() => action('pdf', () => partagerContrat(contratId), 'Partage impossible')}
        />
      </ScrollView>

      <Feuille ouverte={clauses} onFermer={() => setClauses(false)} titre="Clauses du contrat">
        <FormClauses
          contratId={contratId}
          initial={b}
          onEnregistre={() => {
            setClauses(false);
            rafraichir();
          }}
        />
      </Feuille>
      <Feuille
        ouverte={signataire !== null}
        onFermer={() => setSignataire(null)}
        titre={signataire === 'bailleur' ? 'Signature du bailleur' : 'Signature du locataire'}
      >
        {signataire ? (
          <>
            <Text className="text-muted">
              {signataire === 'locataire'
                ? `${d.locataire.nom} signe après avoir lu le contrat (bouton « Aperçu » pour le relire).`
                : 'Signez sur place, au doigt.'}
            </Text>
            <PadSignature
              nom={signataire === 'bailleur' ? d.bailleur.nom : d.locataire.nom}
              onValider={(image) => signer(signataire, image)}
              chargement={enCours === `signer-${signataire}`}
            />
          </>
        ) : null}
      </Feuille>
    </SafeAreaView>
  );
}

function Etape({ numero, titre, fait, facultatif, children }: { numero: number; titre: string; fait: boolean; facultatif?: boolean; children: ReactNode }) {
  return (
    <Carte>
      <View className="flex-row items-center mb-2">
        <View className={`w-7 h-7 rounded-full items-center justify-center ${fait ? 'bg-primary' : 'bg-primary/10'}`}>
          {fait ? <CheckCircle2 size={16} color={colors.white} /> : <Text className="text-primary font-bold text-sm">{numero}</Text>}
        </View>
        <Text className="font-bold text-ink ml-2 flex-1">{titre}</Text>
        {facultatif ? <Badge libelle="Conseillé" ton="neutre" /> : null}
      </View>
      {children}
    </Carte>
  );
}

function FormClauses({ contratId, initial, onEnregistre }: { contratId: number; initial: ClausesBail; onEnregistre: () => void }) {
  const texte = (n: number | null) => (n === null ? '' : String(n));
  const [v, setV] = useState({
    adresse_logement: initial.adresse_logement ?? '',
    chambres: texte(initial.chambres),
    salon: texte(initial.salon),
    cuisine: texte(initial.cuisine),
    salle_de_bain: texte(initial.salle_de_bain),
    autres: initial.autres ?? '',
    locataire_adresse: initial.locataire_adresse ?? '',
    duree_annees: String(initial.duree_annees),
    preavis_mois: String(initial.preavis_mois),
    mois_impayes: String(initial.mois_impayes),
    fait_a: initial.fait_a ?? '',
  });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const champ = (cle: keyof typeof v) => ({ value: v[cle], onChangeText: (t: string) => setV((x) => ({ ...x, [cle]: t })) });
  const nombre = (t: string) => (t.trim() === '' ? null : Number(t.trim()));

  const enregistrer = async () => {
    setEnCours(true);
    setErreur('');
    try {
      await enregistrerClauses(await getDatabase(), contratId, {
        adresse_logement: v.adresse_logement,
        chambres: nombre(v.chambres),
        salon: nombre(v.salon),
        cuisine: nombre(v.cuisine),
        salle_de_bain: nombre(v.salle_de_bain),
        autres: v.autres,
        locataire_adresse: v.locataire_adresse,
        duree_annees: Number(v.duree_annees),
        preavis_mois: Number(v.preavis_mois),
        mois_impayes: Number(v.mois_impayes),
        fait_a: v.fait_a,
      });
      onEnregistre();
    } catch (error) {
      setErreur(erreurTexte(error));
      setEnCours(false);
    }
  };

  const petit = (libelle: string, cle: keyof typeof v) => (
    <View className="flex-1">
      <Champ libelle={libelle} keyboardType="number-pad" {...champ(cle)} />
    </View>
  );

  return (
    <>
      <Text className="text-muted">Loyer, caution, jour de paiement et date d’entrée viennent du contrat de location (fiche locataire).</Text>
      <Champ libelle="Adresse du logement" placeholder="Quartier, ville" {...champ('adresse_logement')} />
      <View className="flex-row gap-3">
        {petit('Chambres', 'chambres')}
        {petit('Salon', 'salon')}
      </View>
      <View className="flex-row gap-3">
        {petit('Cuisine', 'cuisine')}
        {petit('Salle de bain', 'salle_de_bain')}
      </View>
      <Champ libelle="Autres (facultatif)" placeholder="Ex. douche interne, compteur" {...champ('autres')} />
      <Champ libelle="Adresse du locataire" placeholder="Adresse actuelle (facultatif)" {...champ('locataire_adresse')} />
      <View className="flex-row gap-3">
        {petit('Durée (années)', 'duree_annees')}
        {petit('Préavis (mois)', 'preavis_mois')}
      </View>
      <Champ libelle="Mois d’impayés avant résiliation" keyboardType="number-pad" {...champ('mois_impayes')} />
      <Champ libelle="Fait à" placeholder="Ville" {...champ('fait_a')} />
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre="Enregistrer les clauses" onPress={enregistrer} chargement={enCours} />
    </>
  );
}
