import { describe, it, expect } from 'vitest'
import { getReachableCells } from './movement'
import type { Cell, Entity } from '../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(w: number, h: number, blocked: string[] = []): Cell[][] {
  const blockedSet = new Set(blocked)
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      position: { x, y },
      walkable: !blockedSet.has(`${x},${y}`),
    })),
  )
}

function makeEntity(
  id: string,
  x: number,
  y: number,
  team: 'player' | 'enemy',
): Entity {
  return {
    id, name: id, team,
    position: { x, y },
    hp: 10, maxHp: 10,
    ap: 6,  maxAp: 6,
    mp: 3,  maxMp: 3,
  }
}

function positions(cells: Cell[]): string[] {
  return cells.map(c => `${c.position.x},${c.position.y}`)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getReachableCells', () => {

  it('retourne vide si mp = 0', () => {
    const grid  = makeGrid(3, 3)
    const mover = makeEntity('m', 1, 1, 'player')
    expect(getReachableCells(grid, mover, [], 0)).toHaveLength(0)
  })

  it('n\'inclut pas la case de départ', () => {
    const grid  = makeGrid(3, 3)
    const mover = makeEntity('m', 1, 1, 'player')
    const pos   = positions(getReachableCells(grid, mover, [], 2))
    expect(pos).not.toContain('1,1')
  })

  it('depuis un coin avec mp=1, 2 cases atteignables', () => {
    // Depuis (0,0) dans une grille 3×3 : voisins walkables = (1,0) et (0,1)
    const grid  = makeGrid(3, 3)
    const mover = makeEntity('m', 0, 0, 'player')
    expect(getReachableCells(grid, mover, [], 1)).toHaveLength(2)
  })

  it('depuis le centre avec mp=1, 4 cases atteignables', () => {
    const grid  = makeGrid(3, 3)
    const mover = makeEntity('m', 1, 1, 'player')
    const pos   = positions(getReachableCells(grid, mover, [], 1))
    expect(pos).toContain('1,0')
    expect(pos).toContain('1,2')
    expect(pos).toContain('0,1')
    expect(pos).toContain('2,1')
    expect(pos).toHaveLength(4)
  })

  it('ne dépasse pas le budget de PM', () => {
    // Depuis (0,0) avec mp=1 : (2,0) est à 2 pas, inaccessible
    const grid  = makeGrid(5, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const pos   = positions(getReachableCells(grid, mover, [], 1))
    expect(pos).toContain('1,0')
    expect(pos).not.toContain('2,0')
  })

  it('un mur bloque le passage et les cases derrière', () => {
    // Ligne de 3 cases : (0,0) | MUR(1,0) | (2,0)
    const grid  = makeGrid(3, 1, ['1,0'])
    const mover = makeEntity('m', 0, 0, 'player')
    const pos   = positions(getReachableCells(grid, mover, [], 3))
    expect(pos).not.toContain('1,0')  // mur : inaccessible
    expect(pos).not.toContain('2,0')  // derrière le mur : inaccessible
  })

  it('un ennemi bloque le passage et les cases derrière', () => {
    // Ligne : (0,0) mover | (1,0) enemy | (2,0) libre
    const grid  = makeGrid(3, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const enemy = makeEntity('e', 1, 0, 'enemy')
    const pos   = positions(getReachableCells(grid, mover, [enemy], 3))
    expect(pos).not.toContain('1,0')  // ennemi : ni passable ni destination
    expect(pos).not.toContain('2,0')  // bloqué derrière l'ennemi
  })

  it('un ennemi sur une case latérale n\'est pas une destination', () => {
    // Grille 3×3, mover en (0,0), ennemi en (2,0)
    // On peut atteindre (1,0) mais pas (2,0) (ennemi)
    const grid  = makeGrid(5, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const enemy = makeEntity('e', 2, 0, 'enemy')
    const pos   = positions(getReachableCells(grid, mover, [enemy], 5))
    expect(pos).toContain('1,0')      // accessible avant l'ennemi
    expect(pos).not.toContain('2,0')  // ennemi : pas une destination
    expect(pos).not.toContain('3,0')  // bloqué derrière l'ennemi
    expect(pos).not.toContain('4,0')  // bloqué derrière l'ennemi
  })

  it('un allié bloque la destination mais pas le passage', () => {
    // Ligne : (0,0) mover | (1,0) allié | (2,0) libre
    const grid  = makeGrid(3, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const ally  = makeEntity('a', 1, 0, 'player')
    const pos   = positions(getReachableCells(grid, mover, [ally], 3))
    expect(pos).not.toContain('1,0')  // allié : pas une destination
    expect(pos).toContain('2,0')      // mais on peut passer au travers
  })

  it('on ne peut pas s\'arrêter sur un allié même avec suffisamment de PM', () => {
    const grid  = makeGrid(5, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const ally  = makeEntity('a', 3, 0, 'player')
    const pos   = positions(getReachableCells(grid, mover, [ally], 3))
    expect(pos).not.toContain('3,0')
    // (1,0) et (2,0) sont des destinations valides
    expect(pos).toContain('1,0')
    expect(pos).toContain('2,0')
  })

  it('plusieurs ennemis peuvent créer un couloir de blocage total', () => {
    //   (0,0) (1,0) (2,0)
    //   (0,1) (1,1) (2,1)   ← ligne entière d'ennemis
    //   (0,2) (1,2) (2,2)
    // Mover en (0,0) : les ennemis en (0,1),(1,0) bloquent tout
    const grid  = makeGrid(3, 3)
    const mover = makeEntity('m', 0, 0, 'player')
    const e1    = makeEntity('e1', 1, 0, 'enemy')
    const e2    = makeEntity('e2', 0, 1, 'enemy')
    const pos   = positions(getReachableCells(grid, mover, [e1, e2], 5))
    expect(pos).toHaveLength(0)  // totalement encerclé par des ennemis
  })

  it('contourne les obstacles pour atteindre une case', () => {
    // Grille 3×3 avec mur en (1,0) et (1,1) : on contourne par la ligne du bas
    //   (0,0) MUR   (2,0)
    //   (0,1) MUR   (2,1)
    //   (0,2) (1,2) (2,2)
    // Chemin : (0,0)→(0,1)→(0,2)→(1,2)→(2,2)→(2,1)→(2,0) = 6 pas
    const grid  = makeGrid(3, 3, ['1,0', '1,1'])
    const mover = makeEntity('m', 0, 0, 'player')
    const pos5  = positions(getReachableCells(grid, mover, [], 5))
    const pos6  = positions(getReachableCells(grid, mover, [], 6))
    // Avec mp=5 : on atteint (2,1) mais pas encore (2,0)
    expect(pos5).toContain('2,1')
    expect(pos5).not.toContain('2,0')
    // Avec mp=6 : on atteint (2,0) en ayant contourné les murs
    expect(pos6).toContain('2,0')
  })

})
