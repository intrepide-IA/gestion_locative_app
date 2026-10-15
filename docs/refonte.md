# Suivi de la refonte Onílé

Un compte rendu par lot, du plus récent au plus ancien. Référence : cahier des charges Onílé v2.0, section 13.

## Lot 1 — Socle technique (15 octobre 2026)

**Statut : livré, à valider sur téléphone.** Branche `refonte/lot-1-socle`.

### Fait

- Retrait des restes Vite, Capacitor et Dexie : `android/` Capacitor, `vite.config.ts`, `index.html`,
  `postcss.config.js`, `capacitor.config.ts`, `src/index.tsx`, `src/database/db.ts`, `src/utils/initDb.ts`,
  composants inutilisés `BottomNav` et `StatusBar`.
- Passage à **Expo SDK 57** (React Native 0.86, React 19.2, TypeScript 6), dépendances alignées par
  `npx expo install` ; `expo-doctor` : 21/21.
- Point d'entrée Expo `index.ts`, configuration `app.json` (nom Onílé, paquet `com.onile.app`, écran de
  démarrage vert, icône adaptative), NativeWind 4 avec `metro.config.js` et `global.css`.
- Thème Onílé : `src/theme/colors.ts` + tokens Tailwind (`primary`, `secondary`, `accent`, `background`, `ink`,
  `muted`, `border`, `danger`), police Inter (4 graisses).
- Nouvelle base `onile.db` : schéma complet v1 (`src/db/schema.ts`), migrations transactionnelles
  (`src/db/migrate.ts`), clés étrangères et WAL activés, transactions exclusives (`src/db/client.ts`).
- Contraintes en base : un contrat actif par logement et par locataire, une échéance par contrat et par mois,
  montant dû = loyer + toilettes, affectations ≤ paiement (trigger), index de compteur qui recule seulement avec
  motif, un mouvement financier par opération d'origine, numéros de documents uniques.
- Moti retiré (non maintenu, il installait une seconde copie de React) : animations passées sur Reanimated 4.
- Sécurité immédiate : la session n'est plus conservée entre deux lancements (PIN redemandé à chaque ouverture).
- Import JSON et réinitialisation de l'ancien code désactivés (affichés « bientôt ») : ils pouvaient vider la
  base sans transaction et reprenaient des noms de colonnes du fichier.
- Outillage : ESLint (config Expo), Prettier, Jest ; les tests exécutent le vrai schéma via `node:sqlite`.

### Vérifications

| Contrôle | Résultat |
| --- | --- |
| `tsc --noEmit` | 0 erreur |
| `jest` | 13 tests sur 13 (migrations, contraintes, transactions, thème) |
| `expo-doctor` | 21/21 |
| `expo export --platform android` | bundle produit (5,8 Mo) |
| `expo lint` | 5 erreurs restantes, toutes dans des écrans réécrits aux lots 3 et 4 (voir ci-dessous) |
| Test sur téléphone Android | **non fait** : à réaliser avec `npx expo run:android` |

### Limites connues à l'issue du lot 1

- Les anciens services (`src/services`) utilisent encore les colonnes de l'ancien schéma : les écrans Logements,
  Locataires, Factures et le tableau de bord affichent une erreur de chargement tant que les lots 3 à 7 ne les
  ont pas remplacés. Aucun de ces écrans ne doit être considéré comme fonctionnel.
- Le PIN reste provisoire (1234, AsyncStorage) jusqu'au lot 2.
- Lint : `react-hooks/set-state-in-effect` dans `LocataireFormModal`, `LogementFormModal`, `PaymentModal`,
  `InvoicesScreen` et `SettingsScreen` (réinitialisation de formulaire dans un effet) ; corrigé lors de leur
  réécriture.
- Le chiffrement SQLCipher (`useSQLCipher`) est prévu au lot 2 avec la gestion de la clé.
- Icônes et écran de démarrage : images par défaut d'Expo en attendant le logo Onílé en SVG/PNG 1024 px.

### Écarts avec le modèle de données du cahier des charges

- Pas de table `credits_locataire` : le crédit d'un locataire est la part non affectée de ses paiements valides
  (calculée, donc jamais incohérente).
- Pas de colonne `kwh_restants` : le stock est calculé (kWh achetés − consommation), un déficit apparaît en
  négatif.
- Ajout des tables `affectations`, `recus`, `sequences` et `notifications_programmees`.
