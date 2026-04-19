# Analyse d'impact relative à la protection des données (AIPD / DPIA)

**Traitement évalué** : Gestion des demandes de logement social via Logivia
**Responsable de traitement** : Mairie de Saint-Denis de la Réunion
**Date de l'AIPD** : 17/04/2026
**Version** : 1.0
**Auteur** : [Nom du DPO]
**Validation** : [Nom du Maire ou DGS]

---

## 1. Justification de la réalisation d'une AIPD

L'article 35 du RGPD impose une AIPD lorsque le traitement est **susceptible d'engendrer un risque élevé pour les droits et libertés**. Le traitement Logivia entre dans **3 des 9 critères identifiés par le G29 (lignes directrices WP248)** qui, à partir de 2 critères remplis, déclenchent l'obligation :

- **Traitement de données sensibles** (art. 9 RGPD) : handicap, état de santé, violences conjugales
- **Traitement de données concernant des personnes vulnérables** : ménages en difficulté, mal-logés, DALO, personnes en expulsion
- **Évaluation ou scoring** : cotation automatique des demandes (module de scoring avec règles pondérées)

Une AIPD est donc **obligatoire** et doit être tenue à jour.

---

## 2. Description du traitement

### 2.1 Contexte
La Mairie de Saint-Denis, en tant que service enregistreur du SNE, reçoit, instruit et classe les demandes de logement social. Le logiciel Logivia automatise ce circuit, depuis le dépôt jusqu'à l'attribution effective.

### 2.2 Finalités (cf. registre traitement n°1)
Voir document `01-registre-traitements.md`.

### 2.3 Enjeux
- Égalité de traitement des demandeurs (lutte contre les biais dans le scoring)
- Transparence de la décision (PV signés, score explicité)
- Confidentialité des données sensibles (santé, violences)
- Sécurité contre l'accès illégitime (données très convoitées)

---

## 3. Nécessité et proportionnalité

### 3.1 Finalités déterminées, explicites et légitimes : OUI
Les finalités découlent du Code de la Construction et de l'Habitation.

### 3.2 Base légale : OUI
Art. 6.1.e RGPD (mission d'intérêt public) + obligation SNE.

### 3.3 Minimisation des données : OUI avec réserves
Mesure en place : seules les données nécessaires à l'instruction sont collectées. Les champs "urgence", "violences", "handicap" sont justifiés par la cotation réglementaire.
**À surveiller** : éviter la surcollecte via le portail candidat (formulaires épurés).

### 3.4 Qualité des données : OUI
Possibilité pour le demandeur de rectifier via le portail (art. 16 RGPD). Validation par l'agent avant publication.

### 3.5 Durée de conservation limitée : OUI
Politique définie (voir `06-politique-conservation.md`). Purge automatique programmée.

### 3.6 Information des personnes : OUI
Mentions légales + politique de confidentialité accessibles depuis le portail candidat. Affichage sur l'accusé de réception de la demande.

### 3.7 Droits des personnes : OUI
- Art. 15 (accès) : endpoint portail `/api/portail/mes-donnees` (export JSON)
- Art. 16 (rectification) : via le portail ou sur RDV en mairie
- Art. 17 (effacement) : demande via `/api/portail/demande-rgpd` traitée par DPO
- Art. 18 (limitation) : idem
- Art. 21 (opposition) : limitée car base légale mission d'intérêt public

### 3.8 Sous-traitance : MAÎTRISÉE
- Railway (hébergeur) : clauses de sous-traitance conformes art. 28 — infrastructure UE
- Telegram (notifications élus) : consentement explicite de l'élu, données anonymisées

### 3.9 Transfert hors UE : NON

---

## 4. Analyse des risques

### 4.1 Risque n°1 — Accès illégitime aux données
**Sources de risque** : attaquant externe, agent indélicat, compte compromis
**Impacts potentiels** : divulgation de données sensibles (santé, violences), préjudice moral, atteinte réputation, discrimination
**Gravité** : 3/4 (ÉLEVÉE — données sensibles + personnes vulnérables)
**Vraisemblance** : 2/4 (LIMITÉE — mesures techniques nombreuses)

**Mesures prévues** :
- Authentification nominative + rôles
- Hash bcrypt des mots de passe
- Rate-limiting anti-brute-force (10 tentatives / 15 min)
- Sessions à TTL court (30 min portail, 2h agents)
- HTTPS/TLS 1.2+ obligatoire
- Helmet headers de sécurité
- Audit log immuable
- Charte administrateur signée
- Formation agents

**Risque résiduel** : FAIBLE ACCEPTABLE

### 4.2 Risque n°2 — Modification non désirée de données
**Sources** : erreur humaine, bug logiciel, attaque CSRF
**Impacts** : mauvaise décision CAL, attribution erronée
**Gravité** : 3/4
**Vraisemblance** : 1/4

**Mesures** :
- Signature électronique des PV (PIN + hash SHA-256 + horodatage)
- Versionnement implicite via audit log
- Validation à 2 niveaux pour décisions CAL (agent → directeur)
- Sauvegardes quotidiennes
- CSRF-safe (headers anti-CSRF, SameSite cookies)

**Risque résiduel** : NÉGLIGEABLE

### 4.3 Risque n°3 — Disparition de données
**Sources** : panne infrastructure, suppression malveillante, ransomware
**Impacts** : impossibilité de traiter les dossiers, perte historique
**Gravité** : 2/4
**Vraisemblance** : 1/4

**Mesures** :
- Volume persistant Railway avec snapshots
- Export CSV/JSON réguliers
- Politique de rétention n'autorisant pas la suppression "dure" (logical delete)
- Plan de reprise d'activité (PRA) à finaliser

**Risque résiduel** : FAIBLE

### 4.4 Risque n°4 — Biais dans le scoring algorithmique
**Sources** : règles de cotation mal calibrées, discrimination indirecte
**Impacts** : rupture d'égalité de traitement, contentieux
**Gravité** : 4/4 (CRITIQUE — atteinte au principe d'égalité)
**Vraisemblance** : 2/4

**Mesures** :
- Règles de scoring **visibles et éditables** (transparence)
- Fonction "Voir pourquoi" : détail du score par candidat (explicabilité)
- Le score est une **aide à la décision**, pas une décision automatisée au sens de l'art. 22 RGPD (la CAL humaine tranche toujours)
- Audit périodique des règles de cotation par la CAL
- Possibilité de contester via recours gracieux

**Risque résiduel** : MAÎTRISÉ

---

## 5. Conclusion

À l'issue de cette AIPD, l'ensemble des risques identifiés sont évalués comme **acceptables** compte tenu des mesures techniques et organisationnelles en place.

**Position du DPO** : [Favorable / Favorable sous réserves / Défavorable — à renseigner par le DPO]
**Position de la CNIL** : consultation préalable **non nécessaire** (risque résiduel maîtrisé).

**Points à réévaluer annuellement** :
- Évolution des règles de scoring
- Statistiques sur les demandes d'exercice de droits
- Incidents de sécurité éventuels
- Mise à jour du registre des sous-traitants

---

## Annexes

- Registre des traitements (`01-registre-traitements.md`)
- Politique de sécurité technique (`05-politique-securite.md`)
- Politique de conservation (`06-politique-conservation.md`)
- Procédure d'exercice des droits (`07-procedure-droits.md`)

**Prochaine révision prévue** : 17/04/2027
