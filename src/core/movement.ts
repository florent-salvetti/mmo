import type { Cell, Entity, Position } from '../shared/types'
import { getNeighbors } from './grid'

/** Clé de position pour une Map/Set (évite la comparaison d'objets par référence). */
function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`
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
): Cell[] {
  // Positions des ennemis : bloquent le passage.
  const enemyPos = new Set(
    entities
      .filter(e => e.id !== mover.id && e.team !== mover.team)
      .map(e => posKey(e.position)),
  )

  // Positions de toutes les autres entités : empêchent de s'y arrêter.
  const occupiedPos = new Set(
    entities
      .filter(e => e.id !== mover.id)
      .map(e => posKey(e.position)),
  )

  // --- BFS ---
  // `visited` stocke la clé de chaque case déjà ajoutée à la queue,
  // ce qui garantit qu'on ne la traite pas deux fois.
  const visited = new Set<string>([posKey(mover.position)])
  const queue: Array<{ pos: Position; steps: number }> = [
    { pos: mover.position, steps: 0 },
  ]
  const reachable: Cell[] = []

  while (queue.length > 0) {
    const { pos, steps } = queue.shift()!

    // Destination valide : pas le départ, pas occupée.
    if (steps > 0 && !occupiedPos.has(posKey(pos))) {
      reachable.push(grid[pos.y]![pos.x]!)
    }

    // Plus de PM : on n'explore pas les voisins de cette case.
    if (steps >= mp) continue

    for (const neighbor of getNeighbors(grid, pos)) {
      const key = posKey(neighbor.position)
      if (enemyPos.has(key)) continue  // ennemi : passage interdit
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ pos: neighbor.position, steps: steps + 1 })
    }
  }

  return reachable
}
