/**
 * Modèle de contrat personnalisable : un texte simple, avec des informations à remplir écrites entre
 * doubles accolades, ex. {{locataire_nom}}. Chaque propriétaire peut utiliser le modèle Onílé, le modifier,
 * ou coller / importer le sien (copié depuis Word, enregistré en .txt…).
 *
 * Mise en forme : « # Titre » = grand titre, une ligne « Article … » ou « ## … » = intertitre,
 * « - … » = puce, une ligne vide sépare les paragraphes.
 */

export interface VariableModele {
  cle: string;
  libelle: string;
}

export const VARIABLES_MODELE: VariableModele[] = [
  { cle: 'bailleur_nom', libelle: 'Nom du bailleur' },
  { cle: 'bailleur_adresse', libelle: 'Adresse du bailleur' },
  { cle: 'bailleur_telephone', libelle: 'Téléphone du bailleur' },
  { cle: 'locataire_nom', libelle: 'Nom du locataire' },
  { cle: 'locataire_adresse', libelle: 'Adresse du locataire' },
  { cle: 'locataire_telephone', libelle: 'Téléphone du locataire' },
  { cle: 'locataire_piece', libelle: 'Pièce d’identité' },
  { cle: 'logement', libelle: 'Logement (référence)' },
  { cle: 'adresse_logement', libelle: 'Adresse du logement' },
  { cle: 'chambres', libelle: 'Nombre de chambres' },
  { cle: 'salon', libelle: 'Salon' },
  { cle: 'cuisine', libelle: 'Cuisine' },
  { cle: 'salle_de_bain', libelle: 'Salle de bain' },
  { cle: 'autres', libelle: 'Autres pièces' },
  { cle: 'duree_annees', libelle: 'Durée (années)' },
  { cle: 'loyer', libelle: 'Loyer mensuel' },
  { cle: 'toilettes', libelle: 'Contribution toilettes' },
  { cle: 'jour_paiement', libelle: 'Jour de paiement' },
  { cle: 'premier_loyer', libelle: 'Date du 1er loyer' },
  { cle: 'mois_impayes', libelle: 'Mois d’impayés avant résiliation' },
  { cle: 'caution', libelle: 'Caution de loyer' },
  { cle: 'caution_mois', libelle: 'Caution en mois de loyer' },
  { cle: 'caution_electricite', libelle: 'Caution électricité' },
  { cle: 'caution_eau', libelle: 'Caution eau' },
  { cle: 'date_effet', libelle: 'Date de prise d’effet' },
  { cle: 'preavis_mois', libelle: 'Préavis (mois)' },
  { cle: 'fait_a', libelle: 'Fait à (ville)' },
  { cle: 'date_signature', libelle: 'Date de signature' },
];

/** Modèle Onílé (celui du propriétaire d'origine), point de départ de toute personnalisation. */
export const MODELE_PAR_DEFAUT = `# CONTRAT DE BAIL D’HABITATION

## Identification des parties
Le Bailleur : {{bailleur_nom}}, demeurant à {{bailleur_adresse}}, téléphone {{bailleur_telephone}}.

Le Locataire : {{locataire_nom}}, demeurant à {{locataire_adresse}}, téléphone {{locataire_telephone}}, pièce d’identité {{locataire_piece}}.

Article 1 : Objet du contrat
Le bailleur donne en location au locataire un logement à usage d’habitation situé à : {{adresse_logement}} (logement {{logement}}).
Description du logement : nombre de chambres : {{chambres}}, salon : {{salon}}, cuisine : {{cuisine}}, salle de bain : {{salle_de_bain}}. Autres : {{autres}}.

Article 2 : Durée du bail
Le présent bail est conclu pour une durée de {{duree_annees}} année(s). Il peut être renouvelé par accord entre les parties.

Article 3 : Loyer
Le loyer mensuel est fixé à {{loyer}}, auquel s’ajoute une contribution aux toilettes de {{toilettes}}.
Le paiement doit être effectué le {{jour_paiement}} de chaque mois, le premier loyer étant dû le {{premier_loyer}}.

Article 4 : Défaut de paiement du loyer
Le non-paiement de {{mois_impayes}} mois de loyer constitue un motif de résiliation du présent contrat. Dans ce cas, le propriétaire peut demander la résiliation pure et simple du bail. Le locataire devra libérer le logement après notification conformément aux dispositions légales.

Article 5 : Charges
Les frais de consommation d’eau, d’électricité et les charges courantes d’entretien sont à la charge du locataire.

Article 6 : Caution
Le locataire verse une caution de {{caution}} (soit {{caution_mois}} mois de loyer), une caution pour l’électricité de {{caution_electricite}} et une caution pour l’eau de {{caution_eau}}.
Conformément à la réglementation en vigueur au Bénin, la caution ne peut excéder trois mois de loyer. Elle sera restituée à la fin du bail après vérification de l’état du logement.

Article 7 : Résiliation du bail et préavis
Le présent bail prend effet à compter du {{date_effet}}.
Il ne peut être résilié par l’une ou l’autre des parties qu’après un préavis de {{preavis_mois}} mois notifié à l’autre partie. En cas de non-respect des obligations du locataire ou de non-paiement du loyer, le propriétaire peut mettre fin au contrat conformément à la loi.

Article 8 : Obligations du locataire
- Payer régulièrement le loyer.
- Utiliser le logement en bon père de famille.
- Répondre des dégradations causées.
- Ne pas modifier les lieux sans l’accord du propriétaire.

Article 9 : Obligations du bailleur
- Mettre le logement à disposition du locataire.
- Garantir une jouissance paisible du logement.
- Effectuer les grosses réparations nécessaires.

Article 10 : État des lieux
Le locataire reconnaît avoir visité le logement et l’accepter dans l’état où il se trouve. Un état des lieux pourra être établi lors de l’entrée et de la sortie.

Article 11 : Activités interdites
Le logement est exclusivement destiné à un usage d’habitation. Toute activité commerciale ou illégale est interdite sans autorisation écrite du propriétaire.

Article 12 : Signatures
Fait à {{fait_a}}, le {{date_signature}}, en deux exemplaires, un pour chaque partie.`;

const echapper = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Variables utilisées dans un texte qui n'existent pas (fautes de frappe), pour prévenir l'utilisateur. */
export function variablesInconnues(texte: string): string[] {
  const connues = new Set(VARIABLES_MODELE.map((v) => v.cle));
  const trouvees = [...texte.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(trouvees.filter((v) => !connues.has(v)))];
}

/**
 * Transforme le modèle en HTML : texte échappé, informations remplies en gras (vide = pointillés),
 * titres, intertitres, puces et paragraphes.
 */
export function modeleEnHtml(texte: string, valeurs: Record<string, string | null | undefined>): string {
  const remplir = (ligne: string) =>
    echapper(ligne).replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, cle: string) => {
      const v = valeurs[cle];
      return v === null || v === undefined || v === '' ? '<span class="vide">………………</span>' : `<b>${echapper(v)}</b>`;
    });

  const blocs: string[] = [];
  let liste: string[] = [];
  const fermerListe = () => {
    if (liste.length) blocs.push(`<ul>${liste.map((l) => `<li>${l}</li>`).join('')}</ul>`);
    liste = [];
  };

  for (const brute of texte.replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = brute.trim();
    if (!ligne) {
      fermerListe();
      continue;
    }
    if (/^[-•*]\s+/.test(ligne)) {
      liste.push(remplir(ligne.replace(/^[-•*]\s+/, '')));
      continue;
    }
    fermerListe();
    if (ligne.startsWith('# ')) blocs.push(`<h1>${remplir(ligne.slice(2))}</h1>`);
    else if (ligne.startsWith('## ')) blocs.push(`<h2>${remplir(ligne.slice(3))}</h2>`);
    else if (/^article\s+\d+/i.test(ligne)) blocs.push(`<h2>${remplir(ligne)}</h2>`);
    else blocs.push(`<p>${remplir(ligne)}</p>`);
  }
  fermerListe();
  return blocs.join('\n');
}
