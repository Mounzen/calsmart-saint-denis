# Procédure d'exercice des droits RGPD

**Version** : 1.0
**Date** : 17/04/2026
**Destinataires** : DPO, agents du Service Habitat

Cette procédure décrit le traitement des demandes d'exercice de droits formulées par les personnes concernées (demandeurs de logement social, agents, élus) au titre du Règlement général sur la protection des données (RGPD — articles 15 à 22).

## 1. Droits concernés

| Droit | Article | Délai |
|---|---|---|
| Droit d'accès | 15 | 1 mois (prolongeable 2 mois) |
| Droit de rectification | 16 | 1 mois |
| Droit à l'effacement | 17 | 1 mois (sauf exception légale) |
| Droit à la limitation | 18 | 1 mois |
| Droit à la portabilité | 20 | 1 mois (applicable uniquement si base = consentement ou contrat) |
| Droit d'opposition | 21 | 1 mois (restreint pour mission d'intérêt public) |
| Droit relatif aux décisions automatisées | 22 | Non applicable (décisions CAL = humaines) |

## 2. Canaux de réception

Les demandes peuvent être adressées par :

1. **Portail Logivia** — onglet "Mes droits RGPD"
   - Export JSON de ses propres données (accès instantané, art. 15)
   - Formulaire de demande de rectification/effacement (transmis au DPO)
2. **Email** : dpo@saintdenis.re
3. **Courrier postal** : DPO — Mairie de Saint-Denis — 2 rue de Paris — 97400 Saint-Denis
4. **Accueil physique** : Service Habitat, pris en charge par l'agent d'accueil

## 3. Étapes du traitement

### Étape 1 — Réception et enregistrement (J+0)
Toute demande est enregistrée dans le registre des demandes RGPD (durée de conservation : 3 ans). Information donnée : accusé de réception sous 72h.

### Étape 2 — Vérification d'identité (J+1 à J+3)
Vérification de l'identité du demandeur :
- Pour un candidat : NUD + date de naissance + pièce d'identité jointe
- Pour un agent : vérification interne
- Pour un élu : vérification interne

En cas de doute, demande d'éléments complémentaires (ex : copie CNI). Le délai de réponse est suspendu jusqu'à obtention.

### Étape 3 — Qualification de la demande (J+3 à J+5)
Le DPO qualifie :
- Nature exacte du droit exercé
- Périmètre des données concernées
- Existence éventuelle d'un motif légitime de refus (obligation légale, contentieux)

### Étape 4 — Instruction (J+5 à J+25)
- **Droit d'accès** : génération de l'export des données par l'équipe technique
- **Droit de rectification** : vérification de la donnée contestée, correction si fondée
- **Droit à l'effacement** : évaluation du motif de refus (obligation SNE, délais de conservation légaux) — si acceptable : suppression
- **Droit à la limitation** : gel du traitement (marquage `limitation_rgpd: true` dans le dossier)

### Étape 5 — Réponse (J+25 à J+30)
Réponse motivée envoyée par le canal d'origine. En cas de refus ou de refus partiel : motifs détaillés + rappel du droit de saisir la CNIL.

### Étape 6 — Traçabilité (J+30)
Consignation de la demande et de sa suite dans le registre RGPD.

## 4. Cas particuliers

### 4.1 Refus d'effacement
Le droit à l'effacement peut être refusé si :
- L'obligation SNE impose la conservation (mission légale)
- Un contentieux est en cours (intérêt public)
- Les délais de conservation légaux ne sont pas atteints

Le refus est toujours **motivé** et accompagné du rappel : droit de saisir la CNIL.

### 4.2 Demande manifestement infondée ou excessive
En cas de demande manifestement infondée ou excessive (notamment répétitive), la commune peut :
- Exiger le paiement de frais raisonnables tenant compte des coûts administratifs
- Refuser de donner suite (motivation requise)

### 4.3 Demande émanant d'un tiers
Seule la personne concernée peut exercer ses droits, sauf :
- Mandat écrit (procuration signée + CNI du mandant + CNI du mandataire)
- Tuteur légal (jugement de tutelle)

## 5. Registre des demandes RGPD

Tenu par le DPO, il contient :
- Référence unique
- Date de réception
- Canal
- Demandeur (nom/NUD hashé)
- Droit exercé
- Statut (reçue / en cours / accordée / refusée / clôturée)
- Date de réponse
- Motif éventuel de refus

## 6. Indicateurs de suivi

- Nombre de demandes par type / par mois
- Taux de refus (et motifs)
- Délai moyen de traitement
- Incidents éventuels (retards, contestations)

Rapport annuel transmis au Maire et au conseil municipal par le DPO.
