import { useCallback, useState } from 'react';

import { ChampDate } from '../../components/ui/ChampDate';
import { Feuille } from '../../components/ui/Feuille';
import { Bouton, Champ, Chargement, Choix } from '../../components/ui/kit';
import { Text } from '../../components/ui/Text';
import { getDatabase } from '../../db/client';
import type { SqlDatabase } from '../../db/types';
import { messageErreur } from '../../domain/erreurs';
import { aujourdhui, lireMontant } from '../../domain/format';
import { useRessource } from '../../hooks/useRessource';
import { creerMouvement, listerCategories, type Categorie, type Sens } from '../../repositories/financesRepository';
import { listerLogements, type LogementAvecOccupant } from '../../repositories/logementRepository';
import { LIBELLES_MODE, type ModePaiement } from '../../repositories/loyerRepository';

const MODES = (Object.keys(LIBELLES_MODE) as ModePaiement[]).map((m) => ({ valeur: m, libelle: LIBELLES_MODE[m] }));

/** Catégories saisissables à la main (celles des loyers, cautions et électricité sont alimentées automatiquement). */
const CODES_AUTOMATIQUES = new Set(['loyer', 'caution', 'electricite', 'restitution_caution']);

const VIDE = { categories: [] as Categorie[], logements: [] as LogementAvecOccupant[] };

export function MouvementForm({ sens, onFermer, onEnregistre }: { sens: Sens | null; onFermer: () => void; onEnregistre: () => void }) {
  return (
    <Feuille ouverte={sens !== null} onFermer={onFermer} titre={sens === 'sortie' ? 'Nouvelle dépense' : 'Nouvelle recette'}>
      {sens ? <Chargeur sens={sens} onEnregistre={onEnregistre} /> : null}
    </Feuille>
  );
}

function Chargeur({ sens, onEnregistre }: { sens: Sens; onEnregistre: () => void }) {
  // Fonction stable : useRessource relit la base quand elle change.
  const lire = useCallback(
    async (db: SqlDatabase) => {
      const [categories, logements] = await Promise.all([listerCategories(db, sens), listerLogements(db)]);
      return { categories: categories.filter((c) => !c.code || !CODES_AUTOMATIQUES.has(c.code)), logements };
    },
    [sens]
  );
  const { donnees, chargement } = useRessource(lire, VIDE);
  if (chargement && !donnees.categories.length) return <Chargement />;
  return <Formulaire sens={sens} categories={donnees.categories} logements={donnees.logements} onEnregistre={onEnregistre} />;
}

function Formulaire({
  sens,
  categories,
  logements,
  onEnregistre,
}: {
  sens: Sens;
  categories: Categorie[];
  logements: LogementAvecOccupant[];
  onEnregistre: () => void;
}) {
  const [categorieId, setCategorieId] = useState<number | null>(null);
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(aujourdhui());
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [description, setDescription] = useState('');
  const [beneficiaire, setBeneficiaire] = useState('');
  const [logementId, setLogementId] = useState<number>(0);
  const [prevue, setPrevue] = useState<'payee' | 'prevue'>('payee');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async () => {
    const m = lireMontant(montant);
    if (!categorieId) return setErreur('Choisissez une catégorie.');
    if (!m) return setErreur('Indiquez le montant en FCFA (chiffres uniquement).');
    setEnCours(true);
    setErreur('');
    try {
      await creerMouvement(await getDatabase(), {
        sens,
        date,
        montant: m,
        categorieId,
        mode,
        description,
        beneficiaire,
        logementId: logementId || null,
        brouillon: sens === 'sortie' && prevue === 'prevue',
      });
      onEnregistre();
    } catch (error) {
      setErreur(messageErreur(error, 'Enregistrement impossible.'));
      setEnCours(false);
    }
  };

  return (
    <>
      <Choix libelle="Catégorie" options={categories.map((c) => ({ valeur: c.id, libelle: c.nom }))} valeur={categorieId} onChange={setCategorieId} />
      <Champ libelle="Montant (FCFA)" obligatoire value={montant} onChangeText={setMontant} keyboardType="number-pad" />
      {sens === 'sortie' ? (
        <Choix
          libelle="État"
          options={[
            { valeur: 'payee', libelle: 'Payée' },
            { valeur: 'prevue', libelle: 'Prévue (pas encore payée)' },
          ]}
          valeur={prevue}
          onChange={setPrevue}
        />
      ) : null}
      <ChampDate libelle={prevue === 'prevue' ? 'Date prévue' : 'Date'} valeur={date} onChange={setDate} />
      <Choix libelle="Moyen de paiement" options={MODES} valeur={mode} onChange={setMode} />
      <Champ libelle="Description" value={description} onChangeText={setDescription} placeholder={sens === 'sortie' ? 'Ex. Réparation robinet' : 'Ex. Location de la cour'} />
      {sens === 'sortie' ? (
        <Champ libelle="Fournisseur ou bénéficiaire" value={beneficiaire} onChangeText={setBeneficiaire} placeholder="Facultatif" />
      ) : null}
      {logements.length ? (
        <Choix
          libelle="Logement concerné (facultatif)"
          options={[{ valeur: 0, libelle: 'Toute la maison' }, ...logements.map((l) => ({ valeur: l.id, libelle: l.reference }))]}
          valeur={logementId}
          onChange={setLogementId}
        />
      ) : null}
      {erreur ? <Text className="text-danger text-center">{erreur}</Text> : null}
      <Bouton titre={sens === 'sortie' ? 'Enregistrer la dépense' : 'Enregistrer la recette'} onPress={enregistrer} chargement={enCours} />
    </>
  );
}
