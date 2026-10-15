/**
 * Prépare les secrets GitHub de signature à partir de la clé téléchargée depuis Expo.
 *
 * Avant : npx eas-cli@latest credentials -p android
 *         → profil « preview » → « credentials.json: Upload/Download… » → « Download credentials from EAS to credentials.json »
 *         (crée credentials.json et android/keystores/… à la racine du projet ; ces fichiers sont ignorés par Git)
 *
 * Puis :  node scripts/preparer-cle-github.mjs
 *         → écrit secrets-github.txt (ignoré par Git) avec les 4 valeurs à copier dans
 *           GitHub → Settings → Secrets and variables → Actions → New repository secret.
 *
 * Supprimez secrets-github.txt une fois les secrets créés. Gardez une copie de la clé en lieu sûr :
 * sans elle, aucune mise à jour ne pourra s'installer par-dessus l'application.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const RACINE = new URL('..', import.meta.url);
const fichier = new URL('credentials.json', RACINE);
if (!existsSync(fichier)) {
  console.error('credentials.json introuvable. Lancez d’abord : npx eas-cli@latest credentials -p android (voir docs/BUILD-GITHUB.md).');
  process.exit(1);
}
const { android } = JSON.parse(readFileSync(fichier, 'utf8'));
const k = android?.keystore;
if (!k?.keystorePath || !k.keystorePassword || !k.keyAlias || !k.keyPassword) {
  console.error('credentials.json incomplet (android.keystore.keystorePath / keystorePassword / keyAlias / keyPassword).');
  process.exit(1);
}
const cle = readFileSync(new URL(k.keystorePath, RACINE));
const empreinte = createHash('sha256').update(cle).digest('hex').slice(0, 16);

const secrets = {
  ANDROID_KEYSTORE_BASE64: cle.toString('base64'),
  ANDROID_KEYSTORE_PASSWORD: k.keystorePassword,
  ANDROID_KEY_ALIAS: k.keyAlias,
  ANDROID_KEY_PASSWORD: k.keyPassword,
};
const texte = Object.entries(secrets)
  .map(([nom, valeur]) => `===== ${nom} =====\n${valeur}\n`)
  .join('\n');
writeFileSync(new URL('secrets-github.txt', RACINE), texte);
console.log(`Clé lue (${cle.length} octets, empreinte ${empreinte}).`);
console.log('secrets-github.txt écrit : copiez chaque valeur dans GitHub → Settings → Secrets and variables → Actions.');
console.log('Puis supprimez secrets-github.txt.');
