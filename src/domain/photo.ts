/** Calcul du recadrage d'une photo sur le cadre affiché à l'écran (sans module natif, testable). */

export interface Zone {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/**
 * Recadre une photo sur la zone du cadre affiché à l'écran. L'aperçu de l'appareil remplit l'écran
 * (mise à l'échelle « cover ») : on convertit le cadre de l'écran en pixels de la photo, avec une petite
 * marge pour ne pas couper les bords de la carte.
 */
export function zonePhoto(ecran: { largeur: number; hauteur: number }, cadre: Zone, photo: { largeur: number; hauteur: number }, marge = 0.04): Zone {
  const echelle = Math.max(ecran.largeur / photo.largeur, ecran.hauteur / photo.hauteur);
  const decalageX = (ecran.largeur - photo.largeur * echelle) / 2;
  const decalageY = (ecran.hauteur - photo.hauteur * echelle) / 2;
  const mx = cadre.largeur * marge;
  const my = cadre.hauteur * marge;
  const x = Math.max(0, (cadre.x - mx - decalageX) / echelle);
  const y = Math.max(0, (cadre.y - my - decalageY) / echelle);
  const largeur = Math.min(photo.largeur - x, (cadre.largeur + 2 * mx) / echelle);
  const hauteur = Math.min(photo.hauteur - y, (cadre.hauteur + 2 * my) / echelle);
  return { x: Math.round(x), y: Math.round(y), largeur: Math.round(largeur), hauteur: Math.round(hauteur) };
}
