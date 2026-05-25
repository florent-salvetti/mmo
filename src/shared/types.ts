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
  /**
   * Type d'obstacle visuel (absent = case normale) :
   *  - 'hole'  → trou : bloque le mouvement, transparent pour la ligne de vue.
   *  - 'cube'  → bloc : bloque le mouvement ET la ligne de vue.
   */
  obstacle?: 'hole' | 'cube'
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
  /** Type de créature (ex. 'sanglier') — détermine les sprites à charger. Absent = cercle de fallback. */
  creatureType?: string
  /**
   * Tours de recharge restants par sort (spellId → tours restants).
   * Absent ou valeur à 0 = sort disponible. Décrémenté au début du tour de l'entité.
   */
  cooldowns?: Record<string, number>
}

// ---------------------------------------------------------------------------
// État du jeu
// ---------------------------------------------------------------------------

/** Résultat du combat : toujours calculé depuis les PV des entités. */
export type CombatStatus = 'ongoing' | 'victory' | 'defeat'

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
  /** Calculé dans le core après chaque action ; le client ne fait que l'afficher. */
  status: CombatStatus
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

// ---------------------------------------------------------------------------
// Définition de map (données chargeables)
// ---------------------------------------------------------------------------

/** Un obstacle posé sur la grille dans la définition d'une map. */
export type ObstacleEntry = {
  x: number
  y: number
  type: 'hole' | 'cube'
}

/** Données de départ du joueur dans une définition de map. */
export type PlayerEntry = {
  id: string
  name: string
  startPosition: { x: number; y: number }
  hp: number
  maxHp: number
  ap: number
  maxAp: number
  mp: number
  maxMp: number
}

/** Maps adjacentes accessibles depuis cette map (exploration). Absent = bord infranchissable. */
export type MapNeighbors = {
  nord?: string
  sud?:  string
  est?:  string
  ouest?: string
}

/** Un monstre appartenant à un groupe sur la map d'exploration. */
export type MonsterEntry = {
  id: string
  name: string
  creatureType: string
  /** Position sur la map d'exploration (sprite visible en dehors des combats). */
  position: { x: number; y: number }
  /**
   * Position de départ EN COMBAT.
   * Si absent, `position` est réutilisée comme fallback.
   */
  combatPosition?: { x: number; y: number }
  hp: number
  maxHp: number
  ap: number
  maxAp: number
  mp: number
  maxMp: number
}

/**
 * Un groupe de monstres sur la map d'exploration.
 * Cliquer un membre du groupe engagera le combat avec TOUT le groupe.
 * playerStartPositions : 3 cases de départ possibles pour le joueur au lancement du combat.
 * L'une d'elles est choisie aléatoirement côté client (randomness hors du core pur).
 */
export type MonsterGroup = {
  id: string
  monsters: MonsterEntry[]
  playerStartPositions?: [Position, Position, Position]
}

/**
 * Structure de données décrivant une map chargeable depuis un fichier.
 * Changer les données change la map — sans toucher au code.
 */
export type MapDefinition = {
  id: string
  width: number
  height: number
  obstacles: ObstacleEntry[]
  player: PlayerEntry
  /**
   * Groupes de monstres visibles en exploration.
   * Remplace l'ancien champ `enemies` (combat-only, supprimé).
   * Quand un groupe est engagé, ses monsters alimenteront le GameState de combat.
   */
  monsterGroups: MonsterGroup[]
  /** Voisinage optionnel — utilisé en exploration pour les transitions. */
  neighbors?: MapNeighbors
}

// ---------------------------------------------------------------------------
// Arènes de combat
// ---------------------------------------------------------------------------

/**
 * Un terrain de combat dédié, indépendant des maps d'exploration.
 * Contient uniquement ce dont le moteur de combat a besoin : la grille et les
 * points de spawn. Les stats des combattants arrivent depuis l'état du jeu.
 */
export type CombatArena = {
  id: string
  width: number
  height: number
  obstacles: ObstacleEntry[]
  /** Position de départ du joueur au lancement du combat. */
  playerSpawn: Position
  /**
   * Positions de départ des ennemis (index 0 = 1er monstre du groupe, etc.).
   * Prévoir autant de slots que le plus grand groupe possible.
   * Si le groupe a plus de monstres que de spawns, le dernier spawn est réutilisé.
   */
  enemySpawns: Position[]
}

// ---------------------------------------------------------------------------
// Sorts
// ---------------------------------------------------------------------------

/** Un effet de sort (union discriminée, extensible). */
export type DamageEffect = { type: 'damage'; value: number }
/** Déplace le lanceur en ligne droite dans la direction de la cible (distance Manhattan <= maxDistance). */
export type DashEffect   = { type: 'dash';   maxDistance: number; impactDamage: number }
export type SpellEffect  = DamageEffect | DashEffect

/** Définition statique d'un sort, chargée depuis data/spells/*.json. */
export type Spell = {
  id:               string
  name:             string
  apCost:           number
  range:            { min: number; max: number }
  needsLineOfSight: boolean
  effects:          SpellEffect[]
  /** Tours d'indisponibilité après lancement. Absent ou 0 = pas de cooldown. */
  cooldown?:        number
}
