import { describe, it, expect } from 'vitest'
import { createGameStateFromMap } from './mapLoader'
import type { MapDefinition } from '../shared/types'
import combat01Raw from '../../data/maps/combat-01.json'

const combat01 = combat01Raw as unknown as MapDefinition

// Map minimale pour tester la logique sans dépendre des données réelles.
const testDef: MapDefinition = {
  id: 'test',
  width: 5,
  height: 4,
  obstacles: [
    { x: 2, y: 1, type: 'hole' },
    { x: 3, y: 2, type: 'cube' },
  ],
  player: {
    id: 'p1', name: 'Hero',
    startPosition: { x: 0, y: 0 },
    hp: 100, maxHp: 100,
    ap: 6,   maxAp: 6,
    mp: 3,   maxMp: 3,
  },
  enemies: [
    {
      id: 'e1', name: 'Goblin', creatureType: 'goblin',
      startPosition: { x: 4, y: 3 },
      hp: 30, maxHp: 30,
      ap: 4,  maxAp: 4,
      mp: 2,  maxMp: 2,
    },
  ],
}

describe('createGameStateFromMap — grille', () => {
  it('produit les bonnes dimensions', () => {
    const state = createGameStateFromMap(testDef)
    expect(state.grid.length).toBe(4)
    expect(state.grid[0].length).toBe(5)
  })

  it('indexe les cases par grid[y][x]', () => {
    const state = createGameStateFromMap(testDef)
    expect(state.grid[2][3].position).toEqual({ x: 3, y: 2 })
  })

  it('place un obstacle hole correctement', () => {
    const state = createGameStateFromMap(testDef)
    const cell = state.grid[1][2]  // y=1, x=2
    expect(cell.obstacle).toBe('hole')
    expect(cell.walkable).toBe(false)
  })

  it('place un obstacle cube correctement', () => {
    const state = createGameStateFromMap(testDef)
    const cell = state.grid[2][3]  // y=2, x=3
    expect(cell.obstacle).toBe('cube')
    expect(cell.walkable).toBe(false)
  })

  it('les cases sans obstacle sont marchables', () => {
    const state = createGameStateFromMap(testDef)
    const cell = state.grid[0][0]
    expect(cell.obstacle).toBeUndefined()
    expect(cell.walkable).toBe(true)
  })
})

describe('createGameStateFromMap — entités', () => {
  it('crée le joueur avec la bonne position et les bons stats', () => {
    const state = createGameStateFromMap(testDef)
    const player = state.entities.find(e => e.team === 'player')!
    expect(player.id).toBe('p1')
    expect(player.name).toBe('Hero')
    expect(player.position).toEqual({ x: 0, y: 0 })
    expect(player.hp).toBe(100)
    expect(player.ap).toBe(6)
    expect(player.mp).toBe(3)
  })

  it('crée les ennemis avec la bonne position et les bons stats', () => {
    const state = createGameStateFromMap(testDef)
    const enemy = state.entities.find(e => e.team === 'enemy')!
    expect(enemy.id).toBe('e1')
    expect(enemy.creatureType).toBe('goblin')
    expect(enemy.position).toEqual({ x: 4, y: 3 })
    expect(enemy.hp).toBe(30)
  })

  it('le joueur est en premier dans la liste des entités', () => {
    const state = createGameStateFromMap(testDef)
    expect(state.entities[0].team).toBe('player')
  })
})

describe('createGameStateFromMap — état initial', () => {
  it('démarre au tour 1 avec le joueur comme entité courante', () => {
    const state = createGameStateFromMap(testDef)
    expect(state.turn).toBe(1)
    expect(state.currentEntityId).toBe('p1')
    expect(state.status).toBe('ongoing')
  })
})

describe('createGameStateFromMap — combat-01 (données réelles)', () => {
  it('produit une grille 12×12', () => {
    const state = createGameStateFromMap(combat01)
    expect(state.grid.length).toBe(12)
    expect(state.grid[0].length).toBe(12)
  })

  it('place les 3 trous (hole) et 4 cubes', () => {
    const state = createGameStateFromMap(combat01)
    const holes = state.grid.flat().filter(c => c.obstacle === 'hole')
    const cubes = state.grid.flat().filter(c => c.obstacle === 'cube')
    expect(holes).toHaveLength(3)
    expect(cubes).toHaveLength(4)
  })

  it('crée Kirito à (1,1) avec 100 PV', () => {
    const state = createGameStateFromMap(combat01)
    const kirito = state.entities.find(e => e.id === 'player-1')!
    expect(kirito.name).toBe('Kirito')
    expect(kirito.position).toEqual({ x: 1, y: 1 })
    expect(kirito.hp).toBe(100)
  })

  it('crée Sanglier A à (4,1) et Sanglier B à (5,7)', () => {
    const state = createGameStateFromMap(combat01)
    const a = state.entities.find(e => e.id === 'enemy-1')!
    const b = state.entities.find(e => e.id === 'enemy-2')!
    expect(a.position).toEqual({ x: 4, y: 1 })
    expect(b.position).toEqual({ x: 5, y: 7 })
    expect(a.creatureType).toBe('sanglier')
  })

  it('démarre avec Kirito comme entité courante', () => {
    const state = createGameStateFromMap(combat01)
    expect(state.currentEntityId).toBe('player-1')
  })
})
