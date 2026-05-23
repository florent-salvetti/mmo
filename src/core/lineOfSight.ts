import type { Cell, Position } from '../shared/types'
import { getCell } from './grid'

/**
 * Retourne la liste ordonnée des cases traversées par le segment [from → to]
 * selon l'algorithme de Bresenham.
 * Inclut toujours les cases de départ et d'arrivée.
 */
export function bresenhamLine(from: Position, to: Position): Position[] {
  const cells: Position[] = []

  let x = from.x
  let y = from.y

  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const sx  = from.x < to.x ? 1 : -1  // sens de progression sur x
  const sy  = from.y < to.y ? 1 : -1  // sens de progression sur y

  // `err` encode l'écart cumulé entre la ligne idéale et la case courante.
  // Valeur initiale = dx - dy (équivalent à centrer l'erreur sur l'axe dominant).
  let err = dx - dy

  for (;;) {
    cells.push({ x, y })
    if (x === to.x && y === to.y) break

    const e2 = 2 * err
    // Si l'erreur penche vers x, on avance en x et on corrige l'erreur.
    if (e2 > -dy) { err -= dy; x += sx }
    // Si l'erreur penche vers y, on avance en y et on corrige l'erreur.
    // Les deux conditions peuvent être vraies en même temps (diagonale exacte).
    if (e2 <  dx) { err += dx; y += sy }
  }

  return cells
}

/**
 * Retourne true si la case `from` a une ligne de vue directe vers `to`.
 *
 * Règle : une case non-walkable intermédiaire bloque la vue.
 * Les cases de départ et d'arrivée ne sont jamais testées — l'entité
 * qui se trouve sur ces cases ne se bloque pas elle-même.
 */
export function hasLineOfSight(
  grid: Cell[][],
  from: Position,
  to: Position,
): boolean {
  const line = bresenhamLine(from, to)

  // i=0 (départ) et i=length-1 (arrivée) sont ignorés intentionnellement.
  for (let i = 1; i < line.length - 1; i++) {
    const cell = getCell(grid, line[i]!)
    if (!cell?.walkable) return false
  }
  return true
}
