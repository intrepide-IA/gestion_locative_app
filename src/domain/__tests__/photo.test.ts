
import { zonePhoto } from '../photo';

test('cadre de l’écran converti en pixels de la photo (aperçu « cover »)', () => {
  // Écran 400 × 800, photo 3000 × 4000 : échelle max(400/3000, 800/4000) = 0,2 ; photo affichée 600 × 800, décalée de −100 px.
  const z = zonePhoto({ largeur: 400, hauteur: 800 }, { x: 20, y: 300, largeur: 360, hauteur: 227 }, { largeur: 3000, hauteur: 4000 }, 0);
  expect(z).toEqual({ x: 600, y: 1500, largeur: 1800, hauteur: 1135 });
  // Avec marge, la zone reste dans la photo.
  const m = zonePhoto({ largeur: 400, hauteur: 800 }, { x: 0, y: 0, largeur: 400, hauteur: 252 }, { largeur: 3000, hauteur: 4000 });
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.y).toBe(0);
});
