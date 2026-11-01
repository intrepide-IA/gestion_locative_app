/**
 * Modèles ML Kit téléchargés par Google Play dès l'installation : lecteur de codes (appareil photo Expo)
 * et lecture de texte (module lecture-texte). Les deux bibliothèques déclarent le même réglage avec des
 * valeurs différentes ; le manifeste de l'application les réunit et a le dernier mot (tools:replace).
 */
const { withAndroidManifest } = require('expo/config-plugins');

const NOM = 'com.google.mlkit.vision.DEPENDENCIES';

module.exports = function withMlKitDependances(config) {
  return withAndroidManifest(config, (c) => {
    const manifeste = c.modResults.manifest;
    manifeste.$['xmlns:tools'] = manifeste.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const application = manifeste.application[0];
    application['meta-data'] = (application['meta-data'] ?? []).filter((m) => m.$['android:name'] !== NOM);
    application['meta-data'].push({
      $: { 'android:name': NOM, 'android:value': 'barcode_ui,ocr', 'tools:replace': 'android:value' },
    });
    return c;
  });
};
