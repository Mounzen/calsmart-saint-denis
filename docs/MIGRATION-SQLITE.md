# Migration JSON → SQLite (Logivia v3.1 → v3.2)

**Date** : 19/04/2026
**Portée** : couche persistance serveur
**Impact frontend** : aucun (API REST identique)
**Durée de déploiement** : ~2 min (le temps que Railway recompile + redémarre)

## Ce qui change

Avant : les données étaient stockées dans 10 fichiers `.json` dans `/data` (Railway volume).
Après : une base SQLite `/data/logivia.db` stocke les mêmes données, avec :

- **Transactions ACID** : plus de corruption possible si Railway coupe en pleine écriture
- **Journal WAL** : lectures concurrentes rapides
- **Sauvegardes automatiques quotidiennes** : 30 jours de rétention dans `/data/backups/`
- **Téléchargement de la base** via endpoint admin (directeur)

**Bonne nouvelle** : les 280 appels à `readData` / `readObj` / `writeData` n'ont pas bougé. Le corps des fonctions a été swappé pour taper dans SQLite sous le capot.

## Fallback automatique

Si SQLite échoue pour une raison quelconque (module natif non compilé, base corrompue, etc.), les helpers retombent automatiquement sur les fichiers `.json`. Le serveur continue de tourner en mode dégradé, et les logs l'indiquent :

```
[readData/SQL] audiences.json: ... — fallback JSON
```

## Migration automatique au premier boot

Au premier démarrage avec la nouvelle version, `openDatabase()` :

1. Crée `/data/logivia.db` (fichier vide ~100 ko)
2. Détecte les `.json` présents dans `/data`
3. Les importe en une seule transaction (atomique)
4. Logue le résultat : `[db] 10 fichier(s) JSON importe(s) depuis /data`

**Les fichiers `.json` restent en place** comme sauvegarde de secours. Vous pouvez les consulter, mais ne sont plus la source de vérité.

## Étapes de déploiement

### 1 — Sur votre PC Windows (PowerShell, dans `CALSmart2`)

```
npm install
```

Ça installe `better-sqlite3@11.3.0` (déjà ajouté au `package.json`). Le package télécharge un binaire précompilé pour Windows — pas besoin de Visual Studio Build Tools.

### 2 — Commit + push

```
git add package.json package-lock.json server/db.js server/index.js docs/MIGRATION-SQLITE.md
git commit -m "feat: migration SQLite (ACID, WAL, backup quotidien, fallback JSON)"
git push
```

### 3 — Railway rebuild automatique

Railway détecte le push, lance `npm install`, télécharge le binaire précompilé Linux x64 de better-sqlite3, redémarre le service. Rien à faire.

### 4 — Vérification post-déploiement

Dans les **logs Railway**, vous devez voir au boot :

```
[db] 10 fichier(s) JSON importe(s) depuis /data
[db] SQLite prete : 10 entree(s), 250 ko

╔══════════════════════════════════════════╗
║  Logivia v3.1 · Ville de Saint-Denis     ║
╚══════════════════════════════════════════╝
  Port          : 8080
  Data          : /data (volume persistant)
  Base SQLite   : /data/logivia.db (10 entrees, 250 ko)
  Backups       : /data/backups (0 sauvegarde(s))
```

Au bout de **10 minutes**, une première sauvegarde automatique :

```
[backup] logivia-2026-04-19.db (256 ko) — rotation : 0 ancien(s) supprime(s)
```

## Endpoints admin (directeur)

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/api/admin/backup-now` | Déclenche une sauvegarde manuelle |
| `GET` | `/api/admin/backups` | Liste les sauvegardes + stats de la base |
| `GET` | `/api/admin/backups/:filename` | Télécharge une sauvegarde précise (`logivia-YYYY-MM-DD.db`) |
| `GET` | `/api/admin/db-download` | Sauvegarde + télécharge immédiatement la base courante |
| `POST` | `/api/admin/cron-backup` | Cron externe (protégé par `CRON_SECRET`) |

## Visualiser la base

Téléchargez **DB Browser for SQLite** (gratuit, open source, [sqlitebrowser.org](https://sqlitebrowser.org)) :

1. Ouvrir `logivia-2026-04-19.db`
2. Onglet **Browse Data** → table `kv`
3. Vous voyez une ligne par fichier logique : `demandeurs.json`, `audit.json`, etc.
4. La colonne `data` contient le JSON complet — éditable à la main si besoin (attention)

## Rollback (si catastrophe)

Peu probable grâce au fallback automatique, mais si vraiment il faut revenir à la version précédente :

```
git revert HEAD
git push
```

Les fichiers `.json` sont toujours dans `/data` (jamais écrasés par la migration), donc le serveur repart instantanément dessus.

## Prochaine étape (optionnelle, plus tard)

Quand la base dépassera quelques milliers de dossiers et que certaines requêtes ralentiront (ex : recherche dans l'historique), on pourra ajouter des **tables relationnelles indexées** (demandeurs, logements, audiences…) en parallèle de la table `kv`. La migration se fera par sous-domaine, sans coupure de service. Pas urgent.

## Chiffrement SQLCipher (optionnel, futur)

Pour chiffrer la base au repos (argument CNIL fort pour les données art. 9) :

1. Remplacer `better-sqlite3` par `better-sqlite3-multiple-ciphers` dans `package.json`
2. Définir `DB_ENCRYPTION_KEY` dans Railway (32+ chars aléatoires)
3. Modifier `server/db.js` pour appeler `db.pragma("key = '" + key + "'")` après ouverture

À faire dans une 2e passe — pas bloquant pour la mise en prod initiale.
