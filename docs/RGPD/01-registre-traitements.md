# Registre des traitements — Logivia

**Responsable de traitement** : Mairie de Saint-Denis de la Réunion
**Siège** : 2 rue de Paris, 97400 Saint-Denis
**SIRET** : 219 74 411 00013
**Représentant légal** : Le Maire de Saint-Denis
**Délégué à la Protection des Données (DPO)** : [À compléter — nom, email : dpo@saintdenis.re]
**Version du registre** : 1.0
**Date de mise à jour** : 17/04/2026

Article 30 du Règlement (UE) 2016/679 (RGPD). Ce registre recense l'ensemble des traitements de données à caractère personnel effectués par la commune via l'application Logivia.

---

## Traitement n°1 — Gestion des demandes de logement social

**Finalité principale** : Instruction et suivi des demandes de logement social déposées auprès de la commune, conformément à la mission confiée aux communes par le Code de la Construction et de l'Habitation (CCH articles L.441 et suivants).

**Finalités détaillées** :
- Réception, enregistrement et numérotation unique (NUD) des demandes
- Étude de l'éligibilité, cotation et classement des dossiers
- Préparation des Commissions d'Attribution de Logement (CAL)
- Édition des procès-verbaux de décision
- Suivi post-CAL (proposition, acceptation/refus, attribution effective)
- Édition d'attestations et de courriers officiels
- Transmission au Système National d'Enregistrement (SNE)

**Base légale** : Article 6.1.e du RGPD — mission d'intérêt public (gestion du service public du logement social) + obligation légale (CCH).

**Catégories de personnes concernées** : Demandeurs de logement social ; membres de leur foyer (conjoint, enfants, ascendants rattachés).

**Catégories de données traitées** :
- Identification : nom, prénom, date de naissance, nationalité
- Contact : adresse, téléphone, email
- Identifiant : NUD (Numéro Unique Départemental)
- Composition du foyer : nombre d'adultes, d'enfants, liens de parenté
- Situation professionnelle : profession, employeur, revenus
- Situation fiscale : avis d'imposition, RFR
- Situation logement : logement actuel, motif de la demande
- Données sensibles (art. 9 RGPD) : handicap, PMR, violences conjugales, grossesse, état de santé lié au logement
- Données de procédure : statut DALO, expulsion, pièces justificatives déposées

**Destinataires** :
- Agents instructeurs de la Mairie (accès complet sur périmètre d'instruction)
- Élus siégeant en CAL (accès restreint au dossier en cours d'examen)
- Directeur du service Habitat (accès complet + signature électronique)
- Système National d'Enregistrement (DHUP — Ministère du Logement) : transmission obligatoire des éléments prévus par le décret
- Bailleurs sociaux partenaires : transmission du dossier uniquement en cas d'attribution

**Transferts hors UE** : Aucun. Tous les traitements sont réalisés en France métropolitaine ou sur le territoire européen (infrastructure Railway – région UE).

**Durée de conservation** :
- Demande active : durée d'instruction + 1 an après radiation
- Demande attribuée : 5 ans après l'attribution (traçabilité)
- Demande radiée : 1 an à compter de la radiation
- Archivage historique anonymisé : illimité à des fins statistiques

**Mesures de sécurité** :
- Authentification nominative par mot de passe + rôles (agent, élu, directeur)
- Authentification renforcée candidat : NUD + date de naissance + session à TTL 30 min
- Chiffrement en transit (HTTPS/TLS 1.2+)
- Chiffrement des sauvegardes au repos
- Pièces justificatives stockées sur volume persistant avec accès restreint
- Signature électronique des PV CAL avec PIN + horodatage + hash SHA-256
- Journal d'audit complet (qui, quoi, quand, pourquoi)
- Rate-limiting sur les endpoints d'authentification (anti-brute-force)
- Sessions avec expiration automatique
- Purge automatique des données selon la politique de rétention
- Charte administrateur signée par tous les agents ayant accès

---

## Traitement n°2 — Portail candidat en ligne

**Finalité** : Permettre au demandeur d'accéder à son dossier à distance (suivi d'étape, dépôt de pièces, réponse aux propositions, renouvellement annuel, téléchargement d'attestation).

**Base légale** : Article 6.1.e RGPD — mission d'intérêt public.

**Catégories de données** : Sous-ensemble du traitement n°1, accessible uniquement au demandeur lui-même après authentification (NUD + date de naissance).

**Destinataires** : Le demandeur lui-même exclusivement.

**Durée de conservation** : Identique au traitement n°1.

**Mesures de sécurité** :
- Authentification renforcée double facteur (NUD + date de naissance)
- Session chiffrée avec token opaque (randomBytes 24), expiration 30 min
- Logs d'accès conservés 1 an
- Aucune donnée stockée côté client (pas de localStorage)
- Droit d'accès (art. 15) et droit à l'effacement (art. 17) implémentés via le portail

---

## Traitement n°3 — Notifications Telegram aux élus

**Finalité** : Transmission aux élus membres de la CAL des convocations, ordres du jour et PV de commission via Telegram (canal chiffré).

**Base légale** : Article 6.1.e RGPD — mission d'intérêt public + consentement explicite de l'élu pour l'usage de Telegram (opt-in).

**Catégories de données** : Identifiant Telegram de l'élu (chat_id), contenu du message (NUD anonymisé lorsque possible, date de CAL, etc.).

**Destinataires** : L'élu lui-même via l'API Telegram (traitement sous responsabilité partagée).

**Durée de conservation** : chat_id conservé tant que l'élu est en fonction ; messages non stockés côté Logivia.

**Mesures de sécurité** :
- Activation par l'élu lui-même uniquement (lien unique + code)
- Possibilité de désactivation à tout moment
- Aucun message contenant données sensibles complètes (anonymisation partielle)

---

## Traitement n°4 — Journal d'audit (traçabilité)

**Finalité** : Assurer la traçabilité des actions effectuées dans Logivia (obligation légale de redevabilité — art. 5.2 RGPD + exigences Code Relations Public-Administration).

**Base légale** : Article 6.1.c RGPD — obligation légale de redevabilité.

**Catégories de données** : Identifiant agent, action, horodatage, référence de la donnée concernée, motif (champ texte libre).

**Destinataires** : Directeur du service Habitat, DPO, autorité de contrôle (CNIL) en cas de demande.

**Durée de conservation** : 5 ans.

**Mesures de sécurité** : Journal immuable (append-only), accès restreint au directeur.

---

## Traitement n°5 — Comptes agents et élus

**Finalité** : Gestion des accès à l'application par les personnels habilités.

**Base légale** : Article 6.1.b RGPD — contrat de travail / délibération municipale.

**Catégories de données** : Nom, prénom, email professionnel, rôle, mot de passe haché, date de dernière connexion.

**Destinataires** : Administrateur technique Logivia (directeur).

**Durée de conservation** : Durée des fonctions + 6 mois. Désactivation automatique au-delà.

**Mesures de sécurité** : Hash bcrypt (cost 10+), session expirante, MFA recommandé.

---

## Procédure de mise à jour

Ce registre est révisé à chaque :
- Ajout ou modification substantielle d'un traitement
- Évolution réglementaire (loi, délibération CNIL)
- Au minimum une fois par an

Dernière révision : [DATE] — Validé par le DPO [NOM].
