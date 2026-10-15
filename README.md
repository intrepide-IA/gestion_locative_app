# Onílé — gestion locative hors ligne

Application Android (React Native + Expo SDK 57 + TypeScript + SQLite chiffrée) pour un propriétaire :
logements, locataires et contrats, loyers et paiements, factures et reçus PDF partageables (WhatsApp),
électricité prépayée, comptabilité simplifiée, rappels, sauvegarde chiffrée. Tout fonctionne sans internet.

Référence : cahier des charges Onílé v2.0. Journal de la refonte, lot par lot : [docs/refonte.md](docs/refonte.md).

## Fonctionnalités

| Onglet | Contenu |
| --- | --- |
| Accueil | Loyers du mois, occupation, alertes d'électricité, 6 actions rapides |
| Logements | Liste, recherche, filtres, fiche, ajout/modification, archivage, attribution |
| Locataires | Entrée avec contrat et caution, fiche, situation (reste dû, avance), paiements, électricité, départ |
| Loyers | Échéances du mois, statuts (payée, partielle, en attente, en retard), encaissement, facture et reçu PDF, annulation tracée |
| Finances | Trésorerie, dépenses et recettes (payées ou prévues), rapports mensuels et annuels, export CSV |
| Plus | Électricité prépayée, sauvegarde et restauration, notifications, profil, PIN, verrouillage |

## Commandes

```bash
npm install
npm run check        # TypeScript + ESLint + tests (Jest)
npm start            # serveur de développement
npx expo start --web # aperçu dans le navigateur (développement uniquement, sans chiffrement)
npm run icons        # régénère les icônes depuis assets/brand/*.svg
```

APK installable (build dans le cloud Expo, aucun SDK Android requis sur le PC) :

```bash
npx eas-cli@latest build --platform android --profile preview
```

Les dossiers `android/` et `ios/` sont générés : ne pas les modifier, configurer `app.json`.

## Architecture

| Dossier | Rôle |
| --- | --- |
| `src/db` | SQLite : schéma, migrations (`PRAGMA user_version`), transactions sérialisées, ouverture chiffrée |
| `src/domain` | Règles pures et testées : échéances, électricité, rappels, formats, PBKDF2, chiffrement des sauvegardes |
| `src/repositories` | Accès aux données métier (aucun écran n'écrit de SQL) |
| `src/documents` | Gabarits HTML des PDF (reçu, factures) et partage |
| `src/services` | Modules du téléphone : notifications, fichiers, sauvegarde |
| `src/security` | PIN haché, blocage, verrouillage automatique, clé de la base |
| `src/features` | Écrans par module ; `src/components` : logo et composants d'interface |
| `src/theme` | Palette Onílé et police Inter |

Les tests (`npm test`, 99 tests) exécutent le vrai schéma SQL avec `node:sqlite` (Node 22.5 ou plus récent).

## Données et sécurité

- Base `onile-securise.db` chiffrée (SQLCipher), clé aléatoire dans le Keystore Android.
- PIN de 4 à 6 chiffres, haché et salé, jamais en clair ; blocage progressif après 5 erreurs ; verrouillage
  au lancement et après 2 minutes en arrière-plan.
- **Désinstaller l'application efface la clé : faites régulièrement une sauvegarde** (Plus → Sauvegarde) et
  gardez le fichier et son mot de passe hors du téléphone.
