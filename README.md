# GestiLoc - Gestion Locative Offline

Application web de gestion locative 100% locale (offline) pour propriétaire individuel.

## Installation

```bash
npm install
npm run dev
```

Ouvrez http://localhost:5173 dans votre navigateur.

## Test sur téléphone

1. **Sur le même réseau Wi-Fi** : Lancez `npm run dev`, puis sur votre téléphone ouvrez `http://[IP_DE_VOTRE_PC]:5173`
2. **Build production** : `npm run build` puis servez le dossier `dist/` (ex: avec `npx serve dist`)
3. **PWA** : L'app peut être ajoutée à l'écran d'accueil sur mobile pour une expérience native

## Code PIN par défaut

`1234` — Modifiable dans Paramètres > Sécurité et PIN

## Fonctionnalités

- **Dashboard** : Stats en temps réel, taux de recouvrement, paiements récents
- **Logements** : CRUD, filtres (tous/occupés/libres)
- **Locataires** : CRUD, paiement loyer, achat électricité, relevé compteur
- **Factures** : Échéances mensuelles, enregistrement paiements, génération PDF
- **Paramètres** : Profil propriétaire, notifications, PIN, export/import JSON

## Export / Import

- **Export** : Paramètres > Données > Exporter (JSON)
- **Import** : Paramètres > Données > Importer (remplace les données)

## Stockage

Données stockées localement dans IndexedDB (navigateur). Aucun serveur requis.
