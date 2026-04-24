# FranceConnect dans Logivia — Guide d'activation

FranceConnect permet aux demandeurs d'accéder à leur dossier via un service
d'identité certifié par l'État, sans avoir à créer ni retenir un mot de passe.
L'intégration est **optionnelle** : tant que les clés ne sont pas configurées,
le module se désactive proprement et l'auth NUD + date de naissance reste seule
disponible.

## Ce que le code fait déjà

Tout est prêt côté serveur et côté interface :

- `server/franceconnect.js` : moteur OIDC (flow Authorization Code, scope
  `openid given_name family_name birthdate email`, gestion state/nonce,
  RP-initiated logout).
- `server/index.js` : montage `/api/fc/status`, `/api/fc/auth`,
  `/api/fc/callback`, `/api/fc/logout`, avec création de session portail à la
  volée via la même Map que l'auth NUD.
- `src/App.jsx` (PortailCandidatPage) : bouton « Se connecter avec
  FranceConnect » sur l'écran de connexion, gestion du retour callback
  (token en fragment pour ne pas polluer les logs) et affichage des erreurs.

Il ne reste que 3 actions administratives à faire pour activer en prod.

## Étape 1 — S'inscrire comme Fournisseur de Service

FranceConnect est géré par la DINUM (Direction Interministérielle du
Numérique). Pour qu'une collectivité puisse l'utiliser, elle doit demander
l'habilitation comme FS (Fournisseur de Service).

**Portail partenaires** :
https://partenaires.franceconnect.gouv.fr/fcp/fournisseur-service

Il faut deux comptes :

1. **Intégration** (environnement de test, libre d'accès, démarrage immédiat).
2. **Production** (ouverture après signature d'une convention).

Pour l'intégration, il faut préciser :

- Le nom du service (« Portail candidat Logivia — Ville de Saint-Denis 974 »).
- Les URLs de callback (ex. `https://staging.logivia.fr/api/fc/callback`).
- Les scopes utilisés : `openid`, `given_name`, `family_name`, `birthdate`,
  éventuellement `email`.
- Le responsable de traitement (DPO de la mairie).

Une fois le formulaire validé, la DINUM renvoie :

- `client_id`
- `client_secret`

à conserver dans un gestionnaire de secrets (jamais dans Git).

## Étape 2 — Définir les variables d'environnement

Dans Railway (ou dans le `.env` local pour tests), ajouter :

```
FC_CLIENT_ID=votre-client-id-dinum
FC_CLIENT_SECRET=votre-client-secret-dinum
FC_ENV=integ
FC_REDIRECT_URI=https://votre-domaine.fr/api/fc/callback
FC_LOGOUT_REDIRECT=https://votre-domaine.fr/portail
```

Passer `FC_ENV=prod` uniquement quand la convention de production a été signée
et que les URLs ont été validées par la DINUM.

Au démarrage du serveur, vous verrez :

```
[fc] FranceConnect monte (actif: true)
```

À partir de ce moment, l'endpoint `GET /api/fc/status` renvoie `enabled: true`
et le bouton apparaît automatiquement sur le portail candidat.

## Étape 3 — Passer en production

Quand vous êtes prêt à ouvrir aux vrais candidats :

1. Demander à la DINUM le passage en production (signature convention).
2. Remplacer `FC_CLIENT_ID` / `FC_CLIENT_SECRET` par les valeurs prod.
3. Mettre `FC_ENV=prod`.
4. Mettre à jour `FC_REDIRECT_URI` vers le domaine de production.
5. Vérifier que le domaine est bien déclaré chez la DINUM (HTTPS obligatoire).

## Comment le matching candidat fonctionne

Quand FranceConnect authentifie un usager, on reçoit `family_name`,
`given_name`, `birthdate`, `email`. Logivia cherche un demandeur dont :

- Le **nom** correspond (normalisation : accents ignorés, casse ignorée, espaces
  et tirets retirés).
- Le **premier prénom** correspond (on ne prend que le premier token de
  `given_name`).
- La **date de naissance** est identique (format `YYYY-MM-DD`).

Si aucun demandeur ne correspond, le portail affiche un message explicite :
« FranceConnect vous a identifié mais aucun dossier n'a été trouvé ».

Si le match est trouvé, une session portail est créée immédiatement avec la
même durée de vie (30 minutes) qu'une auth NUD+date. L'utilisateur a accès à
son dossier, pièces, propositions, RGPD, etc.

## Sécurité

Le module implémente :

- **state** + **nonce** OIDC (protection CSRF + replay).
- **acr_values=eidas1** (niveau de garantie faible, suffisant pour une
  demande de logement social).
- **Nettoyage auto** des states périmés (>10 min).
- **Token portail en fragment** (après `#`) plutôt qu'en query string, pour
  éviter la persistance dans les logs serveur et les analytics.
- **RP-initiated logout** : appeler `/api/fc/logout?token=...` pour déconnecter
  simultanément de FranceConnect.

Ce qui **n'est pas** encore fait et serait à ajouter pour un déploiement
production à fort volume :

- Vérification de la signature JWT du `userinfo` (nécessite la JWKS de FC —
  actuellement on décode juste le payload).
- Persistance des states en Redis (pour supporter plusieurs instances Node).
- Metrics Prometheus dédiées aux flows FC (ratio succès/échec, temps de
  réponse callback).

## Alternative : quand ne PAS activer FranceConnect

FranceConnect vise les personnes majeures disposant d'une identité numérique
(Impôts, La Poste, Ameli). Ce n'est **pas** adapté pour :

- Les mineurs inscrits comme demandeurs (rare en logement social).
- Les personnes étrangères sans identité FC reconnue.
- Les tests rapides (l'environnement intégration demande quand même des
  comptes de test FC-fictifs).

Pour ces cas, l'auth NUD + date de naissance reste disponible en parallèle.

## Support

Questions opérationnelles : DINUM (support.partenaires@franceconnect.gouv.fr).
Questions d'intégration Logivia : voir `server/franceconnect.js` qui documente
chaque étape du flow.
