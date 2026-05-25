import type { Cell, Position } from '../shared/types'
import { getNeighbors, getCell } from '../core/grid'

/** Décalages des 4 diagonales — utilisés uniquement en exploration (8 directions). */
const DIAGONAL_OFFSETS: Position[] = [
  { x: -1, y: -1 }, { x: 1, y: -1 },
  { x: -1, y:  1 }, { x: 1, y:  1 },
]

/** Durée d'animation par case traversée (ms). Une entité avec mp=3 s'anime en ~600 ms. */
const MS_PER_STEP = 200

type MoveAnimation = {
  entityId: string
  /** Positions de grille de départ (inclus) à arrivée (inclus). */
  path: Position[]
  startTime: number
}

const active = new Map<string, MoveAnimation>()

/**
 * Reconstruit le chemin BFS de `from` vers `to` sur la grille.
 * `blockedPositions` bloque des cases supplémentaires (entités vivantes
 * capturées avant le déplacement, pour reproduire le trajet réel).
 * Retourne un tableau [from, ..., to].
 * Fallback sur [from, to] (ligne droite) si aucun chemin n'existe.
 */
/**
 * Reconstruit le chemin BFS de `from` vers `to` sur la grille.
 * `blockedPositions` bloque des cases supplémentaires (entités vivantes
 * capturées avant le déplacement, pour reproduire le trajet réel).
 * `allowDiagonals` active les 8 directions (exploration uniquement) —
 * le combat reste STRICTEMENT en 4 directions (défaut false).
 * Retourne un tableau [from, ..., to].
 * Fallback sur [from, to] (ligne droite) si aucun chemin n'existe.
 */
export function buildPath(
  grid: Cell[][],
  from: Position,
  to: Position,
  blockedPositions: Set<string> = new Set(),
  allowDiagonals = false,
): Position[] {
  if (from.x === to.x && from.y === to.y) return [from]

  const key      = (p: Position) => `${p.x},${p.y}`
  const startKey = key(from)
  const endKey   = key(to)

  const parentKey = new Map<string, string>([[startKey, '']])
  const posMap    = new Map<string, Position>([[startKey, from]])
  const queue: Position[] = [from]

  while (queue.length > 0) {
    const pos = queue.shift()!
    if (key(pos) === endKey) break
    const neighbors = getNeighbors(grid, pos)
    if (allowDiagonals) {
      for (const o of DIAGONAL_OFFSETS) {
        const cell = getCell(grid, { x: pos.x + o.x, y: pos.y + o.y })
        if (cell && cell.walkable) neighbors.push(cell)
      }
    }
    for (const n of neighbors) {
      const nk = key(n.position)
      if (blockedPositions.has(nk)) continue
      if (!parentKey.has(nk)) {
        parentKey.set(nk, key(pos))
        posMap.set(nk, n.position)
        queue.push(n.position)
      }
    }
  }

  if (!parentKey.has(endKey)) return [from, to]

  const path: Position[] = []
  let cur = endKey
  while (cur !== startKey) {
    path.unshift(posMap.get(cur)!)
    cur = parentKey.get(cur)!
  }
  path.unshift(from)
  return path
}

/** Vide toutes les animations en cours (utilisé lors d'un changement de map). */
export function resetAnimations(): void {
  active.clear()
}

/** Lance l'animation de déplacement pour une entité. Ignore si le chemin fait moins de 2 cases. */
export function startAnimation(entityId: string, path: Position[], startTime: number): void {
  if (path.length < 2) return
  active.set(entityId, { entityId, path, startTime })
}

/**
 * Avance les animations au timestamp `now`, retire les animations terminées.
 * Retourne true si au moins une animation est encore en cours.
 */
export function tickAnimations(now: number): boolean {
  for (const [id, anim] of [...active]) {
    if (now - anim.startTime >= (anim.path.length - 1) * MS_PER_STEP) {
      active.delete(id)
    }
  }
  return active.size > 0
}

/**
 * Retourne le segment du chemin actuellement parcouru par l'entité animée.
 * Permet de connaître la direction instantanée pour choisir le bon sprite à chaque frame.
 * Retourne null si l'entité n'est pas en cours d'animation.
 */
export function getCurrentSegment(
  entityId: string,
  now: number,
): { from: Position; to: Position } | null {
  const anim = active.get(entityId)
  if (!anim) return null

  const numSteps = anim.path.length - 1
  const stepIdx  = Math.min(Math.floor((now - anim.startTime) / MS_PER_STEP), numSteps - 1)

  return { from: anim.path[stepIdx]!, to: anim.path[stepIdx + 1]! }
}

/**
 * Retourne la position visuelle interpolée d'une entité (coordonnées de grille fractionnaires).
 * Compatible directement avec gridToScreen — pas besoin de conversion supplémentaire.
 * Retourne null si l'entité n'est pas en cours d'animation.
 */
export function getVisualPosition(entityId: string, now: number): Position | null {
  const anim = active.get(entityId)
  if (!anim) return null

  const numSteps = anim.path.length - 1
  const t        = (now - anim.startTime) / MS_PER_STEP
  const stepIdx  = Math.min(Math.floor(t), numSteps - 1)
  const frac     = t - Math.floor(t)
  const from     = anim.path[stepIdx]!
  const next     = anim.path[stepIdx + 1]!

  return {
    x: from.x + (next.x - from.x) * frac,
    y: from.y + (next.y - from.y) * frac,
  }
}
