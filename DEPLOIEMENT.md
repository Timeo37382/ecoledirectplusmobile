# Déploiement — version mobile auto-hébergée

Cette version modifiée supprime la dépendance obligatoire à l'extension
EDP Unblock, pour pouvoir être utilisée sur iPhone comme sur Android.

## Pourquoi deux modes

EcoleDirecte renvoie un cookie `GTK` sur `login.awp?gtk=1` et exige ensuite sa
valeur à la fois dans le cookie et dans l'en-tête `X-GTK`. Un navigateur
interdit à du JavaScript de relire un `Set-Cookie` en cross-origin : c'est la
seule et unique raison d'être de l'extension.

Le front choisit donc son transport à l'exécution (`src/utils/api.js`) :

| Mode | Quand | Sortie réseau |
|---|---|---|
| **direct** | APK Android (coquille Tauri), ou desktop avec l'extension | IP de l'utilisateur |
| **proxy** | iOS, et tout navigateur sans extension | IP du proxy |

La détection se fait sur `window.__EDP_APP__` / `window.__TAURI__` (présents dès
l'injection dans l'APK), sur la classe `edp-unblock` posée sur le document, et
sur le message `EDP_UNBLOCK`.

**Conséquence pratique :** seuls les utilisateurs iPhone passent par l'IP
commune. Les Android qui installent l'APK et les desktops avec l'extension
sortent par leur propre IP. C'est ce qui limite le risque de blocage côté
EcoleDirecte.

## 1. Le front

```bash
npm install
npm run build          # produit dist/
```

Servir `dist/` sur ton domaine. Le `_redirects` de `public/` gère déjà le
fallback SPA sur Netlify ; sur un autre hébergeur, rediriger toutes les routes
inconnues vers `index.html`.

## 2. Le proxy

Il doit être servi **sur le même domaine que le front**, sous `/edp-api/`.
Même origine = aucun CORS à configurer.

Trois implémentations équivalentes sont fournies, choisis selon l'hébergeur :

| Fichier | Pour |
|---|---|
| `api/proxy.js` + `vercel.json` | **Vercel** |
| `worker/edp-proxy.js` + `worker/wrangler.toml` | Cloudflare Workers |
| `server/proxy_server.js` | VPS (Node/Express) |

Dans les trois cas, la requête de login déclenche l'aller-retour GTK
**entièrement côté serveur**, en un seul appel client. Le proxy est donc sans
état — ni session, ni base, ni stockage.

### Vercel (configuré par défaut)

Rien à faire de particulier : `vercel.json` est déjà écrit. Tu importes le
dépôt, Vercel détecte Vite, construit `dist/` et déploie `api/proxy.js` comme
fonction.

Deux points que `vercel.json` règle déjà, et qui cassent sinon :

- **La région.** Par défaut Vercel exécute les fonctions à Washington (`iad1`).
  Tes requêtes vers EcoleDirecte partiraient donc des États-Unis — latence
  inutile, et une origine géographique incohérente pour un service scolaire
  français. Le fichier force `cdg1` (Paris). Une seule région est autorisée sur
  le plan gratuit, c'est suffisant.
- **Le fallback SPA.** `public/_redirects` est spécifique à Netlify et Vercel
  l'ignore : sans la règle de réécriture, un rechargement sur
  `/app/0/dashboard` renverrait un 404. `vercel.json` renvoie toute route
  inconnue vers `index.html`, en excluant les routes d'API.

Le front appelle `/edp-api/...` ; `vercel.json` réécrit vers
`/api/proxy?edpPath=...` en conservant les paramètres d'origine. Tu n'as donc
rien à changer côté front si tu migres d'hébergeur plus tard.

Le plan Hobby est réservé à un usage non commercial — ce qui est le cas ici.

### Cloudflare Workers

```bash
npm install -g wrangler
wrangler login
cd worker
# éditer wrangler.toml : remplacer TON-DOMAINE.fr
wrangler deploy
```

Le front va sur Cloudflare Pages, le worker prend la route `/edp-api/*` du même
domaine.

### VPS (Node/Express)

```bash
npm install express
node server/proxy_server.js     # écoute sur 127.0.0.1:3001
```

Puis router `/edp-api/` vers ce port depuis nginx/Caddy, sur le même domaine.

> ⚠️ Le proxy voit passer les identifiants EcoleDirecte en clair, le temps du
> relai. Aucun log n'y est monté volontairement (l'ancienne version utilisait
> `morgan`, qui journalisait les URLs de chaque utilisateur). **Ne pas ajouter
> de logger.** Préviens les gens à qui tu donnes l'accès : c'est leur compte
> scolaire qui transite par ta machine.

## 3. L'APK Android (optionnel mais recommandé)

Évite l'IP partagée pour ceux qui l'installent. Se construit depuis Windows,
aucun Mac nécessaire.

Prérequis : Android SDK + NDK, JDK 17, Rust.

```bash
npm install
npx tauri android init      # si gen/android doit être régénéré
npx tauri android build --apk
```

L'APK est une simple coquille qui charge ton domaine et remplace `window.fetch`
par le client HTTP natif — c'est ce qui rend le mode direct possible.

Les URLs à ajuster (`TON-DOMAINE.fr` en dur pour l'instant) :

- `src-tauri/tauri.conf.json` → `devUrl` et `frontendDist`
- `src-tauri/src/lib.rs` → `app_url`

## 4. Installation côté utilisateurs

- **iPhone** : ouvrir le site dans Safari → Partager → « Sur l'écran d'accueil ».
  Safari uniquement, les autres navigateurs iOS ne savent pas installer de PWA.
- **Android** : installer l'APK, ou à défaut « Ajouter à l'écran d'accueil »
  depuis Chrome (auquel cas le mode proxy s'applique).

## À faire avant la mise en ligne

- Remplacer `TON-DOMAINE.fr` dans `src-tauri/tauri.conf.json` et
  `src-tauri/src/lib.rs` (nécessaire seulement pour l'APK Android), et dans
  `worker/wrangler.toml` si tu pars sur Cloudflare. **Rien à remplacer pour
  Vercel** : la configuration ne code aucun domaine en dur.
- Les webhooks Discord dans `src/App.jsx` (`carpeConviviale`, `sardineInsolente`,
  `thonFrustre`) pointent vers des placeholders : les remplacer ou neutraliser
  les envois de feedback.
- `index.html` contient encore les métadonnées Open Graph d'`ecole-directe.plus`.
