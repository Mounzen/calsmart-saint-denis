# Logivia — Saint-Denis

**L'attribution de logement, en clair.**

Plateforme intelligente de gestion des attributions de logement social
pour la Ville de Saint-Denis.

> Précédemment connue sous le nom « CAL Smart ». Renommée en **Logivia**
> (« Logi » + « via » — la voie du logement).

## Structure

- `src/` — Frontend React
- `server/` — Backend Express + Telegram
- `server/data/` — Données JSON

## Démarrage

```bash
npm install
npm run dev    # client (3000) + serveur (4000)
npm run build  # build de production
npm start      # serveur seul (prod)
```

## Fonctionnalités

- Tableau de bord temps réel
- Matching demandeur ↔ logement avec score 8 critères
- Correction anti-biais automatique
- Préparation des Commissions d'Attribution (CAL)
- Suivi territorial des audiences élus
- Notifications Telegram (élus & candidats)
- Import CSV depuis AFI-Pelehas
- Export CSV, rapport mensuel
- Portail candidat sans login (par NUD)
- Statistiques et carte du territoire

## Déploiement

- GitHub — stockage code
- Railway — hébergement
