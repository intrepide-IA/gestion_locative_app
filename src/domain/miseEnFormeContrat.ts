/**
 * Contrat papier photographié ou PDF → modèle de contrat Onílé.
 * À partir des lignes reconnues (texte + position), on reconstitue la mise en forme du modèle :
 * « # » grand titre, « ## » / « Article … » intertitres, « - » puces, paragraphes séparés par une ligne vide.
 * Les espaces à remplir (pointillés) sont remplacés, quand le contexte est clair, par les informations
 * Onílé ({{locataire_nom}}, {{loyer}}…) ; les autres restent « …… » pour que la personne les complète.
 */

export interface LigneOcr {
  texte: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  bloc: number;
}

export interface PageOcr {
  largeur: number;
  hauteur: number;
  lignes: LigneOcr[];
}

export interface ContratReconnu {
  texte: string;
  /** Informations Onílé placées automatiquement. */
  variables: number;
  /** Espaces à remplir restés « …… ». */
  aCompleter: number;
}

const ARTICLE = /^(article|art\.?)\s*(\d+|[ivxlc]+|premier|1er)\b\s*[:.\-–—]?\s*/i;
const PUCE = /^[-–•*·▪►➢✓o]\s+/;
/** Espace à remplir : au moins 4 points, tirets bas ou points de suspension (l'espace qui suit est gardé). */
const POINTILLES = /[._…](?:\s?[._…]){3,}|…{2,}/;

const mediane = (v: number[]) => {
  if (!v.length) return 0;
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

/** Lignes d'une page dans l'ordre de lecture (haut en bas, gauche à droite pour une même hauteur). */
function ordonner(lignes: LigneOcr[]): LigneOcr[] {
  const t = [...lignes].sort((a, b) => a.y - b.y);
  const rangees: LigneOcr[][] = [];
  for (const l of t) {
    const r = rangees[rangees.length - 1];
    if (r && Math.abs(r[0].y - l.y) < Math.min(r[0].hauteur, l.hauteur) * 0.5) r.push(l);
    else rangees.push([l]);
  }
  return rangees.flatMap((r) =>
    r.length === 1
      ? r
      : [{ ...r[0], texte: r.sort((a, b) => a.x - b.x).map((x) => x.texte).join(' '), x: Math.min(...r.map((x) => x.x)), largeur: Math.max(...r.map((x) => x.x + x.largeur)) - Math.min(...r.map((x) => x.x)) }]
  );
}

const estMajuscules = (t: string) => {
  const lettres = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return lettres.length >= 4 && lettres === lettres.toUpperCase();
};

/** Corrections légères des confusions fréquentes de la reconnaissance. */
function nettoyer(t: string): string {
  return t
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s*:\s*/g, ' : ')
    .replace(/'/g, '’')
    .replace(/\bF\s?CFA\b/gi, 'FCFA')
    .trim();
}

/** Remplace les pointillés dont le sens est clair par les informations Onílé. */
export function placerVariables(texte: string): { texte: string; variables: number } {
  let variables = 0;
  let partie: 'bailleur' | 'locataire' | null = null;
  const lignes = texte.split('\n').map((ligne) => {
    // Partie dont on parle (pour « demeurant à », « téléphone »…) : celle nommée seule sur la ligne, sinon la précédente.
    const b = /\b(bailleur|propri[ée]taire)\b/i.test(ligne);
    const l = /\b(locataire|preneur)\b/i.test(ligne);
    if (b && !l) partie = 'bailleur';
    else if (l && !b) partie = 'locataire';
    const qui = partie ?? 'locataire';
    const regles: [RegExp, string][] = [
      [/\b(le bailleur|le propri[ée]taire|bailleur|propri[ée]taire)\s*(?:\(.*?\))?\s*:?\s*(?:M\.|Mme|Mr|Monsieur|Madame)?\s*$/i, 'bailleur_nom'],
      [/\b(le locataire|locataire|le preneur|preneur)\s*(?:\(.*?\))?\s*:?\s*(?:M\.|Mme|Mr|Monsieur|Madame)?\s*$/i, 'locataire_nom'],
      [/\b(nom(?: et pr[ée]noms?)?|noms? et pr[ée]noms?)\s*:?\s*$/i, `${qui}_nom`],
      [/\b(demeurant|domicili[ée]e?|r[ée]sidant)\s*(?:à|a|au)?\s*:?\s*$/i, `${qui}_adresse`],
      [/\b(t[ée]l[ée]phone|t[ée]l\.?|contact|cel+\.?)\s*:?\s*(?:n°|no)?\s*$/i, `${qui}_telephone`],
      [/\b(pi[èe]ce d.identit[ée]|carte d.identit[ée]|CNI|CIP|passeport)\s*(?:n°|no)?\s*:?\s*$/i, 'locataire_piece'],
      [/\b(situ[ée]e?|sis|sise)\s*(?:à|a|au)\s*:?\s*$/i, 'adresse_logement'],
      [/\bloyer\b[^.\n]{0,60}?(?:de|à|a|:)\s*$/i, 'loyer'],
      [/\btoilettes?\b[^.\n]{0,40}?(?:de|à|a|:)\s*$/i, 'toilettes'],
      [/\bcaution\b[^.\n]{0,40}?(?:électricit[ée]|courant)[^.\n]{0,20}?(?:de|à|a|:)\s*$/i, 'caution_electricite'],
      [/\bcaution\b[^.\n]{0,40}?\beau\b[^.\n]{0,20}?(?:de|à|a|:)\s*$/i, 'caution_eau'],
      [/\b(caution|d[ée]p[ôo]t de garantie|avance)\b[^.\n]{0,40}?(?:de|à|a|:)\s*$/i, 'caution'],
      [/\bdur[ée]e\b[^.\n]{0,40}?(?:de|:)\s*$/i, 'duree_annees'],
      [/\bpr[ée]avis\b[^.\n]{0,30}?(?:de|:)\s*$/i, 'preavis_mois'],
      [/\b(à compter du|a compter du|prend effet le|à partir du|a partir du)\s*$/i, 'date_effet'],
      [/\bfait\s+(?:à|a)\s*$/i, 'fait_a'],
      [/\{\{fait_a\}\}\s*,?\s*le\s*$/i, 'date_signature'],
    ];
    let sortie = '';
    let reste = ligne;
    let m: RegExpExecArray | null;
    while ((m = POINTILLES.exec(reste))) {
      const avant = sortie + reste.slice(0, m.index);
      const regle = regles.find(([r]) => r.test(avant));
      const cle = regle?.[1];
      sortie = cle ? `${avant}{{${cle}}}` : `${avant}……`;
      if (cle) variables += 1;
      reste = reste.slice(m.index + m[0].length);
    }
    return sortie + reste;
  });
  return { texte: lignes.join('\n'), variables };
}

export function miseEnFormeContrat(pages: PageOcr[]): ContratReconnu {
  const toutes = pages.flatMap((p) => p.lignes);
  const hMed = mediane(toutes.map((l) => l.hauteur)) || 20;
  const sortie: string[] = [];
  let paragraphe: string | null = null;
  let precedente: LigneOcr | null = null;
  let titreFait = false;

  const fermer = () => {
    if (paragraphe !== null) sortie.push(paragraphe, '');
    paragraphe = null;
  };

  for (const page of pages) {
    precedente = null;
    for (const l of ordonner(page.lignes)) {
      const texte = nettoyer(l.texte);
      if (!texte) continue;
      const centre = l.x + l.largeur / 2;
      const centree = page.largeur > 0 && Math.abs(centre - page.largeur / 2) < page.largeur * 0.08 && l.largeur < page.largeur * 0.7;
      const grand = l.hauteur > hMed * 1.3;
      const ecart = precedente ? l.y - (precedente.y + precedente.hauteur) : Infinity;

      if (ARTICLE.test(texte)) {
        fermer();
        const [, , numero] = ARTICLE.exec(texte)!;
        const suite = texte.replace(ARTICLE, '');
        const n = /^(premier|1er)$/i.test(numero) ? '1' : numero.toUpperCase();
        sortie.push(`Article ${n}${suite ? ` : ${suite}` : ''}`);
      } else if (!titreFait && (grand || (centree && estMajuscules(texte))) && texte.length < 90) {
        fermer();
        sortie.push(`# ${texte}`, '');
        titreFait = true;
      } else if ((grand || (estMajuscules(texte) && texte.length < 70) || (centree && texte.length < 60 && !/[.,;]$/.test(texte))) && !PUCE.test(texte)) {
        fermer();
        sortie.push(`## ${texte}`);
      } else if (PUCE.test(texte)) {
        fermer();
        sortie.push(`- ${texte.replace(PUCE, '')}`);
      } else if (paragraphe !== null && precedente && ecart < hMed * 0.9 && !/[:;]$/.test(paragraphe)) {
        // Même paragraphe : on recolle, y compris les mots coupés en fin de ligne (« loca- » + « taire »).
        paragraphe = /[a-zà-ÿ]-$/.test(paragraphe) ? paragraphe.slice(0, -1) + texte : `${paragraphe} ${texte}`;
      } else {
        if (sortie.length && sortie[sortie.length - 1].startsWith('- ')) sortie.push('');
        fermer();
        paragraphe = texte;
      }
      precedente = l;
    }
  }
  fermer();

  const brut = sortie
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(^Article [^\n]+)\n\n/gm, '$1\n')
    .trim();
  const { texte, variables } = placerVariables(brut);
  return { texte, variables, aCompleter: (texte.match(/……/g) ?? []).length };
}
