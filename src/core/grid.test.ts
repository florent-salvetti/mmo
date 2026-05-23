import { describe, it, expect } from 'vitest'
import { getCell, getNeighbors, manhattanDistance } from './grid'
import type { Cell } from '../shared/types'

// ---------------------------------------------------------------------------
// Helper de test : fabrique une grille w×h entièrement walkable.
// overrides permet de rendre certaines cases non-walkable via leur clé "x,y".
// ---------------------------------------------------------------------------
function makeGrid(w: number, h: number, overrides: Record<string, boolean> = {}): Cell[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      position: { x, y },
      walkable: overrides[`${x},${y}`] ?? true,
    }))
  )
}

// ---------------------------------------------------------------------------
// getCell
// ---------------------------------------------------------------------------
describe('getCell', () => {
  it('retourne la bonne case pour des coordonnées valides', () => {
    const grid = makeGrid(3, 3)
    const cell = getCell(grid, { x: 2, y: 1 })
    expect(cell).toBeDefined()
    expect(cell?.position).toEqual({ x: 2, y: 1 })
  })

  it('retourne undefined si x est hors grille', () => {
    const grid = makeGrid(3, 3)
    expect(getCell(grid, { x: 5, y: 0 })).toBeUndefined()
  })

  it('retourne undefined si y est hors grille', () => {
    const grid = makeGrid(3, 3)
    expect(getCell(grid, { x: 0, y: 5 })).toBeUndefined()
  })

  it('retourne undefined pour des coordonnées négatives', () => {
    const grid = makeGrid(3, 3)
    expect(getCell(grid, { x: -1, y: 0 })).toBeUndefined()
    expect(getCell(grid, { x: 0, y: -1 })).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getNeighbors
// ---------------------------------------------------------------------------
describe('getNeighbors', () => {
  it('case centrale sur une grille 3×3 a 4 voisins', () => {
    const grid = makeGrid(3, 3)
    expect(getNeighbors(grid, { x: 1, y: 1 })).toHaveLength(4)
  })

  it('case en coin a 2 voisins', () => {
    const grid = makeGrid(3, 3)
    expect(getNeighbors(grid, { x: 0, y: 0 })).toHaveLength(2)
  })

  it('case sur un bord (pas un coin) a 3 voisins', () => {
    const grid = makeGrid(3, 3)
    expect(getNeighbors(grid, { x: 1, y: 0 })).toHaveLength(3)
  })

  it('exclut les cases non-walkable', () => {
    // (0,0) en coin : voisins naturels = (1,0) et (0,1), mais les deux sont bloqués
    const grid = makeGrid(3, 3, { '1,0': false, '0,1': false })
    expect(getNeighbors(grid, { x: 0, y: 0 })).toHaveLength(0)
  })

  it('retourne bien les 4 cases cardinales pour une case centrale', () => {
    const grid = makeGrid(3, 3)
    const neighbors = getNeighbors(grid, { x: 1, y: 1 })
    const positions = neighbors.map(c => c.position)
    expect(positions).toContainEqual({ x: 1, y: 0 }) // haut
    expect(positions).toContainEqual({ x: 1, y: 2 }) // bas
    expect(positions).toContainEqual({ x: 0, y: 1 }) // gauche
    expect(positions).toContainEqual({ x: 2, y: 1 }) // droite
  })

  it('ne retourne pas les cases en diagonale', () => {
    const grid = makeGrid(3, 3)
    const neighbors = getNeighbors(grid, { x: 1, y: 1 })
    const positions = neighbors.map(c => c.position)
    expect(positions).not.toContainEqual({ x: 0, y: 0 })
    expect(positions).not.toContainEqual({ x: 2, y: 2 })
  })
})

// ---------------------------------------------------------------------------
// manhattanDistance
// ---------------------------------------------------------------------------
describe('manhattanDistance', () => {
  it('distance entre une case et elle-même est 0', () => {
    expect(manhattanDistance({ x: 3, y: 5 }, { x: 3, y: 5 })).toBe(0)
  })

  it('cases adjacentes horizontalement : distance 1', () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1)
  })

  it('cases adjacentes verticalement : distance 1', () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(1)
  })

  it('cases en diagonale : distance 2 et non 1.41 (pas de vol d\'oiseau)', () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(2)
  })

  it('calcule correctement sur une plus grande distance', () => {
    // |4-1| + |6-2| = 3 + 4 = 7
    expect(manhattanDistance({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(7)
  })

  it('est symétrique : distance(a, b) === distance(b, a)', () => {
    const a = { x: 3, y: 1 }
    const b = { x: 0, y: 7 }
    expect(manhattanDistance(a, b)).toBe(manhattanDistance(b, a))
  })

  it('fonctionne avec des coordonnées dans n\'importe quel ordre', () => {
    // Peu importe qui est "avant" ou "après" — le résultat est le même.
    expect(manhattanDistance({ x: 5, y: 0 }, { x: 0, y: 0 })).toBe(5)
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(5)
  })
})
