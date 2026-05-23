import type { Cell, Position } from '../shared/types'

// Décalages des 4 directions cardinales (pas de diagonale, comme dans Dofus).
const CARDINAL_OFFSETS: Position[] = [
  { x:  0, y: -1 }, // haut
  { x:  0, y:  1 }, // bas
  { x: -1, y:  0 }, // gauche
  { x:  1, y:  0 }, // droite
]

/**
 * Retourne la case à la position donnée, ou undefined si hors grille.
 * Accès : grid[y][x] — l'axe y (ligne) en premier, convention matricielle.
 */
export function getCell(grid: Cell[][], pos: Position): Cell | undefined {
  return grid[pos.y]?.[pos.x]
}

/**
 * Retourne les voisins marchables d'une case (utilisé pour le déplacement).
 * Exclut les cases hors grille et les cases non-walkable.
 */
export function getNeighbors(grid: Cell[][], pos: Position): Cell[] {
  return CARDINAL_OFFSETS
    .map(offset => getCell(grid, { x: pos.x + offset.x, y: pos.y + offset.y }))
    .filter((cell): cell is Cell => cell !== undefined && cell.walkable)
}

/**
 * Distance de Manhattan entre deux positions : |dx| + |dy|.
 * Mesure le coût réel d'un déplacement sur grille en 4 directions
 * (nombre de cases à traverser, sans passer par les diagonales).
 */
export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
