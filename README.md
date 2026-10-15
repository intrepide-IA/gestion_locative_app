# Onílé — gestion locative hors ligne

Application Android (React Native + Expo SDK 57 + TypeScript + SQLite) pour un propriétaire individuel :
logements, locataires, loyers, factures, électricité prépayée et comptabilité, sans serveur ni connexion.

Référence fonctionnelle : le cahier des charges Onílé v2.0. Suivi de la refonte : [docs/refonte.md](docs/refonte.md).

## Prérequis

- Node.js 20 ou plus récent (les tests de base de données utilisent `node:sqlite`, Node 22.5+)
- Un téléphone Android avec le mode développeur, ou un émulateur Android Studio

## Commandes

```bash
npm install
npm run typecheck   # TypeScript strict
npm run lint        # ESLint (config Expo)
npm test            # Jest : schéma SQLite et règles métier
npm run check       # les trois à la suite
```

Lancer sur un téléphone (build de développement, nécessaire à cause de SQLite et des modules natifs) :

```bash
npx expo run:android
```

Générer un APK installable :

```bash
npx eas-cli@latest build --platform android --profile preview
```

Les dossiers `android/` et `ios/` sont générés (Continuous Native Generation) : ne pas les modifier à la main,
configurer `app.json` à la place.

## Organisation

| Dossier | Rôle |
| --- | --- |
| `src/db` | Base SQLite : schéma, migrations versionnées (`PRAGMA user_version`), accès et transactions |
| `src/theme` | Palette Onílé (source unique des couleurs, reprise par Tailwind) |
| `src/screens`, `src/components` | Interface (NativeWind) |
| `src/services` | Anciens services, remplacés lot par lot par une couche métier testée |
| `src/database/db.native.ts` | Pont temporaire vers la nouvelle base, à supprimer en fin de refonte |

## Données

Base locale `onile.db`. L'ancienne base `GestiLocDB` de la version précédente n'est ni lue ni effacée.
