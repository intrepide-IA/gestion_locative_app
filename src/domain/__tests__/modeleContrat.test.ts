import { MODELE_PAR_DEFAUT, modeleEnHtml, VARIABLES_MODELE, variablesInconnues } from '../modeleContrat';

test('mise en forme : titre, intertitres, puces, paragraphes ; valeurs échappées et vides en pointillés', () => {
  const html = modeleEnHtml('# Mon bail\n\nArticle 1 : Loyer\nLoyer de {{loyer}} payé par {{ locataire_nom }}.\n- Point A\n- Point B\n\nVille : {{fait_a}}', {
    loyer: '25 000 FCFA',
    locataire_nom: 'Awa <script>',
    fait_a: null,
  });
  expect(html).toContain('<h1>Mon bail</h1>');
  expect(html).toContain('<h2>Article 1 : Loyer</h2>');
  expect(html).toContain('<b>25 000 FCFA</b>');
  expect(html).toContain('Awa &lt;script&gt;');
  expect(html).toContain('<ul><li>Point A</li><li>Point B</li></ul>');
  expect(html).toContain('<span class="vide">');
});

test('le modèle par défaut n’utilise que des informations connues', () => {
  expect(variablesInconnues(MODELE_PAR_DEFAUT)).toEqual([]);
  expect(variablesInconnues('{{loyer}} {{loyers}} {{nom_proprio}}')).toEqual(['loyers', 'nom_proprio']);
  expect(VARIABLES_MODELE.length).toBeGreaterThan(20);
});
