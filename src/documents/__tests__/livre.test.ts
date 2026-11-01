import { writeFileSync } from 'node:fs';

import { strFromU8, unzipSync } from 'fflate';

import { createMigratedDatabase } from '../../db/__tests__/nodeDatabase';
import { chargerDonneesDemo } from '../../dev/donneesDemo';
import { donneesLivre, periodesLivre } from '../../repositories/livreRepository';
import { htmlLivre, xlsxLivre } from '../livre';
import { lettreColonne, serieExcel } from '../tableur';

test('colonnes et dates au format Excel', () => {
  expect([0, 25, 26, 27, 701].map(lettreColonne)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ']);
  expect(serieExcel('1900-03-01')).toBe(61);
  expect(serieExcel('2026-11-01')).toBe(46327);
});

test('livre de tenue : chambres, paiements et totaux cohérents, en PDF et en Excel', async () => {
  const db = await createMigratedDatabase();
  await chargerDonneesDemo(db);
  const jour = '2026-10-28';
  const periodes = await periodesLivre(db, jour);
  expect(periodes.map((p) => p.libelle)).toEqual(['Année 2026', 'Année 2025', '12 derniers mois', 'Depuis le début']);
  const livre = await donneesLivre(db, 'Ma maison', periodes[3], jour);

  expect(livre.chambres.length).toBeGreaterThan(0);
  expect(livre.synthese.locatairesActifs).toBe(4);
  // Le total des paiements par chambre ne dépasse jamais le journal des paiements.
  const parChambre = livre.chambres.reduce((t, c) => t + c.paiements.reduce((s, p) => s + p.montant, 0), 0);
  expect(parChambre).toBeLessThanOrEqual(livre.synthese.loyersEncaisses);
  for (const c of livre.chambres) {
    expect(c.totalPaye).toBeLessThanOrEqual(c.totalDu);
    expect(c.echeances.every((e) => e.reste === Math.max(0, e.du - e.paye))).toBe(true);
  }

  const html = htmlLivre(livre);
  expect(html).toContain('Livre de tenue de la maison');
  expect(html).toContain('Situations irrégulières');
  expect(html).not.toContain('undefined');
  expect(html).not.toContain('NaN');

  const octets = xlsxLivre(livre);
  const fichiers = unzipSync(octets);
  expect(Object.keys(fichiers)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet9.xml']));
  expect(strFromU8(fichiers['xl/workbook.xml'])).toContain('name="Recettes et dépenses"');
  expect(strFromU8(fichiers['xl/worksheets/sheet6.xml'])).toContain('<autoFilter');

  // Fichiers d'aperçu pour un contrôle visuel (dossier indiqué par la variable LIVRE_APERCU).
  if (process.env.LIVRE_APERCU) {
    writeFileSync(`${process.env.LIVRE_APERCU}/livre.html`, html);
    writeFileSync(`${process.env.LIVRE_APERCU}/livre.xlsx`, octets);
  }
});
