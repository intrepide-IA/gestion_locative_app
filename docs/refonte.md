# Suivi de la refonte Onílé

Un compte rendu par lot, du plus récent au plus ancien. Référence : cahier des charges Onílé v2.0, section 13.

## Lot 7 — Notifications et accueil (15 octobre 2026)

**Statut : livré ; logique vérifiée par tests, notifications réelles à vérifier sur l'APK.** Branche `refonte/lot-7-notifications`.

- Rappels calculés à partir des données (`domain/rappels.ts`) : loyer J-3, jour J et J+3 à 9 h, fin de contrat
  J-7, alerte électricité (bas / épuisé / déficit, seulement pour les locataires qui achètent du prépayé),
  rappel mensuel de sauvegarde.
- Synchronisation (`repositories/rappelsRepository.ts`, testée) : chaque rappel est programmé une seule fois
  (table `notifications_programmees`), annulé s'il n'a plus lieu d'être (loyer réglé, notifications
  coupées), jamais relancé. Programmation par le système Android (pas de minuteur dans l'app).
- Autorisation demandée au premier lancement ; interrupteur « Notifications » dans Plus.
- Accueil : six actions rapides (encaisser, dépense, vendre des kWh, logement, locataire, impayés), alertes
  d'électricité, loyers du mois.
- Vérifié : 85 tests ; navigation des raccourcis contrôlée dans l'aperçu (le web n'affiche pas de
  notifications : à tester sur le téléphone).

## Lot 6 — Comptabilité simplifiée (15 octobre 2026)

**Statut : livré, vérifié dans l'aperçu web.** Branche `refonte/lot-6-finances`.

- `repositories/financesRepository.ts` (testé) : registre des entrées et sorties ; dépenses numérotées
  DEP-AAAA-NNNNN ; dépense « prévue » hors trésorerie jusqu'à son paiement ; annulation tracée des
  saisies manuelles (les mouvements issus des loyers et de l'électricité se corrigent à leur source).
- Trésorerie = solde de départ (réglable) + entrées validées − sorties validées.
- Caution reçue à l'entrée : entrée distincte des loyers ; caution rendue au départ : sortie tracée,
  plafonnée à la caution reçue.
- Rapport par mois ou par année : entrées, sorties, résultat, loyers facturés / encaissés / impayés
  (affichés comme créance, pas comme argent disponible), cautions, dépenses prévues, par catégorie,
  évolution mensuelle ; export CSV (Excel, séparateur « ; »).
- Onglet Finances (6e onglet).
- Vérifié : 81 tests ; dans l'aperçu, trésorerie 20 025 → −9 975 FCFA après paiement d'une
  dépense prévue de 30 000 FCFA ; vue annuelle et catégories contrôlées.
- Non fait : pièce justificative (photo) d'une dépense — nécessite un module de caméra/galerie.

## Lot 5 — Électricité prépayée (15 octobre 2026)

**Statut : livré, vérifié dans l'aperçu web.** Branche `refonte/lot-5-electricite`.

- `repositories/electriciteRepository.ts` (testé) : vente de kWh au prix du contrat (arrondi à 0,1 kWh
  inférieur, montant facturé recalculé, écart « à rendre » affiché, jamais perdu), facture d'électricité
  numérotée, encaissement en trésorerie, annulation tracée.
- Relevés : consommation = nouvel index − précédent (relevé initial du contrat au départ) ; index inférieur
  refusé, sauf « nouveau compteur » déclaré (consommation 0, nouvelle référence).
- Stock calculé (achetés − consommés), états Suffisant / Bas (< 5 kWh, réglable) / Épuisé / Déficit.
- Écran Électricité (Plus → Électricité prépayée), fiche électricité depuis la fiche locataire, alerte
  sur l'accueil. Facture d'électricité PDF.
- Vérifié : 74 tests ; dans l'aperçu, 5 030 FCFA → 20,1 kWh, 5 025 FCFA facturés, 5 FCFA à rendre ;
  relevé 1 000 → 1 012 = 12 kWh, stock 8,1 kWh ; index 990 refusé.

## Lot 4 — Loyers, paiements, factures et reçus (15 octobre 2026)

**Statut : livré, vérifié dans l'aperçu web.** Branche `refonte/lot-4-loyers`.

### Fait

- `repositories/loyerRepository.ts` (testé) :
  - échéances mensuelles générées automatiquement (à l'ouverture des écrans), sans doublon, montant dû
    figé à la création, date d'échéance jamais avant l'entrée du locataire, arrêt au mois de sortie ;
  - statuts Payée / Partielle / En attente / En retard (dès le lendemain de l'échéance), « Partielle · en
    retard » quand les deux s'appliquent ;
  - paiements (espèces, Mobile Money, virement, autre) affectés aux mois les plus anciens d'abord ;
    trop-perçu conservé en avance puis affecté automatiquement au mois suivant ;
  - annulation d'un paiement avec motif : visible dans l'historique, retiré des règlements et de la
    trésorerie, reçu conservé ;
  - un mouvement de trésorerie par encaissement (préparation du lot 6) ;
  - numérotation FAC-AAAA-NNNNN / REC-AAAA-NNNNN tenue en base, jamais réutilisée.
- Documents PDF (`src/documents`) : reçu (montant reçu, mois réglés, avance, reste à payer) et facture
  (montant dû, déjà réglé, reste, statut), aux couleurs Onílé, textes échappés ; partage par la feuille
  Android (WhatsApp…). Un document annulé porte la mention « ANNULÉ ».
- Écran Loyers (remplace l'ancien onglet Factures) : mois précédent / suivant, synthèse (attendus, réglés,
  reste, encaissé), filtres par statut, détail d'une échéance, encaissement, facture, reçus, annulation.
- Fiche locataire : reste à payer, avance, bouton « Encaisser », historique des paiements (reçu au toucher).
- Accueil : loyers du mois et nombre d'échéances en retard.
- Onglet Plus refait (profil, PIN, verrouillage) ; notifications et sauvegarde annoncées « Lot 7 / Lot 8 ».
- Tout l'ancien code (services, écrans, types, AsyncStorage) est supprimé : il n'en reste plus.

### Vérifications

| Contrôle | Résultat |
| --- | --- |
| `tsc --noEmit` | 0 erreur |
| `jest` | 65 tests sur 65 (dont scénario 15 000 sur 26 000 → partielle, reste 11 000) |
| `expo lint` | 0 problème |
| `expo-doctor` | 21/21 |
| Aperçu web | paiement partiel, reçu et facture affichés et contrôlés visuellement |

### Limites connues

- Le motif d'annulation d'un paiement est fixé à « Erreur de saisie » depuis l'écran (saisie libre à venir).
- Les échéances sont créées à l'ouverture de l'app : un mois non ouvert est créé au montant du contrat
  en vigueur au moment de l'ouverture.
- Partage PDF vérifié dans l'aperçu web (affichage) ; la feuille de partage Android reste à tester sur l'APK.

## Lot 3 — Logements, locataires et contrats (15 octobre 2026)

**Statut : livré, vérifié dans l'aperçu web.** Branche `refonte/lot-3-logements-locataires`.

### Fait

- Couche métier testée : `repositories/logementRepository.ts` et `repositories/locataireRepository.ts`.
  - Logements : création, modification, référence unique (casse ignorée), montants entiers contrôlés,
    occupation déduite des contrats actifs, retrait = suppression sans historique ou archivage sinon,
    refusé si occupé.
  - Entrée d'un locataire : fiche + contrat en une transaction, refusée si le logement est occupé ou
    archivé (rien n'est écrit en cas d'échec).
  - Conditions du contrat modifiables (les échéances déjà créées ne changent pas — lot 4).
  - Départ : contrat terminé à la date de sortie, logement libéré et réattribuable, historique conservé ;
    un locataire avec historique est archivé, jamais supprimé.
- Écrans refaits au design Onílé (`src/features`) : Accueil (taux d'occupation, logements libres,
  locataires actifs, actions rapides), Logements (recherche, filtres, fiche, ajout/modification/retrait,
  attribution), Locataires (recherche, filtres actifs/partis, fiche, contrat, modification, départ).
- Composants communs (`components/ui/kit.tsx`, `Feuille`, `ChampDate`) : boutons, badges couleur + libellé +
  icône, cartes, champs avec erreurs, états vide / erreur / chargement.
- Les listes relisent la base au retour sur l'écran et affichent une erreur au lieu d'une liste vide.
- Ancien code supprimé : ancien tableau de bord, écrans et modales Logements/Locataires, badges d'onglets
  (qui interrogeaient l'ancien schéma toutes les 30 s).

### Vérifications

| Contrôle | Résultat |
| --- | --- |
| `tsc --noEmit` | 0 erreur |
| `jest` | 48 tests sur 48 |
| Parcours dans l'aperçu web (375 px) | premier lancement → logement (validation, doublon refusé) → entrée locataire → fiche → départ → logement libéré |
| `expo lint` | 2 erreurs restantes, dans l'onglet Factures (lot 4) |

### Reste pour les lots suivants

- Onglet Factures et paramètres « Données » : encore l'ancien code (lots 4 et 8).
- Solde final et caution au départ : lot 4 / 6. Date de fin de contrat : non saisissable pour l'instant.

## Lot 2 — Accès et sécurité (15 octobre 2026)

**Statut : codé, à valider sur téléphone.** Branche `refonte/lot-2-securite` (part du lot 1).

### Fait

- Premier lancement : profil du propriétaire (nom obligatoire, téléphone, adresse) puis création et
  confirmation d'un PIN de 4 à 6 chiffres. Aucun PIN par défaut ; les codes trop simples (1234, 0000,
  654321…) sont refusés.
- PIN salé et haché (SHA-256) dans `expo-secure-store` (Keystore Android), jamais en clair ni dans SQLite.
- PIN demandé à chaque lancement et au retour après 2 minutes en arrière-plan ; bouton « Verrouiller
  l'application » dans Plus.
- Après 5 erreurs : blocage 30 s, puis doublé à chaque nouvel échec (plafond 1 h), conservé même si l'app
  est fermée et rouverte ; compte à rebours affiché.
- Modification du PIN fonctionnelle (vérification de l'ancien code, même limitation des essais).
- Profil propriétaire enregistré dans la nouvelle base (`repositories/proprietaireRepository.ts`) : la
  modification du profil dans Plus fonctionne, et les PDF reprennent ce profil.
- Base chiffrée par SQLCipher (`useSQLCipher`) avec une clé aléatoire de 256 bits gardée dans le Keystore.
  La base non chiffrée d'un APK du lot 1 est convertie automatiquement (`sqlcipher_export`), pas effacée.

### Correction d'un défaut du lot 1

Les transactions utilisaient `withExclusiveTransactionAsync`, qui ouvre une seconde connexion SQLite sans
`PRAGMA foreign_keys` (et, désormais, sans la clé de chiffrement). Remplacé par `src/db/serialized.ts` :
transactions sur la connexion principale, autres requêtes mises en file d'attente. Testé (concurrence,
annulation, clés étrangères dans une transaction).

### Vérifications

| Contrôle | Résultat |
| --- | --- |
| `tsc --noEmit` | 0 erreur |
| `jest` | 34 tests sur 34 (PIN, blocage, verrouillage auto, profil, transactions, schéma) |
| `expo-doctor` | 21/21 |
| `expo prebuild` | `expo.sqlite.useSQLCipher=true` présent dans la configuration Android |
| `expo export --platform android` | bundle produit |
| `expo lint` | 4 erreurs restantes (formulaires des lots 3 et 4), 0 dans le code du lot 2 |
| Test sur téléphone | **non fait** |

### À vérifier sur le téléphone

- Le chiffrement n'est prouvé que sur un vrai APK : ouvrir l'app, créer des données, la fermer, la rouvrir.
- Si un APK du lot 1 était installé, vérifier que l'app démarre sans erreur après la mise à jour.
- Désinstaller l'app efface la clé : la base devient illisible. Les sauvegardes (lot 8) sont donc essentielles.

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
