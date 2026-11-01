import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, ChevronRight, Eye, FileText, FileUp, Images, RotateCcw, Save, ScanText } from 'lucide-react-native';

import { useApercu } from '../../components/documents/Apercu';
import { confirmer, informer } from '../../components/ui/confirmer';
import { Feuille } from '../../components/ui/Feuille';
import { PhotosDocument } from '../../components/ui/PhotosDocument';
import { Bouton, BoutonRetour, Carte, Chargement, EnTete } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { enregistrerModeleContrat, htmlApercuModele, lireModeleContrat } from '../../documents/contrat';
import { messageErreur } from '../../domain/erreurs';
import { MODELE_PAR_DEFAUT, VARIABLES_MODELE, variablesInconnues } from '../../domain/modeleContrat';
import { useRessource } from '../../hooks/useRessource';
import { choisirFichierTexte } from '../../services/fichiers';
import { choisirPdf, choisirPhotos, lirePdf, lirePhotos, PAGES_MAX } from '../../services/lectureContrat';
import type { ContratReconnu } from '../../domain/miseEnFormeContrat';
import { colors } from '../../theme/colors';

const erreurTexte = (error: unknown) => messageErreur(error, error instanceof Error ? error.message : 'Erreur inconnue.');

/**
 * Modèle de contrat : le propriétaire garde le modèle Onílé, le modifie, ou colle / importe le sien.
 * Les informations du contrat (noms, loyer, caution…) s'insèrent entre doubles accolades.
 */
export function ModeleContratScreen({ onRetour }: { onRetour: () => void }) {
  const lire = useCallback((db: SqlDatabase) => lireModeleContrat(db), []);
  const { donnees, chargement } = useRessource<string | null | undefined>(lire, undefined);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BoutonRetour onPress={onRetour} />
      <EnTete titre="Modèle de contrat" sousTitre={donnees ? 'Votre modèle personnalisé' : 'Modèle Onílé (par défaut)'} />
      {donnees === undefined || chargement ? <Chargement /> : <Editeur key={donnees ?? 'defaut'} initial={donnees} />}
    </SafeAreaView>
  );
}

function Editeur({ initial }: { initial: string | null }) {
  const [texte, setTexte] = useState(initial ?? MODELE_PAR_DEFAUT);
  // Position du curseur (suivie) ; « forcee » ne sert qu'à replacer le curseur juste après une insertion.
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [forcee, setForcee] = useState<{ start: number; end: number } | undefined>(undefined);
  const [personnalise, setPersonnalise] = useState(initial !== null);
  const [enCours, setEnCours] = useState(false);
  const [choixImport, setChoixImport] = useState(false);
  const [camera, setCamera] = useState(false);
  const [lecture, setLecture] = useState<string | null>(null);
  const [reconnu, setReconnu] = useState<ContratReconnu | null>(null);
  const ouvrirApercu = useApercu();
  const inconnues = variablesInconnues(texte);

  const inserer = (cle: string) => {
    const balise = `{{${cle}}}`;
    setTexte((t) => t.slice(0, selection.start) + balise + t.slice(selection.end));
    const fin = selection.start + balise.length;
    setSelection({ start: fin, end: fin });
    setForcee({ start: fin, end: fin });
  };

  /** Lit les photos ou le PDF, puis met le contrat reconnu dans l'éditeur (pas encore enregistré). */
  const lire = async (travail: () => Promise<ContratReconnu>) => {
    setChoixImport(false);
    setLecture('Lecture du contrat…');
    try {
      const r = await travail();
      setTexte(r.texte);
      setReconnu(r);
    } catch (error) {
      informer('Lecture impossible', erreurTexte(error));
    } finally {
      setLecture(null);
    }
  };

  const suivrePages = (rang: number, total: number) => setLecture(`Lecture de la page ${rang} sur ${total}…`);

  const depuisPhotos = async () => {
    try {
      const uris = await choisirPhotos();
      if (uris) await lire(() => lirePhotos(uris, suivrePages));
    } catch (error) {
      informer('Import impossible', erreurTexte(error));
    }
  };

  const depuisPdf = async () => {
    try {
      const uri = await choisirPdf();
      if (uri) await lire(() => lirePdf(uri));
    } catch (error) {
      informer('Import impossible', erreurTexte(error));
    }
  };

  const importer = async () => {
    setChoixImport(false);
    try {
      const f = await choisirFichierTexte();
      if (!f) return;
      if (!f.contenu.trim()) return informer('Fichier vide', 'Ce fichier ne contient pas de texte.');
      if (/^\s*[{[<]|%PDF|PK\u0003\u0004/.test(f.contenu.slice(0, 10))) {
        return informer(
          'Format non pris en charge',
          'Choisissez un fichier texte (.txt). Depuis Word : Fichier → Enregistrer sous → Texte brut (.txt), ou copiez le texte et collez-le ici.'
        );
      }
      setTexte(f.contenu.replace(/\r\n?/g, '\n'));
      setReconnu(null);
      informer('Modèle importé', `« ${f.nom} » est chargé. Ajoutez les informations à remplir avec les boutons, puis enregistrez.`);
    } catch (error) {
      informer('Import impossible', erreurTexte(error));
    }
  };

  const enregistrer = async () => {
    setEnCours(true);
    try {
      await enregistrerModeleContrat(await getDatabase(), texte);
      setPersonnalise(true);
      informer('Modèle enregistré', 'Vos prochains contrats utiliseront ce modèle.');
    } catch (error) {
      informer('Enregistrement impossible', erreurTexte(error));
    } finally {
      setEnCours(false);
    }
  };

  const reinitialiser = async () => {
    if (!(await confirmer('Revenir au modèle Onílé ?', 'Votre modèle personnalisé sera supprimé.', 'Revenir au modèle Onílé', true))) return;
    await enregistrerModeleContrat(await getDatabase(), null);
    setTexte(MODELE_PAR_DEFAUT);
    setPersonnalise(false);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Carte>
        <Text className="text-ink font-semibold">Comment ça marche</Text>
        <Text className="text-muted text-sm mt-1">
          Écrivez ou collez votre contrat. Les informations entre doubles accolades, comme {'{{locataire_nom}}'}, sont remplies
          automatiquement pour chaque locataire. Une ligne « # … » devient le titre, « Article … » un intertitre, « - … » une puce. Les
          signatures et la photo de la pièce sont ajoutées à la fin.
        </Text>
        <Text className="text-muted text-sm mt-2">
          Vous avez déjà un contrat papier ? Touchez « Importer » : photographiez-le ou choisissez un PDF, Onílé le transforme en
          modèle à vérifier.
        </Text>
      </Carte>

      <View className="flex-row gap-3">
        <Bouton
          titre="Importer"
          variante="secondaire"
          className="flex-1"
          icone={<FileUp size={18} color={colors.primary} />}
          onPress={() => setChoixImport(true)}
        />
        <Bouton
          titre="Aperçu"
          variante="secondaire"
          className="flex-1"
          icone={<Eye size={18} color={colors.primary} />}
          onPress={() => ouvrirApercu(async () => ({ html: htmlApercuModele(texte), nomFichier: 'Modele-contrat', titre: 'Aperçu du modèle' }))}
        />
      </View>

      {lecture ? (
        <View className="flex-row items-center gap-3 rounded-2xl p-4 bg-primary/5 border border-primary/20" accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text className="flex-1 text-ink font-medium">{lecture}</Text>
        </View>
      ) : null}

      {reconnu && !lecture ? (
        <View className="rounded-2xl p-4 bg-accent/15 border border-accent/40 gap-1">
          <Text className="text-ink font-semibold">Contrat reconnu : relisez-le avant d’enregistrer</Text>
          <Text className="text-ink text-sm">
            {reconnu.variables
              ? `${reconnu.variables} information(s) placée(s) automatiquement (noms, loyer, caution…). `
              : ''}
            {reconnu.aCompleter
              ? `${reconnu.aCompleter} espace(s) à compléter, marqué(s) « …… » : placez le curseur dessus et touchez l’information qui convient.`
              : 'Ajoutez les informations à remplir avec les boutons ci-dessous.'}
          </Text>
          <Text className="text-muted text-xs">
            La lecture peut confondre quelques lettres. Les titres, articles, paragraphes et puces sont remis en forme ; utilisez « Aperçu » pour voir le résultat.
          </Text>
        </View>
      ) : null}

      <View>
        <Text className="text-sm font-medium text-ink mb-1.5">Insérer une information (à l’endroit du curseur)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {VARIABLES_MODELE.map((v) => (
            <Pressable
              key={v.cle}
              onPress={() => inserer(v.cle)}
              accessibilityRole="button"
              accessibilityLabel={`Insérer : ${v.libelle}`}
              className="px-3 py-2 rounded-full bg-primary/10 border border-primary/20"
            >
              <Text className="text-primary text-sm font-medium">{v.libelle}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <TextInput
        value={texte}
        onChangeText={setTexte}
        selection={forcee}
        onSelectionChange={(e) => {
          setSelection(e.nativeEvent.selection);
          setForcee(undefined);
        }}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        className="bg-white border border-border rounded-2xl px-4 py-3 text-ink"
        style={{ minHeight: 420, fontSize: 14, lineHeight: 21, fontFamily: 'Inter' }}
        accessibilityLabel="Texte du modèle de contrat"
      />

      {inconnues.length ? (
        <View className="rounded-xl p-3 bg-danger/10">
          <Text className="text-danger text-sm">
            Informations inconnues (fautes de frappe ?) : {inconnues.map((v) => `{{${v}}}`).join(', ')}. Utilisez les boutons ci-dessus pour les
            insérer correctement.
          </Text>
        </View>
      ) : null}

      <Bouton titre="Enregistrer ce modèle" icone={<Save size={18} color={colors.white} />} onPress={enregistrer} chargement={enCours} />
      {personnalise ? (
        <Bouton titre="Revenir au modèle Onílé" variante="discret" icone={<RotateCcw size={18} color={colors.primary} />} onPress={reinitialiser} />
      ) : null}

      <Feuille ouverte={choixImport} onFermer={() => setChoixImport(false)} titre="Importer mon contrat">
        <Text className="text-muted">
          Onílé lit votre contrat et le transforme en modèle numérique : titres, articles, paragraphes. Le texte actuel de l’éditeur est
          remplacé (rien n’est enregistré avant que vous touchiez « Enregistrer »).
        </Text>
        <ChoixImport
          icone={<Camera size={20} color={colors.primary} />}
          titre="Photographier le contrat papier"
          detail={`Une photo par page, jusqu’à ${PAGES_MAX} pages`}
          onPress={() => {
            setChoixImport(false);
            setCamera(true);
          }}
        />
        <ChoixImport icone={<Images size={20} color={colors.primary} />} titre="Choisir des photos" detail="Photos déjà prises, dans l’ordre des pages" onPress={depuisPhotos} />
        <ChoixImport icone={<FileText size={20} color={colors.primary} />} titre="Importer un PDF" detail="Contrat scanné ou enregistré en PDF" onPress={depuisPdf} />
        <ChoixImport icone={<ScanText size={20} color={colors.primary} />} titre="Importer un fichier texte (.txt)" detail="Depuis Word : Enregistrer sous → Texte brut" onPress={importer} />
      </Feuille>

      <PhotosDocument
        ouverte={camera}
        onFermer={() => setCamera(false)}
        onTermine={(uris) => {
          setCamera(false);
          void lire(() => lirePhotos(uris, suivrePages));
        }}
      />
    </ScrollView>
  );
}

function ChoixImport({ icone, titre, detail, onPress }: { icone: ReactNode; titre: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center bg-white rounded-2xl border border-border p-4 active:bg-background">
      <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center mr-3">{icone}</View>
      <View className="flex-1">
        <Text className="text-base text-ink font-medium">{titre}</Text>
        <Text className="text-xs text-muted">{detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}
