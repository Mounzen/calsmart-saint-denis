# Politique de sécurité des systèmes d'information — Logivia

**Version** : 1.0
**Date** : 17/04/2026
**Portée** : Application Logivia et données associées

## 1. Objectifs

Garantir la **confidentialité**, l'**intégrité** et la **disponibilité** des données personnelles traitées par l'application Logivia, conformément au RGPD et aux recommandations de l'ANSSI (Agence nationale de la sécurité des systèmes d'information).

## 2. Classification des données

| Niveau | Exemple | Mesures requises |
|---|---|---|
| **Sensible** (art. 9 RGPD) | Handicap, violences, santé | Chiffrement repos + transport, accès restreint, audit renforcé |
| **Personnelle** | Identité, adresse, revenus | Chiffrement transport, accès nominatif, audit |
| **Interne** | Paramétrage, règles de scoring | Accès directeur uniquement |
| **Publique** | Statistiques anonymisées | Accès libre |

## 3. Mesures techniques

### 3.1 Authentification
- **Agents/élus** : identifiant + mot de passe haché (bcrypt, cost ≥10)
- **Candidats (portail)** : NUD + date de naissance
- **Directeur** : identifiant + mot de passe + PIN (signature PV)
- **Rate-limiting** : 10 tentatives échouées / 15 min / IP — verrouillage temporaire
- **Sessions** : token opaque aléatoire, TTL 30 min (portail) / 2h (agent)
- **Expiration auto** sur inactivité

### 3.2 Transport
- HTTPS/TLS 1.2+ obligatoire (redirect HTTP → HTTPS)
- HSTS activé
- Headers de sécurité : Helmet (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)

### 3.3 Stockage
- Volume persistant Railway chiffré au repos
- Pièces justificatives stockées hors du répertoire public
- Sauvegardes quotidiennes snapshot
- Pas de données sensibles dans les logs applicatifs

### 3.4 Intégrité
- Signature électronique des PV CAL : PIN + SHA-256 + horodatage
- Journal d'audit append-only
- Contrôles d'intégrité lors des lectures de données critiques

### 3.5 Traçabilité
- Journal d'audit complet (qui, quoi, quand, pourquoi)
- Conservation 5 ans
- Accessible uniquement au directeur et au DPO

### 3.6 Protection anti-abus
- Rate-limiting sur endpoints sensibles
- Validation stricte des entrées (types, tailles, mimes)
- Limitation de la taille des uploads (8 Mo)
- Liste blanche des mimes autorisés (PDF, JPG, PNG, WEBP, HEIC)

## 4. Mesures organisationnelles

### 4.1 Rôles et habilitations
| Rôle | Accès | Actions |
|---|---|---|
| Directeur | Total | Toutes opérations + signature + paramétrage |
| Agent | Demandeurs, pièces, CAL | Instruction, cotation, préparation CAL |
| Élu | Dossier en cours d'examen uniquement | Consultation, audience, avis |
| Candidat | Son propre dossier | Dépôt pièces, réponse proposition, renouvellement |

### 4.2 Procédures
- Demande d'accès → autorisation hiérarchique → création du compte
- Départ d'un agent → désactivation immédiate du compte + rotation des mots de passe partagés
- Incident de sécurité → notification DPO < 24h → analyse → si violation : notification CNIL < 72h (art. 33 RGPD)
- Revue annuelle des habilitations
- Formation des agents au RGPD à l'embauche et tous les 2 ans

### 4.3 Charte administrateur
Les agents disposant de privilèges techniques signent la **charte administrateur** (voir `08-charte-administrateur.md`) qui rappelle les obligations de confidentialité, l'interdiction de consultation hors mission, la traçabilité des accès.

## 5. Continuité et reprise d'activité

- **Sauvegardes** : snapshot journalier, rétention 30 jours
- **RTO** (Recovery Time Objective) : 4 heures
- **RPO** (Recovery Point Objective) : 24 heures
- **Plan de reprise** : procédure documentée, test annuel

## 6. Gestion des violations de données

En cas de violation (fuite, altération, indisponibilité affectant les droits des personnes) :

1. **Détection** → équipe technique
2. **Qualification** → DPO dans les 24h
3. **Notification CNIL** → sous 72h si risque pour les droits et libertés (art. 33 RGPD)
4. **Information des personnes concernées** → sans délai si risque élevé (art. 34 RGPD)
5. **Analyse post-incident** → mise à jour des mesures

Toute violation est consignée dans un registre tenu par le DPO.

## 7. Veille et mise à jour

- Veille sur les vulnérabilités (CVE, avis ANSSI)
- Mises à jour de sécurité dans un délai max de 30 jours (critiques : sous 72h)
- Revue annuelle de la présente politique

## 8. Sous-traitance

Tout sous-traitant accédant à des données à caractère personnel est encadré par un contrat conforme à l'article 28 RGPD (clauses Privacy by Default, instructions documentées, sécurité, retour ou suppression en fin de contrat, auditabilité).

Sous-traitants actuels :
- **Railway** (hébergement) — clauses art. 28, région UE
- **Telegram** (notifications élus) — consentement explicite, données minimisées

## 9. Contact sécurité

Signalement d'une faille ou d'un incident : **security@saintdenis.re**
DPO : **dpo@saintdenis.re**
