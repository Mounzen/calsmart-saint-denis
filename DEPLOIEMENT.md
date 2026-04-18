# Deploiement Logivia - Guide complet

**Objectif :** remplacer la version CALSmart actuellement en ligne sur Railway
par la nouvelle version **Logivia v3.1** sans perdre un seul dossier, sans
rupture de service, et avec possibilite de revenir en arriere (rollback) en
moins de 5 minutes.

Ce guide couvre aussi la configuration de la persistance (volume Railway),
l'activation du bot Telegram `@CALSmartSaintDenis_bot` en production, et la
validation post-deploiement.

---

## Vue d'ensemble

Le deploiement se fait en **7 etapes**, dans cet ordre :

1. Ajouter un volume persistant sur Railway.
2. Declarer les variables d'environnement (`DATA_DIR`, `APP_URL`, `BOT_TOKEN`).
3. Pousser le code sur une branche `staging` et laisser Railway la deployer
   dans un environnement de preview.
4. Valider sur staging (tests fonctionnels + tests Telegram).
5. Merger `staging` vers `main` pour promouvoir en production.
6. Configurer le webhook Telegram depuis l'interface Logivia.
7. Plan de rollback en cas de probleme.

Entre chaque etape, **ne fusionnez jamais vers `main`** tant que la precedente
n'est pas terminee. Railway redeploie automatiquement `main`, c'est irreversible
sans rollback manuel.

---

## 1. Volume persistant Railway

Sans volume, les fichiers JSON (`server/data/*.json`) sont detruits a chaque
deploiement. C'est la cause principale des pertes de donnees observees sur
l'ancienne version CALSmart.

**Etapes dans l'interface Railway :**

1. Ouvrir le projet Railway contenant l'app.
2. Cliquer sur le service Node (Logivia).
3. Onglet **Settings** > section **Volumes** > bouton **+ New Volume**.
4. **Mount path :** `/data`
5. **Size :** 1 Go suffit largement (les JSON pesent < 10 Mo).
6. Cliquer **Add Volume**. Railway redemarre le service automatiquement.

> Le code est deja pret : au premier boot avec `DATA_DIR=/data`, Logivia copie
> les fichiers `server/data/*.json` livres dans l'image vers le volume s'ils
> n'existent pas encore, puis ecrit ensuite uniquement dans le volume. Les
> boots suivants ne reecrasent rien.

---

## 2. Variables d'environnement

Toujours dans **Settings > Variables** du service Railway, ajouter :

| Variable    | Valeur                                           | Role |
|-------------|--------------------------------------------------|------|
| `DATA_DIR`  | `/data`                                          | Chemin du volume persistant (obligatoire). |
| `APP_URL`   | `https://votre-domaine.up.railway.app`           | URL publique de l'app. Utilisee pour generer les liens Telegram et configurer le webhook. |
| `BOT_TOKEN` | Le vrai token fourni par `@BotFather`            | Token du bot `@CALSmartSaintDenis_bot`. Si absent, un fallback code (dev) est utilise. **Toujours definir en prod.** |
| `NODE_ENV`  | `production`                                     | Active le service des fichiers statiques `dist/` (build Vite) par Express. |
| `PORT`      | (laisser Railway le fixer)                       | Railway injecte automatiquement. |

Apres sauvegarde, Railway redemarre.

---

## 3. Branche `staging` et preview deploy

L'idee est de ne jamais pousser directement sur `main` : on teste d'abord sur
une branche `staging` deployee en environnement Railway de preview.

**Cote local :**

```bash
# depuis la racine du repo
git checkout -b staging
git add .
git commit -m "Logivia v3.1 - SSE, pieces, kanban, IA, persistance DATA_DIR"
git push -u origin staging
```

**Cote Railway :**

1. Ouvrir le projet Railway.
2. Onglet **Settings > Environments > + New Environment**.
3. Nommer cet environnement `staging`.
4. Cloner les variables d'environnement depuis `production` en changeant
   `APP_URL` pour pointer sur le domaine de preview que Railway va attribuer
   (par defaut `logivia-staging.up.railway.app`).
5. Choisir la branche `staging` comme source.
6. Declencher le deploiement.

> Le volume de staging est **distinct** de celui de prod : les donnees de
> test n'impactent pas la prod.

---

## 4. Validation sur staging

Une fois staging en ligne :

**Tests a executer manuellement :**

- [ ] Login `admin` / `calsmart2024` (ou identifiants actuels).
- [ ] Creer un demandeur de test, rafraichir la page : il doit persister.
- [ ] Redemarrer le service Railway depuis l'interface : les donnees sont encore la.
- [ ] Ouvrir `/api/ping` dans le navigateur : `data_dir_mode` doit etre `volume`.
- [ ] Ouvrir l'application dans deux onglets, verifier que la barre de
  presence en haut a droite montre les deux sessions.
- [ ] Aller dans **Notifications Telegram > Configuration & test**, coller
  un `chat_id` obtenu via `/start` sur le bot, cliquer
  **Envoyer le message de test** : le telephone doit recevoir le message.
- [ ] Sur la meme page, cliquer **Voir l'etat actuel** du webhook : s'il est
  vide, c'est normal tant que l'etape 6 n'est pas faite.
- [ ] Tester le drag-and-drop sur le kanban.
- [ ] Tester un upload de piece justificative (detection auto de type).
- [ ] Tester la generation du PV CAL en PDF.

**Tests serveur (si acces SSH) :**

```bash
# Confirmer que DATA_DIR est bien utilise
curl https://logivia-staging.up.railway.app/api/ping
# {"version":"3.1","data_dir_mode":"volume",...}
```

Si tout est vert, passer a l'etape 5. Sinon, corriger sur staging, repousser,
repeter.

---

## 5. Promotion vers la production

Avant de merger, **faire un backup du volume de prod** (au cas ou) :

- Depuis l'interface Railway, ouvrir le service prod actuel (CALSmart).
- Onglet **Volumes > Backup > Create snapshot**. Garder ce snapshot au moins
  2 semaines.

Puis :

```bash
# en local
git checkout main
git merge staging --no-ff -m "Logivia v3.1 - promotion prod"
git push origin main
```

Railway redeploie `main` automatiquement. **Attention** : le premier boot va
auto-seeder les JSON livres dans le code si les fichiers n'existent pas sur le
volume. Si votre volume prod actuel contenait deja des fichiers, ils ne seront
**pas** ecrases.

> Si le service de prod actuel n'a pas encore de volume, creer le volume
> AVANT le merge (etape 1). Sinon, au premier boot, tous les dossiers
> existants seront perdus.

---

## 6. Activer le webhook Telegram en production

Cette etape ne peut se faire qu'**apres** avoir un URL public stable en prod.

**Depuis Logivia (directeur) :**

1. Se connecter en tant que directeur.
2. Aller dans **Notifications Telegram > Configuration & test**.
3. Cliquer **Configurer le webhook Telegram**.
4. Coller l'URL publique de prod (ex. `https://logivia.ville-saintdenis.fr`).
5. Confirmer. Un message confirme que Telegram accepte le webhook.
6. Cliquer **Voir l'etat actuel** pour verifier que l'URL est bien enregistree
   cote Telegram.

> A partir de ce moment, chaque message envoye au bot `@CALSmartSaintDenis_bot`
> est traite par le serveur Logivia en prod (commandes `/start`, liens de
> connexion elus, etc.).

Si le webhook pointe encore vers l'ancienne URL de CALSmart, le reconfigurer
avec la nouvelle URL Logivia efface l'ancien enregistrement cote Telegram.

---

## 7. Rollback en cas de probleme

Deux niveaux de rollback sont possibles.

**Rollback code (le plus courant, < 2 minutes) :**

```bash
# en local
git checkout main
git revert -m 1 <hash-du-merge-v3.1>
git push origin main
```

Railway redeploie automatiquement la version precedente.

**Rollback donnees (si un JSON a ete corrompu) :**

1. Ouvrir Railway > service prod > onglet **Volumes**.
2. Selectionner le snapshot cree a l'etape 5.
3. Cliquer **Restore**. Le service redemarre avec l'etat des donnees a ce
   moment.

> Les snapshots de volume se font a chaud, sans interruption de service, mais
> la restoration necessite un redemarrage (< 30 s).

---

## Annexe A : Checklist pre-deploiement express

- [ ] Volume Railway cree avec mount path `/data`.
- [ ] `DATA_DIR=/data` configure.
- [ ] `APP_URL` pointe vers l'URL publique.
- [ ] `BOT_TOKEN` est le vrai token (pas le fallback dev).
- [ ] `NODE_ENV=production`.
- [ ] Branche `staging` poussee et deployee en preview.
- [ ] Tests staging OK (presence, Telegram, kanban, pieces, PV).
- [ ] Snapshot volume prod realise.
- [ ] Merge `staging` > `main`.
- [ ] Webhook Telegram reconfigure avec nouvelle URL.

## Annexe B : Endpoints utiles au debug

| URL                                 | Role |
|-------------------------------------|------|
| `GET /api/ping`                     | Version + mode data (volume / ephemere). |
| `GET /api/telegram/webhook-info`    | Etat du webhook vu par Telegram (directeur). |
| `POST /api/telegram/setup-webhook`  | Configurer le webhook. |
| `POST /api/telegram/test-direct`    | Envoi de message de test a un chat_id. |
| `GET /api/events`                   | Flux SSE temps reel (presence, notifications). |

## Annexe C : Variables d'environnement detaillees

Toutes facultatives, mais **toutes recommandees en prod** :

```bash
# Obligatoire pour persistance
DATA_DIR=/data

# URL publique, utilisee pour les liens Telegram et le webhook
APP_URL=https://logivia.ville-saintdenis.fr

# Token Telegram (fourni par @BotFather)
BOT_TOKEN=xxxxxxxx:yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

# Mode prod (Express sert les fichiers dist/)
NODE_ENV=production

# Port (Railway l'injecte automatiquement)
PORT=4000
```

---

**En cas de blocage :**

- Verifier les logs Railway (onglet **Deployments > Logs**).
- L'endpoint `/api/ping` repond toujours, meme si la base de donnees est
  cassee : si `/api/ping` renvoie 200 et `data_dir_mode:"volume"`, le serveur
  et le volume sont OK, le probleme est ailleurs (auth, frontend).
- En dernier recours, contacter le responsable projet et utiliser le snapshot
  de volume pour revenir a l'etat d'avant deploiement.
