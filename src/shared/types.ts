// Vocabulaire commun aux couches core, client (et server plus tard).
// Aucune logique ici — uniquement des formes de données.

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Coordonnées sur la grille (colonne x, ligne y). */
export type Position = {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Grille
// ---------------------------------------------------------------------------

/** Une case de la grille de combat. */
export type Cell = {
  position: Position
  /** Si false, aucune entité ne peut s'y déplacer (mur, obstacle). */
  walkable: boolean
}

// ---------------------------------------------------------------------------
// Entités
// ---------------------------------------------------------------------------

/** L'équipe d'une entité — détermine qui est ami ou ennemi. */
export type Team = 'player' | 'enemy'

/** Un combattant sur la grille (joueur ou monstre). */
export type Entity = {
  id: string
  name: string
  team: Team
  position: Position
  hp: number
  maxHp: number
  /** Points d'action : budget pour lancer des sorts ce tour-ci. */
  ap: number
  maxAp: number
  /** Points de mouvement : budget pour se déplacer ce tour-ci. */
  mp: number
  maxMp: number
}

// ---------------------------------------------------------------------------
// État du jeu
// ---------------------------------------------------------------------------

/**
 * Snapshot complet d'un combat à un instant T.
 * Le core prend cet état + une action et produit un nouvel état.
 * Jamais muté en place — toujours remplacé.
 */
export type GameState = {
  /** Grille indexée [ligne][colonne] → grid[y][x]. */
  grid: Cell[][]
  entities: Entity[]
  /** Id de l'entité dont c'est le tour. */
  currentEntityId: string
  turn: number
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Ce qu'un joueur (ou l'IA) peut demander au core de faire.
 * Union discriminée sur `type` : TypeScript sait exactement quels champs
 * sont présents selon la valeur de `type`.
 */
export type Action =
  | { type: 'MOVE';      entityId: string; to: Position }
  | { type: 'END_TURN';  entityId: string }
  | { type: 'USE_SPELL'; entityId: string; spellId: string; target: Position }
