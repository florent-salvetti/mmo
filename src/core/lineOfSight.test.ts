import { describe, it, expect } from 'vitest'
import { bresenhamLine, hasLineOfSight } from './lineOfSight'
import type { Cell } from '../shared/types'

function makeGrid(w: number, h: number, blocked: string[] = []): Cell[][] {
  const blockedSet = new Set(blocked)
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      position: { x, y },
      walkable: !blockedSet.has(`${x},${y}`),
    })),
  )
}

// ---------------------------------------------------------------------------
// bresenhamLine — vérification du tracé brut
// ---------------------------------------------------------------------------

describe('bresenhamLine', () => {
  it('même case → un seul point', () => {
    expect(bresenhamLine({ x: 3, y: 2 }, { x: 3, y: 2 })).toEqual([{ x: 3, y: 2 }])
  })

  it('cases adjacentes → exactement deux points', () => {
    expect(bresenhamLine({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 },
    ])
  })

  it('ligne horizontale', () => {
    expect(bresenhamLine({ x: 0, y: 2 }, { x: 4, y: 2 })).toEqual([
      { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
    ])
  })

  it('ligne verticale', () => {
    expect(bresenhamLine({ x: 1, y: 0 }, { x: 1, y: 3 })).toEqual([
      { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 },
    ])
  })

  it('diagonale 45°', () => {
    expect(bresenhamLine({ x: 0, y: 0 }, { x: 3, y: 3 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 },
    ])
  })

  it('sens négatif (from > to)', () => {
    expect(bresenhamLine({ x: 3, y: 0 }, { x: 0, y: 0 })).toEqual([
      { x: 3, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 },
    ])
  })

  it('commence toujours par from et se termine toujours par to', () => {
    const from = { x: 1, y: 5 }
    const to   = { x: 7, y: 2 }
    const line = bresenhamLine(from, to)
    expect(line.at(0)).toEqual(from)
    expect(line.at(-1)).toEqual(to)
  })

  it('ligne oblique (0,0)→(4,2) : tracé attendu', () => {
    // Trace calculée à la main : (0,0),(1,0),(2,1),(3,1),(4,2)
    expect(bresenhamLine({ x: 0, y: 0 }, { x: 4, y: 2 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 2 },
    ])
  })
})

// ---------------------------------------------------------------------------
// hasLineOfSight
// ---------------------------------------------------------------------------

describe('hasLineOfSight', () => {
  it('même case → true', () => {
    expect(hasLineOfSight(makeGrid(3, 3), { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(true)
  })

  it('cases adjacentes → true (aucune case intermédiaire)', () => {
    expect(hasLineOfSight(makeGrid(3, 1), { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true)
  })

  it('ligne droite dégagée → true', () => {
    expect(hasLineOfSight(makeGrid(5, 1), { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true)
  })

  it('obstacle au milieu d\'une ligne droite → false', () => {
    const grid = makeGrid(5, 1, ['2,0'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false)
  })

  it('obstacle proche du départ → false', () => {
    const grid = makeGrid(6, 1, ['1,0'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false)
  })

  it('obstacle proche de l\'arrivée → false', () => {
    const grid = makeGrid(6, 1, ['4,0'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false)
  })

  it('la case de départ n\'est pas vérifiée, même si non-walkable', () => {
    // Le lanceur est sur sa case — elle ne bloque pas sa propre vue.
    const grid = makeGrid(5, 1, ['0,0'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true)
  })

  it('la case d\'arrivée n\'est pas vérifiée, même si non-walkable', () => {
    // La cible peut être derrière un mur — c'est l'intermédiaire qui compte.
    const grid = makeGrid(5, 1, ['4,0'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true)
  })

  it('diagonale dégagée → true', () => {
    expect(hasLineOfSight(makeGrid(5, 5), { x: 0, y: 0 }, { x: 4, y: 4 })).toBe(true)
  })

  it('obstacle sur la diagonale → false', () => {
    const grid = makeGrid(5, 5, ['2,2'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 4 })).toBe(false)
  })

  it('ligne oblique dégagée → true', () => {
    expect(hasLineOfSight(makeGrid(5, 3), { x: 0, y: 0 }, { x: 4, y: 2 })).toBe(true)
  })

  it('obstacle sur la ligne oblique → false', () => {
    // Tracé (0,0)→(4,2) passe par (2,1) — mur là → bloqué
    const grid = makeGrid(5, 3, ['2,1'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 2 })).toBe(false)
  })

  it('Bresenham ne teste pas les cases adjacentes à la diagonale (comportement connu)', () => {
    // La ligne (0,0)→(2,2) passe par (1,1) uniquement.
    // Les cases (1,0) et (0,1) sont des murs, mais Bresenham ne les visite pas :
    // il "coupe" les coins en diagonale. LOS = true malgré les murs adjacents.
    const grid = makeGrid(3, 3, ['1,0', '0,1'])
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(true)
  })

  it('symétrie : LOS de A→B == LOS de B→A', () => {
    const grid = makeGrid(7, 7, ['3,2'])
    const a = { x: 0, y: 0 }
    const b = { x: 6, y: 4 }
    expect(hasLineOfSight(grid, a, b)).toBe(hasLineOfSight(grid, b, a))
  })
})
