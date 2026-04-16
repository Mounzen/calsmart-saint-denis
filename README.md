# CAL Smart — Saint-Denis

Application de matching logement social, CAL, audiences élus, notifications Telegram.

---

## Lancement en développement (ton ordi)

```bash
npm install
npm run dev
```
→ Ouvre http://localhost:3000

---

## Déploiement en production (Railway)

### 1. Pousser sur GitHub
```bash
git init
git add .
git commit -m "CAL Smart v2.0"
git remote add origin https://github.com/TON_NOM/CALSmart.git
git push -u origin main
```

### 2. Déployer sur Railway
- Va sur railway.app → New Project → Deploy from GitHub
- Sélectionne le repo CALSmart
- Railway lit automatiquement railway.json et déploie

### 3. Configurer le webhook Telegram (après déploiement)
Dans l'appli → ✈ Telegram → Admin → Set Webhook → entre ton URL Railway

---

## Comment ça marche en production

- `npm run build` compile React dans `dist/`
- `npm run start` lance Express sur le PORT défini par Railway
- Express sert les fichiers `dist/` ET répond aux routes `/api/*`
- Plus besoin de Vite en production

---

## Structure
```
CALSmart/
├── src/              ← React (frontend)
├── server/           ← Express (backend)
│   ├── index.js      ← Serveur principal
│   ├── telegram.js   ← Bot Telegram
│   ├── generate_pdf.py
│   └── data/         ← Données JSON
├── dist/             ← Build React (généré par npm run build)
├── railway.json      ← Config déploiement Railway
└── vite.config.js
```

## Comptes
| Login | Mot de passe | Rôle |
|-------|-------------|------|
| admin | calsmart2024 | Directeur |
| agent1 | agent2024 | Agent |
| dupont | elu2024 | Élu Nord |
