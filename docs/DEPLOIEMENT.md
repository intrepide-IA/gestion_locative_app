# Mise en ligne d'Onílé : Supabase, Render, Vercel

Tout est prêt dans le dépôt. Il reste à créer les trois projets (gratuits) et à coller les variables.
Compte environ 20 minutes. Fais les étapes dans l'ordre : chacune donne une valeur à l'étape suivante.

| Service | Rôle | Dossier / fichier |
| --- | --- | --- |
| **Supabase** | Comptes des utilisateurs, sauvegardes chiffrées, liste des versions | `supabase/migrations/20261015000000_onile.sql` |
| **Render** | API : dernière version, lien `/telecharger`, publication | `server/`, `render.yaml` |
| **Vercel** | Site vitrine (landing page) | `landing/`, `landing/vercel.json` |
| **GitHub Releases** | Fichier APK (≈ 60 Mo, trop gros pour Vercel et Supabase gratuits) | `scripts/publier-version.mjs` |

## Comment ça marche

- Chaque propriétaire crée **son compte** (e-mail + mot de passe) dans l'application :
  Paramètres → **Synchronisation (compte)**. Supabase sait ainsi à qui appartient chaque sauvegarde.
- « Synchroniser maintenant » **chiffre toute la base sur le téléphone**, puis l'envoie dans son compte.
  Ni Supabase ni toi ne pouvez lire ces données. Chaque utilisateur ne voit que les siennes (règles RLS).
- Sur un nouveau téléphone : se connecter au même compte → **Récupérer** → mot de passe de chiffrement.
- Les 20 dernières synchronisations de chaque compte sont gardées.
- La vue `synchronisations_par_utilisateur` (Supabase → Table editor) te montre qui synchronise et quand,
  sans le contenu.

## 1. Supabase

1. <https://supabase.com> → **New project** (région : `eu-west` ou la plus proche). Note le mot de passe de la base.
2. **SQL Editor** → New query → colle tout le fichier `supabase/migrations/20261015000000_onile.sql` → **Run**.
3. **Authentication → Providers → Email** : activé (par défaut). Si tu ne veux pas d'e-mail de confirmation,
   décoche « Confirm email ».
4. **Project Settings → API** : note
   - `Project URL` → **SUPABASE_URL**
   - `anon public` → **SUPABASE_ANON_KEY**
   - `service_role` → **SUPABASE_SERVICE_ROLE_KEY** (secrète : seulement dans Render).

## 2. Render (API)

1. <https://render.com> → **New → Blueprint** → choisis le dépôt GitHub `gestion_locative_app`.
   Render lit `render.yaml` et crée le service `onile-api`.
2. Renseigne les variables demandées :
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (étape 1)
   - `ORIGINES_AUTORISEES` : l'adresse du site Vercel (étape 3), ex. `https://onile.vercel.app`
   - `ADMIN_TOKEN` est généré automatiquement : copie-le (sert à publier les versions).
3. Une fois déployé, ouvre `https://onile-api.onrender.com/api/sante` → `{"ok":true}`.
   Note l'adresse exacte → **API_URL**.

> Offre gratuite Render : le service s'endort après 15 min sans visite ; la première requête prend ~30 s.
> Cela ne gêne que le lien de téléchargement et l'alerte de mise à jour, jamais l'application.

## 3. Vercel (site)

1. <https://vercel.com> → **Add New → Project** → importe le dépôt.
2. **Root Directory** : `landing`. Framework : **Other**. Pas de commande de build.
3. Si l'adresse Render n'est pas `https://onile-api.onrender.com`, corrige-la dans `landing/vercel.json`
   (redirection `/telecharger`), puis commit.
4. Le bouton « Télécharger » du site pointe vers `/telecharger` → Render → dernière APK publiée.

## 4. Variables de l'application (build EAS)

Dans un terminal, à la racine du projet :

```bash
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co"
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
npx eas-cli@latest env:create --environment preview --visibility plaintext --name EXPO_PUBLIC_API_URL --value "https://onile-api.onrender.com"
```

Puis construire : `npx eas-cli@latest build --platform android --profile preview`.
Sans ces variables, l'application fonctionne normalement ; seul l'écran Synchronisation indique
« Pas encore disponible ».

## 5. Publier une version

Après chaque build EAS terminé (lien `https://expo.dev/artifacts/...apk`), dans le terminal **PowerShell**
de VS Code (attention : `set X=...` ne marche pas dans PowerShell) :

```powershell
$env:ONILE_API_URL = "https://onile-api.onrender.com"
$env:ADMIN_TOKEN = "le-jeton-de-render"
node scripts/publier-version.mjs "https://expo.dev/artifacts/eas/....apk" "Nouveautés de la version"
```

Pour ne pas retaper les variables, crée un fichier `.env.publication` à la racine (ignoré par Git) :

```
ONILE_API_URL=https://onile-api.onrender.com
ADMIN_TOKEN=le-jeton-de-render
```

Hébergement de l'APK (au choix) :
- **GitHub Releases** (conseillé, lien permanent) : installer GitHub CLI une fois
  (`winget install GitHub.cli` puis `gh auth login`), ou ajouter `GITHUB_TOKEN=...` dans `.env.publication`.
- **Lien Expo direct** (immédiat, sans GitHub) : ajouter `--lien-direct` à la commande. Expo peut faire
  expirer ses liens : republier alors via GitHub.

Le script crée la release GitHub `vX.Y.Z` avec l'APK, puis l'enregistre dans Supabase via l'API.
Effets : le lien `/telecharger` du site sert la nouvelle APK, et les téléphones qui ont une version plus
ancienne voient « Nouvelle version disponible » dans Paramètres.

Avant chaque nouveau build, augmenter `version` et `versionCode` dans `app.json`, `version` dans
`package.json`, et `APP_VERSION` / `APP_VERSION_CODE` dans `src/constants/index.ts`.

## Vérifications rapides

- `GET {API_URL}/api/version` → la dernière version publiée.
- `GET {API_URL}/telecharger` → redirection vers l'APK.
- Dans l'application : Paramètres → Synchronisation → créer un compte → Synchroniser maintenant →
  la ligne apparaît dans Supabase (table `sauvegardes`, colonne `donnees` illisible : c'est normal).

## 6. Espace d'administration et lettre d'information

Adresse : `https://<ton-site>.vercel.app/admin` (non indexée par les moteurs de recherche).

1. **Supabase → SQL Editor** : coller et exécuter `supabase/migrations/20261016000000_admin.sql`
   (tables des téléchargements, des abonnés et des envois, fonction des statistiques).
2. **Ton compte administrateur** : un compte Supabase avec l'e-mail `imdadadenon@gmail.com`. Crée-le depuis
   l'application (Paramètres → Synchronisation → Créer mon compte) ou dans Supabase → Authentication → Add user.
3. **Render → onile-api → Environment** : ajouter `ADMIN_EMAILS` = `imdadadenon@gmail.com`
   (plusieurs e-mails : séparés par des virgules).
4. **Envoi de la lettre (Brevo, gratuit jusqu'à 300 e-mails/jour)** :
   - créer un compte sur brevo.com, valider une adresse d'expéditeur (Senders) ;
   - SMTP & API → API Keys → créer une clé ;
   - dans Render : `BREVO_API_KEY` = la clé, `EXPEDITEUR_EMAIL` = l'adresse validée, `EXPEDITEUR_NOM` = `Onílé`.

Le tableau de bord montre : téléchargements (site, lien, application), comptes créés, comptes actifs,
synchronisations, abonnés, courbe sur 30 jours, versions téléchargées. La lettre peut d'abord être envoyée en
test à ta propre adresse ; chaque e-mail contient un lien de désinscription.
