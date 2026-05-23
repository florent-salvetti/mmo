# CLAUDE.md — Règles du projet

> Ce fichier cadre ton travail sur ce repo. Tu le lis avant chaque session.
> Le développeur a un niveau TypeScript faible et apprend en avançant.
> Ton job : produire du code propre, expliqué, et tenir l'architecture.

## Le projet en une phrase

Un jeu de combat tactique au tour par tour (mécanique inspirée de Dofus :
grille, points d'action, points de mouvement, sorts à portée) dans une
ambiance inspirée de l'univers de Sword Art Online (étages, classes orientées
épée/skills, narration "piégé dans le jeu"). Rendu 2D isométrique, en
TypeScript, dans le navigateur. Objectif final lointain : un MMO. On code
aujourd'hui en solo local, mais architecturé pour le multi.

## Règle d'or de l'architecture : trois couches étanches

```
core/      <- logique de jeu PURE. Ne sait rien de l'écran ni du réseau.
client/    <- rendu isométrique + entrées souris. Affiche, transmet, décide rien.
server/    <- (Phase 4 seulement) autorité réseau. N'existe pas encore.
shared/    <- types partagés entre les couches (état du jeu, actions, etc.)
```

**INTERDIT ABSOLU :** `core/` n'importe JAMAIS quoi que ce soit de `client/`,
de `server/`, d'une lib de rendu, du DOM, ou de `window`. Si une tâche
t'amène à vouloir le faire, tu STOPPES et tu signales le problème
d'architecture au lieu de le faire. C'est cette règle qui permettra de
brancher le serveur plus tard sans tout réécrire.

Le `core` est une machine à états : il prend `(état, action)` et renvoie un
`nouvel état`. Pur, déterministe, testable sans rien afficher.

## Règles de travail (profil : niveau TS faible, apprentissage en cours)

1. **Une tâche à la fois.** Tu ne codes que ce qui est demandé. Tu ne pars
   pas en avant "tant que j'y suis". Petites unités testables.

2. **Tu expliques systématiquement.** Après chaque module ou fonction
   produit, tu donnes une explication claire et pédagogique de ce que fait
   le code, en français, sans jargon inutile. Le développeur DOIT comprendre
   avant qu'on avance.

3. **Tests obligatoires sur le `core`.** Toute logique de jeu dans `core/`
   vient avec ses tests (Vitest). Pas de logique de combat sans test qui
   prouve qu'elle marche. C'est la sécurité du projet.

4. **TypeScript strict.** `strict: true` dans tsconfig. Pas de `any` sauf
   justification écrite. Les types sont la documentation vivante du projet.

5. **Pas de dépendance ajoutée sans justification.** Chaque lib installée
   doit être justifiée en une phrase. On garde le projet léger.

6. **Données séparées de la logique.** Les maps, les sorts, les monstres
   sont du DATA (fichiers JSON), pas du code en dur. Le core LIT ces données.

## Stack technique

- Langage : TypeScript (strict)
- Build / dev : Vite
- Tests : Vitest
- Rendu 2D : Canvas via PixiJS (Phase 1+) — couche `client` uniquement
- Multi (Phase 4) : WebSocket. Pas avant.

## Conventions de code

- Noms en anglais dans le code, commentaires en français OK.
- Fonctions pures privilégiées dans le `core`.
- Un fichier = une responsabilité claire.
- Pas de fichier de plus de ~200 lignes sans bonne raison ; si ça gonfle,
  on découpe.

## Quand tu démarres une session

1. Tu relis ce fichier.
2. Tu regardes où on en est (phase en cours, dernière tâche faite).
3. Tu demandes la tâche précise du jour si elle n'est pas claire.
4. Tu ne touches pas à du code hors du périmètre de la tâche.
