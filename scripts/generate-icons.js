/**
 * Génère les icônes et l'écran de démarrage à partir des symboles vectoriels de assets/brand.
 * Usage : npm run icons
 */
const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const brand = (file) => fs.readFileSync(path.join(ROOT, 'assets', 'brand', file));
const out = (file) => path.join(ROOT, 'assets', file);

const PRIMARY = '#0F6B4F';
const BACKGROUND = '#FBF6EF';

/** Place un symbole SVG centré sur un carré `size`, à `ratio` de la largeur. */
async function compose(svg, size, ratio, background) {
  const inner = Math.round(size * ratio);
  const symbol = await sharp(svg, { density: 1200 }).resize(inner, inner).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: symbol, gravity: 'center' }])
    .png();
}

async function main() {
  const couleur = brand('onile-symbole.svg');
  const fondVert = brand('onile-symbole-fond-vert.svg');
  const mono = brand('onile-symbole-mono.svg');

  // Icône classique (stores, anciens Android) : fond vert plein, symbole blanc et jaune.
  await (await compose(fondVert, 1024, 0.72, PRIMARY)).toFile(out('icon.png'));
  // Icône adaptative Android : le système découpe au plus 66 % central, d'où un symbole à 62 %.
  await (await compose(fondVert, 1024, 0.62)).toFile(out('android-icon-foreground.png'));
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: PRIMARY } })
    .png()
    .toFile(out('android-icon-background.png'));
  await (await compose(mono, 1024, 0.62)).toFile(out('android-icon-monochrome.png'));
  // Écran de démarrage (fond vert défini dans app.json).
  await (await compose(fondVert, 1024, 1)).toFile(out('splash-icon.png'));
  // Favicon de l'aperçu web.
  await (await compose(couleur, 196, 0.9, BACKGROUND)).toFile(out('favicon.png'));

  console.log('Icônes générées dans assets/.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
