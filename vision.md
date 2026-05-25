# Vision du jeu

> Document de cap. Décrit où on veut aller, pas ce qu'on construit maintenant.
> La construction se fait marche par marche (voir feuille-de-route.md).
> Ce fichier peut évoluer : la vision a le droit de changer.

## Concept général

Jeu de combat tactique tour par tour (mécaniques type Dofus), univers type
Sword Art Online. Progression par étages : on monte d'étage en étage, chaque
étage est plus difficile et se débloque en battant son boss.

## Le personnage

- Naît au **niveau 1**, stats à 0.
- Équipement de départ : **une épée uniquement**.
- Les **sorts dépendent de l'équipement** :
  - Avec l'épée : un sort d'attaque au corps à corps.
  - Sans épée (épée retirée) : seulement le coup de poing.
- Progresse en gagnant des combats (niveaux, stats).

## Étage 1 (premier contenu cible)

- Une **mini-ville / village** (lieu sans combat, hub).
- **3 zones d'XP** (zones de combat contre des groupes de monstres).
- **Craft** des premiers équipements : coiffe, cape, épée.
- **Drop** sur les groupes de monstres : ressources (pour le craft) et
  sorts basiques.
- **Boss d'étage** très difficile. Le battre débloque l'étage 2.
  - Le boss **drop un sort unique** au joueur qui porte le coup de grâce.

## Systèmes à terme

- **Monde parcourable** : maps reliées qu'on traverse en marchant (passage
  d'une map à la map adjacente en atteignant un bord), façon Dofus.
- **Mode exploration** hors combat (déplacement libre, temps réel) distinct
  du mode combat tactique (tour par tour).
- Système de **niveaux / stats / XP**.
- Système d'**équipement** (emplacements : coiffe, cape, épée…) avec lien
  **équipement → sorts disponibles**.
- Système de **craft** (recettes, ressources).
- Système de **drop** (ressources + sorts) sur les monstres.
- **Boss** d'étage et déblocage d'étage en étage.

## Horizon lointain

- Multijoueur / MMO (Phase 4 du plan d'origine, non commencé).
- Animations de sprites depuis Blender (pré-rendu).
- Système d'initiative (la fonction getUpcomingTurns est déjà le point
  d'extension prêt pour ça).
- Support mobile (forcer l'horizontal).
