# Dossier RGPD — Logivia

Ce dossier regroupe la documentation de conformité RGPD de l'application Logivia pour la Mairie de Saint-Denis de la Réunion.

## Contenu

| Fichier | Objet |
|---|---|
| `01-registre-traitements.md` | Registre des traitements (Art. 30 RGPD) — **obligatoire** |
| `02-dpia.md` | Analyse d'impact / AIPD (Art. 35 RGPD) — **obligatoire** pour ce traitement |
| `03-politique-confidentialite.md` | Politique affichée sur le portail candidat |
| `04-mentions-legales.md` | Mentions légales du portail |
| `05-politique-securite.md` | Politique de sécurité SI |
| `06-politique-conservation.md` | Durées de conservation / archivage |
| `07-procedure-droits.md` | Procédure d'instruction des demandes RGPD |
| `08-charte-administrateur.md` | Charte à signer par les utilisateurs |

## Avant mise en production

1. **Désigner le DPO** — peut être mutualisé au niveau de la commune ou via un prestataire. Renseigner ses coordonnées dans tous les documents (remplacer les `[À compléter]`).
2. **Valider le registre** — le Maire (ou son délégué) valide formellement le registre.
3. **Valider la DPIA** — le DPO se prononce. En cas de risque résiduel élevé : consultation préalable de la CNIL.
4. **Déclarer au registre communal** — inscrire Logivia au registre global des traitements de la commune.
5. **Publier la politique de confidentialité et les mentions légales** sur le portail.
6. **Faire signer la charte** par tous les agents et élus avant ouverture de leur compte.
7. **Paramétrer les durées de conservation** dans Logivia (cron de purge).
8. **Informer le personnel** — session de formation RGPD à l'ouverture.

## Audit externe (recommandé)

Bien que cette documentation couvre l'essentiel, un **audit par un cabinet spécialisé RGPD/sécurité** est fortement recommandé avant une mise en production à grande échelle. Budget indicatif : 3 000 – 8 000 € HT. À prévoir notamment :
- Relecture juridique
- Pentest léger (boîte noire)
- Revue technique du code
- Rédaction d'un rapport certifié

## Contact

- Service Habitat : habitat@saintdenis.re — 0262 40 01 67
- DPO : dpo@saintdenis.re (à créer)
- Sécurité : security@saintdenis.re (à créer)
