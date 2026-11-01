import { miseEnFormeContrat, placerVariables, type LigneOcr } from '../miseEnFormeContrat';

/** Fabrique des lignes reconnues : une ligne de texte par entrée, de haut en bas. */
function page(lignes: (string | { t: string; h?: number; x?: number; l?: number; saut?: number })[]) {
  let y = 100;
  const sortie: LigneOcr[] = lignes.map((e, i) => {
    const d = typeof e === 'string' ? { t: e } : e;
    y += d.saut ?? 0;
    const h = d.h ?? 30;
    const ligne = { texte: d.t, x: d.x ?? 120, y, largeur: d.l ?? 1300, hauteur: h, bloc: i };
    y += h + 10;
    return ligne;
  });
  return { largeur: 1500, hauteur: 2100, lignes: sortie };
}

test('reconstitue titre, articles, paragraphes recollés, puces et mots coupés', () => {
  const r = miseEnFormeContrat([
    page([
      { t: 'CONTRAT DE BAIL', h: 48, x: 500, l: 500 },
      { t: 'ARTICLE 1 : OBJET', saut: 30 },
      'Le bailleur donne en location au loca-',
      'taire un logement à usage d’habitation.',
      { t: 'Art. 2 - Obligations du locataire', saut: 30 },
      '• Payer le loyer.',
      '- Entretenir le logement.',
      { t: 'Le locataire s’engage à respecter le règlement.', saut: 30 },
    ]),
  ]);
  expect(r.texte).toBe(
    [
      '# CONTRAT DE BAIL',
      '',
      'Article 1 : OBJET',
      'Le bailleur donne en location au locataire un logement à usage d’habitation.',
      '',
      'Article 2 : Obligations du locataire',
      '- Payer le loyer.',
      '- Entretenir le logement.',
      '',
      'Le locataire s’engage à respecter le règlement.',
    ].join('\n')
  );
});

test('les pointillés deviennent des informations Onílé quand le contexte est clair', () => {
  const { texte, variables } = placerVariables(
    [
      'Le Bailleur : ....................., demeurant à ................, Tél : ..........',
      'Le Locataire : ____________________, demeurant à ……………… CNI n° ..........',
      'Le loyer mensuel est fixé à ............ FCFA, payable avant le ..... de chaque mois.',
      'Une caution de ............ FCFA et une caution électricité de .......... FCFA.',
      'Fait à ............, le ............',
    ].join('\n')
  );
  expect(texte.split('\n')).toEqual([
    'Le Bailleur : {{bailleur_nom}}, demeurant à {{bailleur_adresse}}, Tél : {{bailleur_telephone}}',
    'Le Locataire : {{locataire_nom}}, demeurant à {{locataire_adresse}} CNI n° {{locataire_piece}}',
    'Le loyer mensuel est fixé à {{loyer}} FCFA, payable avant le …… de chaque mois.',
    'Une caution de {{caution}} FCFA et une caution électricité de {{caution_electricite}} FCFA.',
    'Fait à {{fait_a}}, le {{date_signature}}',
  ]);
  expect(variables).toBe(11);
});

test('deux pages : le texte continue, les lignes d’une même hauteur sont rassemblées', () => {
  const p1 = page(['Article 3 : Loyer', 'Le loyer est payable', 'chaque mois.']);
  const p2 = page(['Article 4 : Résiliation']);
  p2.lignes.push({ texte: 'Signature', x: 900, y: p2.lignes[0].y, largeur: 300, hauteur: 30, bloc: 9 });
  const r = miseEnFormeContrat([p1, p2]);
  expect(r.texte).toBe('Article 3 : Loyer\nLe loyer est payable chaque mois.\n\nArticle 4 : Résiliation Signature');
  expect(r.aCompleter).toBe(0);
});
