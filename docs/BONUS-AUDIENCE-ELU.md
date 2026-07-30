# Bonus « audience élu » — Service Habitat, Ville de Saint-Denis

Adaptation du moteur d'attribution (Logivia / CALSmart2) : un candidat **reçu en
audience par un élu avec avis favorable** voit sa chance augmentée dans le
matching, de façon **plafonnée, tracée et réglable**.

## Ce qui a changé

Avant, les audiences étaient enregistrées et affichées (badge), mais **n'entraient
pas dans le score**. Désormais, une audience favorable ajoute un bonus au score du
candidat lors du matching sur un logement du **contingent communal** (« Ville »).

Trois fichiers modifiés, aucune dépendance ajoutée :

| Fichier | Modification |
|---|---|
| `server/index.js` | Moteur `computeScore` + branchement dans `/api/matching` + endpoints de réglage `/api/config/audience` |
| `src/App.jsx` | Bonus visible dans le détail du score + badge « Audience +N » dans la liste |
| `src/Features.jsx` | Carte de réglage « Bonus audience élu » (page *Règles de scoring*, réservée au directeur) |

## Règle appliquée

Un bonus est ajouté au score du demandeur si **toutes** ces conditions sont réunies :

1. le bonus est **actif** ;
2. le candidat a **au moins une audience `favorable`** ;
3. le logement relève du **contingent communal** (`contingent = "Ville"`), sauf si
   l'option « contingent communal uniquement » est désactivée.

Montant : `bonus_favorable` (+8 par défaut), plus `bonus_quartier_concordant` (+2)
si le quartier visé lors de l'audience correspond au quartier du logement, le tout
**plafonné** (`plafond_bonus`, 10 par défaut). Le score total reste **borné à 100**.

Le bonus **n'écrase jamais l'éligibilité** ni les critères réglementaires : un
candidat inéligible (taux d'effort > 40 %, typologie incompatible, etc.) le reste.
Si une audience favorable existe mais que le logement n'est **pas** communal, une
ligne d'information « hors contingent communal — sans bonus » est tracée, sans point.

## Paramètres (réglables par la direction)

Stockés dans `referentiels.audience_config` ; valeurs par défaut si absents :

```json
{
  "actif": true,
  "bonus_favorable": 8,
  "bonus_quartier_concordant": 2,
  "plafond_bonus": 10,
  "exiger_contingent_communal": true
}
```

Deux façons de régler :

- **Interface** : page *Règles de scoring* → carte « Bonus audience élu » →
  bouton *Régler* (visible pour le rôle directeur).
- **API** : `GET /api/config/audience` (tous) et `PUT /api/config/audience`
  (directeur). Bornes serveur : bonus 0–30, quartier 0–15, plafond 0–30.

## Traçabilité (conformité)

- Le bonus apparaît dans le **détail du score** du candidat (bloc bonus/malus,
  en violet) et dans le récapitulatif « base X + bonus Y ».
- Chaque modification du réglage est journalisée (`UPDATE_AUDIENCE_CONFIG`) dans
  les logs, comme les autres réglages sensibles.
- La règle est aussi listée dans la page publique *Règles de scoring*
  (« Correction anti-biais »), pour rester transparente vis-à-vis de la CAL.

> Rappel métier : ce bonus outille le rôle réservataire légitime de la commune
> (contingent communal). Le limiter, le plafonner et le tracer permet de rester
> dans le cadre de l'égalité de traitement ; la décision finale reste celle de la
> CAL, qui peut déroger en le justifiant.

## Déploiement

Remplacer les 3 fichiers puis redéployer normalement :

- **Local / serveur** : `node server/index.js` (ou `npm run dev`).
- **Vercel** : `api/index.js` réexporte déjà l'app d'`server/index.js` ; un
  `npm run build` + redéploiement suffit. Aucune migration de base requise
  (le paramètre vit dans `referentiels`).

## Vérification

Test logique sur la fonction réelle extraite de `server/index.js` :
**19/19 cas passés** — bonus appliqué sur « Ville », ignoré hors contingent,
concordance quartier, plafond respecté, audience non favorable ignorée,
désactivation, et plafonnement du total à 100. Les 3 fichiers passent le contrôle
de syntaxe (`node --check` / esbuild JSX).
