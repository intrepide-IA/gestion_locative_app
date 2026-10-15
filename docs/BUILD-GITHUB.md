# Construire l'APK gratuitement avec GitHub Actions

Pourquoi : le plan gratuit d'Expo limite le nombre de builds par mois. GitHub Actions construit l'APK
gratuitement, le met dans une **release GitHub** (lien permanent) et le publie sur le site.

**Point essentiel** : l'APK doit être signé avec **la même clé** que les versions déjà installées
(clé gardée par Expo). Sinon Android refuse la mise à jour : il faudrait désinstaller l'application,
ce qui efface ses données. On récupère donc cette clé une seule fois.

## 1. Télécharger la clé depuis Expo (une seule fois, ~2 minutes)

Dans le terminal de VS Code, à la racine du projet :

```powershell
npx eas-cli@latest credentials -p android
```

Réponds aux questions avec les flèches et Entrée :
1. *Which build profile do you want to configure?* → **preview**
2. Menu → **credentials.json: Upload/Download credentials between EAS servers and your local json**
3. → **Download credentials from EAS to credentials.json**
4. Quitte le menu (**Go back** puis **Exit**).

Deux fichiers apparaissent : `credentials.json` et `android/keystores/…`. Ils sont ignorés par Git :
**ne les envoie jamais sur GitHub ni par message**. Garde une copie de ces deux fichiers en lieu sûr
(clé USB, Drive privé).

## 2. Préparer les secrets

```powershell
node scripts/preparer-cle-github.mjs
```

Le script écrit `secrets-github.txt` avec 4 valeurs.

## 3. Les créer sur GitHub

Dépôt `gestion_locative_app` → **Settings → Secrets and variables → Actions → New repository secret**.
Crée un secret pour chaque bloc de `secrets-github.txt` (nom = titre du bloc, valeur = ligne en dessous) :

| Nom | Contenu |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | la très longue ligne |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du keystore |
| `ANDROID_KEY_ALIAS` | alias de la clé |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé |

Ajoute aussi (facultatif, mêmes valeurs que dans Render / Supabase) :

| Nom | Rôle |
| --- | --- |
| `ONILE_API_URL` | `https://onile-api.onrender.com` : publication automatique sur le site |
| `ADMIN_TOKEN` | jeton `ADMIN_TOKEN` de Render |
| `EXPO_PUBLIC_API_URL` | `https://onile-api.onrender.com` : alerte « Nouvelle version » dans l'app |
| `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase : active la synchronisation |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | clé `anon public` de Supabase |

Puis **supprime `secrets-github.txt`** de ton PC.

## 4. Lancer un build

GitHub → onglet **Actions** → **APK Android** → **Run workflow** (branche `main`), écris les notes de
version, puis **Run workflow**. Compte 15 à 25 minutes.

À la fin :
- une release **vX.Y.Z** contient `onile-X.Y.Z.apk` (onglet *Releases* du dépôt) ;
- si `ONILE_API_URL` et `ADMIN_TOKEN` existent, la version est publiée : le bouton « Télécharger » du site
  et l'alerte de mise à jour de l'application pointent vers elle.

Le workflow construit la branche choisie : fusionne d'abord tes changements dans `main`.
Avant chaque nouvelle version, augmenter `version` / `versionCode` (`app.json`), `version`
(`package.json`) et `APP_VERSION` / `APP_VERSION_CODE` (`src/constants/index.ts`).
