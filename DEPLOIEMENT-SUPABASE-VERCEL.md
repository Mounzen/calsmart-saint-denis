# LOGÏA — Déploiement Supabase + Vercel

Ce document décrit la remise en ligne de LOGÏA (ex-CAL Smart) sur la stack
zéro-coût Supabase + Vercel, à l'identique de Habitat Dispatch / Planning
Congés / Mairie Mobilité.

## Ce qui a changé par rapport à la version Railway/SQLite

- **Persistance** : la table `kv` SQLite est remplacée par une table Postgres
  `logivia_kv` dans Supabase. Le code applicatif (`server/index.js`, ~100
  routes) n'a pas été réécrit — seule la couche `server/db.js` a changé.
- **Sessions** (agents + portail candidat) : stockées dans Supabase
  (`logivia_ephemeral`) au lieu de `Map()` en mémoire — obligatoire en
  serverless, où deux requêtes successives peuvent atterrir sur des
  instances différentes.
- **FranceConnect** : le state/nonce OAuth et l'id_token de déconnexion sont
  persistés de la même façon.
- **Pièces justificatives** (upload candidat) : stockées dans Supabase
  Storage (bucket `logivia-pieces`) au lieu du disque local.
- **Rapports mensuels** : stockés dans `logivia_kv` (clé virtuelle
  `rapports/AAAA-MM.json`) au lieu du disque local.
- **Génération de courrier .docx** : le script Python était appelé via
  `spawn('python3', ...)`, impossible en Node serverless. Il est maintenant
  déployé comme sa propre fonction serverless Python (`api/generate-docx.py`,
  supporté nativement par Vercel), appelée en HTTP interne.
- **Telegram** : le module lisait auparavant ses propres fichiers JSON locaux
  (jamais resynchronisés avec la vraie base après le passage à SQLite —
  un bug déjà présent avant cette migration). Il passe maintenant par la
  même couche Supabase que le reste de l'app.

## Limitation connue : temps réel (SSE)

Le tableau de bord utilise des Server-Sent Events pour la présence en ligne
et les notifications live. En serverless, chaque requête peut atterrir sur
une instance différente : la diffusion en temps réel ne se propage donc
qu'aux clients connectés à la même instance "chaude", et Vercel limite la
durée d'une fonction (30s configuré ici). **L'application reste pleinement
fonctionnelle** — toutes les données se rechargent normalement via les
routes REST — seule la notification instantanée est dégradée. Migration
recommandée en phase 2 : Supabase Realtime (canaux Postgres) à la place.

## Étapes de déploiement

### 1. Base de données Supabase

Vous pouvez réutiliser le projet Supabase existant (`lypeksjzahbrbjhnvmsy`,
déjà utilisé par Habitat Dispatch etc.) — les tables sont préfixées
`logivia_` pour éviter toute collision — ou créer un projet dédié.

Dans l'éditeur SQL de Supabase, exécutez `supabase/schema.sql` (crée les
tables `logivia_kv` et `logivia_ephemeral`).

### 2. Storage : bucket pour les pièces justificatives

Dashboard Supabase → Storage → New bucket :
- Nom : `logivia-pieces`
- Public : **Non** (privé — accédé uniquement via la clé service_role)

### 3. Variables d'environnement (Vercel → Project Settings → Environment Variables)

| Variable | Requis | Description |
|---|---|---|
| `SUPABASE_URL` | Oui | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | Clé service_role (jamais exposée au frontend) |
| `BOT_TOKEN` | Pour Telegram | **Nouveau token** — voir sécurité ci-dessous |
| `BOT_USERNAME` | Pour Telegram | Nom d'utilisateur du bot (sans @) |
| `CRON_SECRET` | Pour les cron jobs | Secret partagé pour `/api/rgpd/cron-purge` et `/api/rapports/cron` |
| `DOCX_SERVICE_SECRET` | Recommandé | Secret partagé entre `api/index.js` et `api/generate-docx.py` |
| `ANTHROPIC_API_KEY` | Optionnel | Fallback LLM de l'assistant conversationnel |
| `FC_CLIENT_ID` / `FC_CLIENT_SECRET` / `FC_REDIRECT_URI` / `FC_LOGOUT_REDIRECT` | Optionnel | FranceConnect (désactivé si absent) |

### 4. Déploiement

```bash
# Depuis le dossier du projet
git init && git add -A && git commit -m "Migration Supabase/Vercel"
git remote add origin <votre-repo>
git push -u origin main
```

Puis importer le repo dans Vercel (ou `vercel --prod` en CLI). Le
`vercel.json` fourni configure automatiquement le build Vite, la fonction
API Express (`api/index.js`) et la fonction Python de génération docx
(`api/generate-docx.py`).

### 5. Migration des données existantes (optionnel)

Si vous voulez repartir des données de démo déjà présentes dans
`server/data/*.json` :

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.mjs
```

Sinon, la première connexion au serveur importera automatiquement ces
mêmes fichiers si la table `logivia_kv` est vide (voir `openDatabase()`
dans `server/db.js`).

## À faire avant toute démonstration externe

1. **Rotation du token Telegram** : l'ancien token était écrit en dur dans
   le code source (`server/telegram.js`). Il a été retiré du code, mais le
   token existant doit être considéré comme compromis — régénérez-en un
   nouveau via [@BotFather](https://t.me/BotFather) et renseignez-le
   uniquement dans `BOT_TOKEN` sur Vercel.
2. **Mots de passe de démo** : `server/data/users.json` contient des
   identifiants de démonstration en clair (`admin` / `calsmart2024`, etc.).
   Convient pour une démo interne, mais à changer avant tout usage réel —
   idéalement en migrant vers des mots de passe hashés (bcrypt) côté
   `/api/auth/login`.
3. Vérifiez que le bucket `logivia-pieces` est bien **privé**.

## Ce qui n'a pas été touché (fonctionne à l'identique)

Les ~100 routes métier (demandeurs, logements, commissions CAL, matching,
scoring, audiences, portail candidat, RGPD, statistiques, assistant IA,
export CSV, etc.) n'ont subi aucun changement de logique — uniquement
l'ajout d'`async`/`await` autour des appels de données, désormais
asynchrones (Supabase) au lieu de synchrones (SQLite).
