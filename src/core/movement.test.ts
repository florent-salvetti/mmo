import { describe, it, expect } from 'vitest'
import { getReachableCells, getPathDistances, type ReachableCell } from './movement'
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

function positions(results: ReachableCell[]): string[] {
  return results.map(r => `${r.cell.position.x},${r.cell.position.y}`)
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

  it('un allié vivant bloque le passage et sa case (comme un ennemi)', () => {
    // Ligne : (0,0) mover | (1,0) allié | (2,0) libre
    // L'allié bloque complètement : on ne peut ni le traverser ni s'y arrêter.
    const grid  = makeGrid(3, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const ally  = makeEntity('a', 1, 0, 'player')
    const pos   = positions(getReachableCells(grid, mover, [ally], 3))
    expect(pos).not.toContain('1,0')  // allié : case bloquée
    expect(pos).not.toContain('2,0')  // derrière l'allié : inaccessible
  })

  it('un allié devant soi bloque toutes les cases derrière lui', () => {
    // Ligne 5 cases : mover en (0,0), allié en (3,0) ; les cases (1,0) et (2,0) restent accessibles
    const grid  = makeGrid(5, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const ally  = makeEntity('a', 3, 0, 'player')
    const pos   = positions(getReachableCells(grid, mover, [ally], 3))
    expect(pos).not.toContain('3,0')  // allié bloque sa propre case
    expect(pos).toContain('1,0')      // avant l'allié : accessible
    expect(pos).toContain('2,0')      // avant l'allié : accessible
  })

  it('deux entités de même équipe se bloquent mutuellement le passage', () => {
    // Ligne : p1(0,0) | p2(1,0) | .(2,0)
    // p1 ne peut pas atteindre p2 ni les cases derrière lui.
    // p2 ne peut pas atteindre p1 non plus.
    const grid = makeGrid(3, 1)
    const p1   = makeEntity('p1', 0, 0, 'player')
    const p2   = makeEntity('p2', 1, 0, 'player')

    const posP1 = positions(getReachableCells(grid, p1, [p1, p2], 3))
    expect(posP1).not.toContain('1,0')  // p2 bloque
    expect(posP1).not.toContain('2,0')  // derrière p2 : inaccessible

    const posP2 = positions(getReachableCells(grid, p2, [p1, p2], 3))
    expect(posP2).not.toContain('0,0')  // p1 bloque
    expect(posP2).toContain('2,0')      // à droite (libre) : accessible
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

  it('expose le coût réel en nombre de pas BFS', () => {
    const grid  = makeGrid(5, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const results = getReachableCells(grid, mover, [], 3)
    const at = (x: number) => results.find(r => r.cell.position.x === x && r.cell.position.y === 0)
    expect(at(1)?.cost).toBe(1)
    expect(at(2)?.cost).toBe(2)
    expect(at(3)?.cost).toBe(3)
  })

  it('le coût reflète le chemin réel, pas la distance à vol d\'oiseau', () => {
    // (2,0) est à distance Manhattan 2 de (0,0), mais le chemin de contournement coûte 6
    const grid = makeGrid(3, 3, ['1,0', '1,1'])
    const mover = makeEntity('m', 0, 0, 'player')
    const results = getReachableCells(grid, mover, [], 6)
    const r = results.find(r => r.cell.position.x === 2 && r.cell.position.y === 0)
    expect(r?.cost).toBe(6)
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

  it('un ennemi mort (hp=0) ne bloque pas le passage', () => {
    // Ligne : (0,0) mover | (1,0) ennemi mort | (2,0) libre
    // Un ennemi vivant bloquerait (1,0) et (2,0) ; mort, il ne bloque rien.
    const grid  = makeGrid(3, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const dead  = { ...makeEntity('e', 1, 0, 'enemy'), hp: 0 }
    const pos   = positions(getReachableCells(grid, mover, [dead], 3))
    expect(pos).toContain('1,0')  // case de l'ennemi mort : traversable
    expect(pos).toContain('2,0')  // case derrière : accessible
  })

  it('un ennemi mort ne bloque pas non plus sa case comme destination', () => {
    // Contraste avec un ennemi vivant qui rend sa case inaccessible :
    // ici le mort doit être une destination valide.
    const grid  = makeGrid(3, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const dead  = { ...makeEntity('e', 1, 0, 'enemy'), hp: 0 }
    const pos   = positions(getReachableCells(grid, mover, [dead], 1))
    expect(pos).toContain('1,0')  // peut s'arrêter sur la case du mort
  })

  it('un allié mort ne bloque plus sa case comme destination', () => {
    // Un allié vivant interdit de s'y arrêter ; mort, sa case est libre.
    const grid  = makeGrid(3, 1)
    const mover = makeEntity('m', 0, 0, 'player')
    const dead  = { ...makeEntity('a', 1, 0, 'player'), hp: 0 }
    const pos   = positions(getReachableCells(grid, mover, [dead], 1))
    expect(pos).toContain('1,0')  // peut s'arrêter sur la case de l'allié mort
  })

})

// ---------------------------------------------------------------------------
// getPathDistances
// ---------------------------------------------------------------------------

describe('getPathDistances', () => {

  it('distance 0 depuis la case de départ', () => {
    const grid = makeGrid(3, 3)
    const dists = getPathDistances(grid, { x: 1, y: 1 })
    expect(dists.get('1,1')).toBe(0)
  })

  it('distances correctes sur une ligne droite sans obstacle', () => {
    const grid = makeGrid(5, 1)
    const dists = getPathDistances(grid, { x: 0, y: 0 })
    expect(dists.get('1,0')).toBe(1)
    expect(dists.get('2,0')).toBe(2)
    expect(dists.get('3,0')).toBe(3)
    expect(dists.get('4,0')).toBe(4)
  })

  it('distance réelle plus grande que Manhattan quand un mur force le contournement', () => {
    // Grille 3×3, murs en (1,0) et (1,1) — Manhattan (0,0)→(2,0) = 2, chemin réel = 6
    const grid = makeGrid(3, 3, ['1,0', '1,1'])
    const dists = getPathDistances(grid, { x: 0, y: 0 })
    expect(dists.get('2,0')).toBe(6)
  })

  it('une case inaccessible (coupée par les murs) est absente de la Map', () => {
    // Ligne de 3 cases avec mur au milieu : (0,0) | MUR(1,0) | (2,0)
    const grid = makeGrid(3, 1, ['1,0'])
    const dists = getPathDistances(grid, { x: 0, y: 0 })
    expect(dists.has('2,0')).toBe(false)
  })

  it('est symétrique : dist(A→B) === dist(B→A)', () => {
    const grid = makeGrid(3, 3, ['1,0', '1,1'])
    const fromA = getPathDistances(grid, { x: 0, y: 0 })
    const fromB = getPathDistances(grid, { x: 2, y: 0 })
    expect(fromA.get('2,0')).toBe(fromB.get('0,0'))
  })

})
