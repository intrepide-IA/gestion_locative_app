# Rapport final — refonte Onílé (version 1.0.0)

*15 octobre 2026. Détail technique lot par lot : [refonte.md](refonte.md).*

## En bref

Les 10 lots du cahier des charges sont codés, testés, commités et poussés sur GitHub. L'application Onílé 1.0.0
fonctionne de bout en bout dans l'aperçu web : premier lancement, logements, locataires, loyers, reçus et
factures PDF, électricité, finances, rappels, sauvegarde chiffrée. **Le test sur un vrai téléphone reste à
faire** : c'est la seule partie que je ne peux pas réaliser moi-même. L'APK 1.0.0 est construit (lien plus bas).

## Ce dont j'ai besoin de toi

| # | Quoi | Pourquoi |
| --- | --- | --- |
| 1 | **Ton email et ton numéro** pour le site | La landing page affiche une adresse provisoire (celle de Nexa Solution). |
| 2 | **Installer l'APK et tester** sur ton téléphone (liste ci-dessous) | Le partage WhatsApp, les notifications, le chiffrement et l'impression PDF ne se vérifient que sur Android. |
| 3 | **Où publier la landing page** (Netlify, GitHub Pages, Vercel… gratuit) | Je n'ai rien mis en ligne sans ton accord. |
| 4 | **Où héberger l'APK** pour le bouton « Télécharger » (ex. GitHub Releases) | Les liens des builds Expo expirent ; il faut un lien HTTPS stable. |
| 5 | Ton accord pour **fusionner la refonte dans `main`** sur GitHub | Le travail est sur des branches ; `main` contient encore l'ancienne application. |
| 6 | (Facultatif) Le logo officiel en **SVG** | J'ai redessiné le symbole en vectoriel (version « étroite » que tu as validée) ; un fichier du graphiste serait l'idéal. |

## L'APK

- Build réussi : https://expo.dev/accounts/intrepide_ia/projects/onile/builds/d08b9ba5-be47-45b1-9fd0-179dfe41e96f
- Téléchargement direct de l'APK : https://expo.dev/artifacts/eas/wo9FhjUQT1xMBDLMrmbgm0EelBVYemPWwkOX6ui0rCw.apk
- Ouvre ce lien sur ton téléphone, télécharge l'APK, installe-le (autoriser les sources inconnues).
- Pour en refaire un plus tard : `npx eas-cli@latest build --platform android --profile preview`.

**Important avant de saisir tes vraies données** : désinstaller l'application efface la clé de chiffrement de
la base. Fais une sauvegarde (Plus → Sauvegarde et restauration) régulièrement et garde le fichier et son mot
de passe hors du téléphone.

## À tester sur le téléphone (15 minutes)

- [ ] Premier lancement : profil, création du PIN, autorisation des notifications.
- [ ] Fermer et rouvrir l'app : le PIN est redemandé. 5 erreurs : blocage 30 s.
- [ ] Créer 2 logements, un locataire avec caution.
- [ ] Encaisser un paiement partiel, puis **partager le reçu par WhatsApp** (vérifier le PDF reçu).
- [ ] Émettre et partager une facture de loyer.
- [ ] Vendre des kWh, saisir un relevé ; partager la facture d'électricité.
- [ ] Ajouter une dépense ; exporter les opérations en CSV.
- [ ] Plus → Sauvegarde : exporter, puis restaurer le fichier (vérifier que tout revient).
- [ ] Le lendemain d'une échéance non payée : notification de rappel reçue.

## Ce qui a été livré

| Lot | Contenu | Vérification |
| --- | --- | --- |
| 1 Socle | Expo SDK 57, SQLite unique, schéma et migrations | Tests + bundle Android |
| 2 Accès | PIN haché, blocage, verrouillage auto, base chiffrée SQLCipher | Tests + aperçu |
| 3 Logements / locataires | Contrats, entrée, départ, archivage, historique | Tests + aperçu |
| 4 Loyers | Échéances, statuts, paiements partiels, avances, annulations, reçus et factures PDF | Tests + aperçu (PDF contrôlés visuellement) |
| 5 Électricité | Ventes de kWh, relevés, stock, déficit, factures | Tests + aperçu |
| 6 Finances | Trésorerie, dépenses prévues/payées, cautions, rapports, export CSV | Tests + aperçu |
| 7 Rappels | Notifications J-3 / J / J+3, fin de contrat, électricité, sauvegarde ; accueil | Tests (logique) — affichage à voir sur téléphone |
| 8 Sauvegarde | Export chiffré (PBKDF2 + AES-256-GCM), restauration validée et atomique, réinitialisation | Tests + aperçu (export → restauration) |
| 9 Finitions | Motifs d'annulation, date de fin de contrat, corrections d'interface, version 1.0.0 | Aperçu complet |
| 10 Landing | Captures réelles, section Aperçu | Rendu ordinateur et mobile |

Qualité au dernier commit : **100 tests automatisés**, TypeScript 0 erreur, lint 0 problème, `expo-doctor`
21/21, bundle Android produit.

## Limites connues (honnêtement)

- Pas encore testé sur un téléphone réel (partage, notifications, chiffrement, impression).
- Pièce justificative (photo) d'une dépense : non faite (nécessite un module photo).
- Module eau : préparé dans la base (relevés « eau »), sans écran ni calcul tant que la règle de la maison
  n'est pas définie (conforme au cahier des charges).
- Restauration : uniquement des sauvegardes de la même version de données (la v1 actuelle).
- Les échéances se créent à l'ouverture de l'app ; un mois jamais ouvert est créé au montant du contrat
  en vigueur à ce moment-là.

## Branches GitHub

`refonte/lot-1-socle` → … → `refonte/lot-10-landing` (chaque branche contient les précédentes).
La dernière, `refonte/lot-10-landing`, contient tout. Pour la mise en production : la fusionner dans `main`
(je le fais sur ton accord).
