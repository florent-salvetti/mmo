# Projet jeu tactique — Document de démarrage

Starter complet pour lancer le projet avec Claude Code. À garder dans le repo
(par exemple dans `/docs/demarrage.md`).

---

## 1. Le cap

Jeu de combat tactique tour par tour (mécanique type Dofus) dans une ambiance
inspirée de SAO. Web, TypeScript, 2D isométrique. Objectif final : MMO.
On code en solo local d'abord, **architecturé pour le multi dès le départ.**

Priorité affichée : un jeu jouable et fun. Le fun de Dofus est dans le combat
tactique, donc on attaque par là.

---

## 2. Les 4 phases

**Phase 1 — Moteur de combat (solo, local).**
Grille isométrique, un perso, PA/PM, un ou deux sorts, un ennemi avec IA
basique. But : taper un monstre doit être satisfaisant. 100% testable sans
réseau. *C'est la phase où on est, tout le reste attend.*

**Phase 2 — Éditeur de map.**
Génération de niveaux en JSON propre. Le moteur de Phase 1 les charge.
Données séparées de la logique.

**Phase 3 — Contenu solo.**
Plusieurs sorts, plusieurs monstres, une ou deux classes façon SAO, système
d'étages à la Aincrad. Là on a un vrai jeu.

**Phase 4 — Multi.**
On porte le `core` (déjà pur) côté serveur. Le client devient "bête" :
il affiche et envoie des intentions. C'est le MMO.

---

## 3. Architecture en couches

```
core/      logique de jeu PURE — ne sait rien de l'écran ni du réseau
client/    rendu isométrique + entrées souris — affiche, transmet
server/    (Phase 4) autorité réseau — n'existe pas encore
shared/    types partagés entre les couches
```

Le `core` est une machine à états : `(état, action) -> nouvel état`.
Déterministe, testable, sans aucun affichage.

**Règle non négociable :** `core` n'importe jamais rien de `client`, de
`server`, du DOM, d'une lib de rendu. C'est ce qui rend la bascule MMO
possible sans réécriture.

---

## 4. Structure de dossiers (Phase 1)

```
mon-jeu/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── docs/
│   └── demarrage.md
├── data/
│   ├── maps/
│   │   └── arene-01.json
│   └── spells/
│       └── coup-epee.json
└── src/
    ├── shared/
    │   └── types.ts          // GameState, Action, Entity, Cell...
    ├── core/
    │   ├── grid.ts           // grille, distances, voisins
    │   ├── movement.ts       // cases atteignables avec N PM
    │   ├── lineOfSight.ts    // ligne de vue entre 2 cases
    │   ├── spells.ts         // application d'un sort
    │   ├── turn.ts           // gestion des tours, PA/PM
    │   ├── reducer.ts        // (état, action) -> nouvel état
    │   └── *.test.ts         // tests Vitest à côté de chaque module
    ├── client/
    │   ├── render/
    │   │   ├── isoCamera.ts  // conversion case <-> pixel isométrique
    │   │   └── renderer.ts   // dessine l'état sur le canvas (PixiJS)
    │   ├── input/
    │   │   └── mouse.ts      // clics -> intentions
    │   └── main.ts           // assemble core + rendu + entrées
    └── data/
        └── loader.ts         // charge et valide les JSON
```

---

## 5. Format JSON — Map

```json
{
  "id": "arene-01",
  "name": "Arène d'entraînement",
  "width": 12,
  "height": 12,
  "cells": [
    { "x": 0, "y": 0, "walkable": true, "lineOfSightBlocking": false },
    { "x": 5, "y": 5, "walkable": false, "lineOfSightBlocking": true }
  ],
  "spawns": {
    "players": [ { "x": 1, "y": 6 } ],
    "enemies":  [ { "x": 10, "y": 6 } ]
  }
}
```

> Astuce : pour ne pas écrire 144 cases à la main, on peut définir une grille
> "tout marchable" par défaut et ne lister QUE les exceptions (obstacles).
> On verra ça à l'implémentation, mais l'idée est dans le format.

---

## 6. Format JSON — Sort

```json
{
  "id": "coup-epee",
  "name": "Coup d'épée",
  "apCost": 3,
  "range": { "min": 1, "max": 1 },
  "needsLineOfSight": true,
  "effects": [
    { "type": "damage", "value": 12 }
  ]
}
```

Plus tard les effets s'étoffent : `heal`, `push`, `buff`, zones d'effet, etc.
La structure "liste d'effets" est faite pour grossir sans casser l'existant.

---

## 7. Plan de tâches Phase 1 (à donner à Claude Code, une par une)

Découpage volontairement fin (profil TS débutant). Chaque tâche = une demande,
puis explication du code par Claude Code, puis on valide, puis on passe à la
suivante.

1. **Setup projet.** Vite + TypeScript strict + Vitest. Le `CLAUDE.md` est lu.
   Un "hello canvas" qui affiche un rectangle, juste pour valider la chaîne.

2. **Types partagés.** Définir dans `shared/types.ts` : `Cell`, `Entity`,
   `GameState`, `Action`. C'est le vocabulaire du jeu.

3. **Grille (`core/grid.ts`).** Représenter la grille, calculer voisins et
   distance entre deux cases. + tests.

4. **Rendu isométrique vide (`client/render`).** Afficher la grille en iso à
   l'écran (juste les losanges des cases). Pas encore d'interaction.

5. **Déplacement (`core/movement.ts`).** Calculer les cases atteignables avec
   N points de mouvement, en contournant les obstacles. + tests.

6. **Clic pour bouger (`client/input`).** Clic sur une case atteignable ->
   l'entité s'y déplace, PM décrémentés. Première vraie interaction.

7. **Ligne de vue (`core/lineOfSight.ts`).** Dire si une case en voit une
   autre. + tests.

8. **Sorts (`core/spells.ts`).** Charger le sort depuis JSON, vérifier portée
   + LdV + PA, appliquer les dégâts. + tests.

9. **Tours (`core/turn.ts`).** Fin de tour, reset des PA/PM, alternance
   joueur / ennemi.

10. **IA basique de l'ennemi.** L'ennemi s'approche et tape si à portée.
    Bidon mais suffisant pour que le combat existe.

11. **Boucle de victoire/défaite.** PV à 0 -> fin de combat. On a un combat
    jouable complet de bout en bout. **Fin de Phase 1.**

---

## 8. Comment bosser au quotidien

- Une tâche à la fois, dans l'ordre.
- Après chaque module : Claude Code explique le code, tu poses tes questions
  jusqu'à comprendre. C'est ton apprentissage TS qui se fait là.
- Le `core` ne sort jamais une seule ligne sans test.
- Tu tiens le cap et l'archi ; Claude Code abat le volume.
- Tu commits après chaque tâche validée (git). État sauvegardé, retour
  arrière possible.

---

## 9. Premier message à envoyer à Claude Code

> "Lis le CLAUDE.md. On démarre la Phase 1, tâche 1 : setup du projet avec
> Vite + TypeScript strict + Vitest, et un hello canvas qui affiche un simple
> rectangle pour valider la chaîne de build. Explique-moi chaque fichier que
> tu crées."

Et c'est parti.
