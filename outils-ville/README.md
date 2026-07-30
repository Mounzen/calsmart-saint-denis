# Outil d'extraction Ville — positionnement des candidats audience

Génère un classeur Excel qui, à partir des candidats reçus en **audience élu**,
prépare leur positionnement sur les **logements en proposition** : taux d'effort,
éligibilité, score CAL estimé, et **levier** (contingent Ville / plaidoyer).

## Utilisation

```bash
python extraction_ville.py [dossier_donnees] [sortie.xlsx]
```

- `dossier_donnees` : défaut = `../server/data` (les JSON de l'appli en local).
  En production, les données sont dans Supabase — exporter les JSON ou pointer
  le script vers le bon dossier pour travailler sur les cas réels.
- `sortie.xlsx` : défaut = `Extraction-Ville-Audiences.xlsx`.

Dépendance : `openpyxl` (`pip install openpyxl`).

## Contenu du classeur

`Candidats`, `Logements`, `Tableau croisé` (candidats × logements, taux + éligibilité),
`Par logement`, `Par candidat`, `Synthèse` (compteurs, légende, cadre).

## Cadre (à valider avec le service juridique)

- **Contingent Ville** : la commune est réservataire → proposition directe.
- **Autres contingents** (Préfecture/DALO, Action Logement, Bailleur…) : la Ville
  peut **plaider** en CAL, mais la priorité revient au réservataire ; sur le
  contingent préfectoral, les publics DALO/prioritaires priment (CCH L.441-1).
- **Taux d'effort** = loyer charges comprises / revenu, **hors APL** ; au-delà de
  40 % le dossier est inéligible dans le moteur.
- Le calcul reproduit le moteur Logivia (`computeScore`), **validé 72/72**.

La CAL reste souveraine ; cet outil est une aide à la préparation, pas une décision.
