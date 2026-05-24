import type { Cell, Entity, Position } from '../shared/types'
import { getNeighbors } from './grid'

/** Clé de position pour une Map/Set (évite la comparaison d'objets par référence). */
function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`
}

/** Une case atteignable et le nombre de PM nécessaires pour y arriver. */
export type ReachableCell = {
  cell: Cell
  /** Nombre de PM dépensés sur le chemin BFS optimal. */
  cost: number
}

/**
 * Retourne toutes les cases que `mover` peut atteindre avec `mp` points de mouvement.
 *
 * Règles :
 *  - On ne traverse pas une case occupée par un ennemi (elle bloque).
 *  - On peut traverser une case occupée par un allié, mais on ne peut pas s'y arrêter.
 *  - La case de départ n'est jamais une destination.
 *
 * Algorithme : BFS (parcours en largeur) sur la grille.
 */
export function getReachableCells(
  grid: Cell[][],
  mover: Entity,
  entities: Entity[],
  mp: number,
): ReachableCell[] {
  // Positions des ennemis vivants : bloquent le passage.
  const enemyPos = new Set(
    entities
      .filter(e => e.id !== mover.id && e.team !== mover.team && e.hp > 0)
      .map(e => posKey(e.position)),
  )

  // Positions de toutes les autres entités vivantes : empêchent de s'y arrêter.
  const occupiedPos = new Set(
    entities
      .filter(e => e.id !== mover.id && e.hp > 0)
      .map(e => posKey(e.position)),
  )

  // --- BFS ---
  const visited = new Set<string>([posKey(mover.position)])
  const queue: Array<{ pos: Position; steps: number }> = [
    { pos: mover.position, steps: 0 },
  ]
  const reachable: ReachableCell[] = []

  while (queue.length > 0) {
    const { pos, steps } = queue.shift()!

    // Destination valide : pas le départ, pas occupée.
    if (steps > 0 && !occupiedPos.has(posKey(pos))) {
      reachable.push({ cell: grid[pos.y]![pos.x]!, cost: steps })
    }

    // Plus de PM : on n'explore pas les voisins de cette case.
    if (steps >= mp) continue

    for (const neighbor of getNeighbors(grid, pos)) {
      const key = posKey(neighbor.position)
      if (enemyPos.has(key)) continue
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ pos: neighbor.position, steps: steps + 1 })
    }
  }

  return reachable
}

/**
 * BFS depuis `from` sur la topologie pure de la grille (murs uniquement).
 * Retourne une Map posKey → distance en pas réels vers chaque case walkable.
 * N'tient pas compte des entités : donne la distance minimale théorique,
 * indépendante des positions changeantes des combattants.
 */
export function getPathDistances(
  grid: Cell[][],
  from: Position,
): Map<string, number> {
  const distances = new Map<string, number>()
  distances.set(posKey(from), 0)
  const queue: Array<{ pos: Position; dist: number }> = [{ pos: from, dist: 0 }]

  while (queue.length > 0) {
    const { pos, dist } = queue.shift()!
    for (const neighbor of getNeighbors(grid, pos)) {
      const key = posKey(neighbor.position)
      if (!distances.has(key)) {
        distances.set(key, dist + 1)
        queue.push({ pos: neighbor.position, dist: dist + 1 })
      }
    }
  }

  return distances
}
