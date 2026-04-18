#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# deploy-staging.sh
# Commit toutes les modifications Logivia v3.1, cree la branche
# staging, et la pousse vers GitHub.
#
# A executer depuis un terminal sur votre machine, dans le dossier
# du projet (celui qui contient package.json).
# ──────────────────────────────────────────────────────────────

set -e  # stop a la premiere erreur

cd "$(dirname "$0")"

# 0. Nettoyer un eventuel lock git bloque (laisse par un crash precedent)
if [ -f .git/index.lock ]; then
  echo "→ Suppression d'un ancien .git/index.lock"
  rm -f .git/index.lock
fi

# 1. Verifier qu'on est bien dans le repo
if [ ! -d .git ]; then
  echo "✗ Pas de dossier .git ici. Placez ce script a la racine du projet."
  exit 1
fi

# 2. Afficher l'etat avant commit
echo ""
echo "=== Etat du repository ==="
git status --short
echo ""

# 3. Si on est sur main, basculer sur une nouvelle branche staging
CURRENT_BRANCH=$(git branch --show-current)
echo "→ Branche actuelle : $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "main" ]; then
  echo "→ Creation de la branche staging"
  git checkout -b staging
elif [ "$CURRENT_BRANCH" = "staging" ]; then
  echo "→ Deja sur staging, on continue"
else
  echo "⚠ Vous etes sur '$CURRENT_BRANCH'. Ctrl+C pour annuler, Entree pour continuer."
  read -r
fi

# 4. Stager tous les fichiers Logivia v3.1
echo ""
echo "=== Ajout des fichiers ==="
git add \
  DEPLOIEMENT.md \
  deploy-staging.sh \
  README.md \
  index.html \
  package.json \
  package-lock.json \
  jsconfig.json \
  railway.json \
  vite.config.js \
  public \
  server/index.js \
  server/telegram.js \
  server/realtime.js \
  server/data/audit.json \
  server/data/commentaires.json \
  server/data/demandeurs.json \
  server/data/logs.json \
  server/data/notifications.json \
  server/data/referentiels.json \
  src/App.jsx \
  src/Auth.jsx \
  src/Realtime.jsx \
  src/Workflow.jsx \
  src/Features.jsx \
  src/Telegram.jsx \
  src/ImportPelehas.jsx \
  src/Statistiques.jsx \
  src/main.jsx 2>/dev/null || true

echo "→ Fichiers prets a etre committes :"
git status --short | head -40

# 5. Creer le commit
echo ""
echo "=== Commit ==="
git commit -m "Logivia v3.1 - SSE, pieces, kanban, IA, persistance DATA_DIR

Fonctionnalites majeures :
- Temps reel SSE (presence, locks, notifications, @mentions)
- Commentaires internes avec mentions et reactions
- Pieces justificatives avec auto-detection OCR (14 types)
- Kanban drag-drop par etape du workflow (8 etapes)
- Messagerie interne agent-candidat-elu multicanal
- Relances automatiques (4 regles d'echeance)
- PV CAL genere en PDF
- IA predictive delai d'attribution + stats globales

Deploiement :
- DATA_DIR pour volume Railway persistant (auto-seed)
- Endpoints Telegram test-direct / setup-webhook / webhook-info
- Onglet Configuration & test dans l'interface Telegram
- Guide deploiement complet (DEPLOIEMENT.md)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>" || echo "→ Rien a committer (deja fait ?)"

# 6. Pousser la branche staging
echo ""
echo "=== Push vers GitHub ==="
git push -u origin staging

echo ""
echo "✓ Branche staging poussee avec succes."
echo "  Allez maintenant sur Railway et creez un environnement 'staging'"
echo "  qui pointe sur cette branche. Voir DEPLOIEMENT.md etape 3."
