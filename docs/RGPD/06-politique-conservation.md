# Politique de conservation et d'archivage — Logivia

**Version** : 1.0
**Date** : 17/04/2026

Conformément aux articles 5.1.e du RGPD et aux recommandations CNIL applicables au secteur du logement social, les données personnelles traitées par Logivia ne sont pas conservées au-delà de la durée nécessaire à la finalité du traitement. Les durées ci-dessous s'appuient sur le **Référentiel CNIL — Gestion des demandes de logement social et des attributions**.

## 1. Durées de conservation par catégorie

| Donnée / Document | Base active | Archivage intermédiaire | Suppression définitive |
|---|---|---|---|
| Dossier demandeur — demande en cours | Durée d'instruction | — | — |
| Dossier demandeur — demande radiée | — | 1 an après radiation | 1 an + 1 jour |
| Dossier demandeur — attribution | 5 ans après attribution | Archivage anonyme statistique | Au-delà : anonymisé uniquement |
| Pièces justificatives (identité, revenus, etc.) | Durée d'instruction + 1 an | — | À radiation ou attribution + 1 an |
| PV de CAL signés | 10 ans | Archivage historique | Conservé comme archive publique |
| Audiences avec élus | 5 ans | — | 5 ans + 1 jour |
| Sessions portail candidat | 30 minutes | — | Auto-expiration |
| Logs de connexion portail | 12 mois | — | 12 mois + 1 jour |
| Audit log agents | 5 ans | — | 5 ans + 1 jour |
| Comptes utilisateurs inactifs | — | Désactivation à 6 mois d'inactivité | Suppression à 2 ans d'inactivité |
| Demandes d'exercice de droits RGPD | 3 ans | — | 3 ans + 1 jour |
| Cookies de session | 30 minutes | — | Suppression à déconnexion |

## 2. Mécanismes de purge

Un service de purge automatique tourne quotidiennement et :
- Supprime les sessions expirées
- Archive les demandes radiées depuis plus d'un an
- Anonymise (hash du NUD, suppression nom/prénom/email) les dossiers attribués depuis plus de 5 ans
- Purge les journaux de connexion de plus de 12 mois
- Purge les logs d'audit de plus de 5 ans
- Désactive les comptes inactifs depuis 6 mois
- Supprime les comptes désactivés depuis 2 ans

Un rapport mensuel de purge est généré et transmis au DPO.

## 3. Anonymisation statistique

Après expiration de la période de conservation active, certaines données peuvent être conservées **sous forme anonyme** à des fins statistiques, historiques ou de recherche (art. 5.1.b RGPD). L'anonymisation est réalisée selon les techniques recommandées par la CNIL :
- Suppression des identifiants directs (nom, NUD, email, adresse précise)
- Généralisation (âge par tranche, quartier par secteur)
- Suppression des pièces jointes

Les données anonymisées ne permettent plus d'identifier la personne et ne sont plus soumises au RGPD.

## 4. Cas particuliers

**Contentieux ou procédure en cours** : la conservation est prolongée jusqu'à la prescription de l'action ou l'issue du litige.

**Demande d'effacement (art. 17 RGPD)** : traitée sous 30 jours par le DPO. Peut être refusée si :
- Obligation légale de conservation (ex : traçabilité SNE)
- Intérêt public prévaut (mission de service public)
- Instruction en cours

En cas de refus, le demandeur est informé des motifs et peut saisir la CNIL.

## 5. Responsabilités

- **Administrateur technique** : paramétrage et suivi des purges automatiques
- **DPO** : vérification du respect des durées, instruction des demandes d'effacement
- **Directeur du Service Habitat** : validation annuelle des durées

## 6. Traçabilité

Toutes les suppressions et anonymisations sont consignées dans l'audit log avec :
- Date/heure
- Type d'opération (purge, anonymisation, effacement manuel)
- Référence du dossier (avant suppression si possible)
- Motif

## 7. Révision

Cette politique est révisée :
- À chaque évolution du Référentiel CNIL "Logement social"
- À chaque évolution réglementaire majeure
- Au minimum tous les 2 ans
