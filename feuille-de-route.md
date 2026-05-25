# Feuille de route — en escalier

> Chaque marche s'appuie sur les précédentes. On ne saute pas de marche.
> On ne construit qu'UNE marche à la fois, validée + commitée avant la suivante.
> Règle d'or : on ne met dans une structure de données que ce que le jeu sait
> DÉJÀ utiliser. Les structures grandissent avec le jeu.

## Où on en est

Acquis : moteur de combat tactique complet (déplacement BFS, sorts JSON,
cooldowns, IA, mort/victoire), sprites directionnels + animations, HUD complet
HTML/CSS fidèle au design (timeline d'initiative, portraits, barre de sorts),
plein écran responsive. ~199 tests. UN seul combat, codé en dur dans main.ts.

## Les marches

### Marche 1 — Map chargeable depuis des données  ← ON EST ICI
Sortir le combat codé en dur de main.ts vers une "définition de map" (données).
Le core sait construire l'état de jeu initial à partir de cette définition.
Contenu minimal de la définition : dimensions, obstacles, position de départ
du joueur, liste des ennemis (type + position). Le combat actuel doit être
identique, mais construit depuis des données. Invisible à l'écran, fondamental.

### Marche 2 — Plusieurs maps
Pouvoir définir plusieurs maps et charger l'une ou l'autre. Débloque les 3
zones d'XP et l'arène du boss en tant que combats distincts. (Choix de la map
via un menu simple au début — pas besoin de les relier encore.)

### Marche 3 — Mode exploration (déplacement libre hors combat)
Nouveau mode de jeu : marcher librement sur une map, sans tour par tour, sans
PM, sans combat. Le pendant "exploration" du mode combat. Mécanique nouvelle.

### Marche 4 — Maps reliées (monde parcourable)
Atteindre un bord de map fait passer à la map adjacente (quadrillage de zones).
C'est le rêve "maps qu'on parcourt". Dépend des marches 1→3.

### Marche 5 — Déclenchement de combats en explorant
Rencontrer un groupe de monstres en exploration lance un combat (mode combat),
puis retour à l'exploration après victoire. Relie les deux modes.

### Marche 6 — Village (hub sans combat)
Une map de type village : pas de combat, lieu central de l'étage 1.

### Marche 7 — Niveaux / stats / XP
Le perso gagne de l'XP en combat, monte de niveau, ses stats évoluent.

### Marche 8 — Équipement + lien équipement → sorts
Emplacements d'équipement (coiffe, cape, épée). Les sorts disponibles
dépendent de l'équipement porté (épée = sort épée ; sans épée = coup de poing).

### Marche 9 — Drop (ressources + sorts)
Les monstres lâchent des ressources et des sorts basiques.

### Marche 10 — Craft
Recettes : fabriquer coiffe, cape, épée à partir de ressources.

### Marche 11 — Boss d'étage + déblocage étage 2
Boss difficile. Le battre débloque l'étage suivant. Drop d'un sort unique
au porteur du coup de grâce.

## Idées notées (sans place fixe dans l'escalier)

- Éditeur de map visuel (dessiner les maps à la souris). À glisser après la
  marche 1 ou 2 : il produit les données que la marche 1 sait charger.
- Système d'initiative (point d'extension getUpcomingTurns déjà prêt).
- Icônes de sorts (remplacer les emojis placeholder).
- Animations Blender pré-rendues.
- Multijoueur (très loin).
