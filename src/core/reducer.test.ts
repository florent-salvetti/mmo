import { describe, it, expect } from 'vitest'
import { applyAction } from './reducer'
import type { Cell, Entity, GameState } from '../shared/types'

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
  id: string, x: number, y: number,
  team: 'player' | 'enemy' = 'player',
  mp = 3,
): Entity {
  return {
    id, name: id, team,
    position: { x, y },
    hp: 10, maxHp: 10,
    ap: 6, maxAp: 6,
    mp, maxMp: mp,
  }
}

function makeState(entities: Entity[], overrides: Partial<GameState> = {}): GameState {
  return {
    grid: makeGrid(7, 7),
    entities,
    currentEntityId: entities[0]!.id,
    turn: 1,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// MOVE
// ---------------------------------------------------------------------------

describe('applyAction — MOVE', () => {

  it('déplace l\'entité sur la case cible', () => {
    const state = makeState([makeEntity('p', 3, 3, 'player', 3)])
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 4, y: 3 } })
    expect(next.entities.find(e => e.id === 'p')!.position).toEqual({ x: 4, y: 3 })
  })

  it('décrémente les PM du coût réel (1 pas → -1 PM)', () => {
    const state = makeState([makeEntity('p', 3, 3, 'player', 3)])
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 4, y: 3 } })
    expect(next.entities.find(e => e.id === 'p')!.mp).toBe(2)
  })

  it('décrémente les PM du coût réel (3 pas → -3 PM)', () => {
    const state = makeState([makeEntity('p', 0, 0, 'player', 3)])
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 3, y: 0 } })
    expect(next.entities.find(e => e.id === 'p')!.mp).toBe(0)
  })

  it('retourne l\'état inchangé (même référence) si la case est hors portée', () => {
    const state = makeState([makeEntity('p', 0, 0, 'player', 1)])
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 5, y: 0 } })
    expect(next).toBe(state)
  })

  it('retourne l\'état inchangé si les PM sont épuisés', () => {
    const state = makeState([makeEntity('p', 3, 3, 'player', 0)])
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 4, y: 3 } })
    expect(next).toBe(state)
  })

  it('retourne l\'état inchangé si l\'entityId est inconnu', () => {
    const state = makeState([makeEntity('p', 3, 3)])
    const next  = applyAction(state, { type: 'MOVE', entityId: 'fantome', to: { x: 4, y: 3 } })
    expect(next).toBe(state)
  })

  it('retourne l\'état inchangé si ce n\'est pas le tour de cette entité', () => {
    const p1    = makeEntity('p1', 0, 0, 'player')
    const p2    = makeEntity('p2', 6, 6, 'player')
    const state = makeState([p1, p2], { currentEntityId: 'p1' })
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p2', to: { x: 5, y: 6 } })
    expect(next).toBe(state)
  })

  it('refuse de se déplacer sur une case ennemie', () => {
    const player = makeEntity('p', 0, 0, 'player')
    const enemy  = makeEntity('e', 1, 0, 'enemy')
    const state  = makeState([player, enemy])
    const next   = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 1, y: 0 } })
    expect(next).toBe(state)
  })

  it('refuse de se déplacer sur une case alliée', () => {
    const p1    = makeEntity('p1', 0, 0, 'player')
    const p2    = makeEntity('p2', 1, 0, 'player')
    const state = makeState([p1, p2], { currentEntityId: 'p1' })
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p1', to: { x: 1, y: 0 } })
    expect(next).toBe(state)
  })

  it('ne modifie pas les autres entités (même référence objet)', () => {
    const player = makeEntity('p', 0, 0, 'player')
    const enemy  = makeEntity('e', 6, 6, 'enemy')
    const state  = makeState([player, enemy])
    const next   = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 1, y: 0 } })
    expect(next.entities.find(e => e.id === 'e')).toBe(enemy)
  })

  it('ne modifie pas la grille ni le numéro de tour', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    const next  = applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 1, y: 0 } })
    expect(next.grid).toBe(state.grid)
    expect(next.turn).toBe(state.turn)
  })

})

// ---------------------------------------------------------------------------
// Actions non encore implémentées
// ---------------------------------------------------------------------------

describe('applyAction — END_TURN', () => {
  it('retourne l\'état inchangé (non implémenté)', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    expect(applyAction(state, { type: 'END_TURN', entityId: 'p' })).toBe(state)
  })
})

describe('applyAction — USE_SPELL', () => {
  it('retourne l\'état inchangé (non implémenté)', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    const action = { type: 'USE_SPELL' as const, entityId: 'p', spellId: 's1', target: { x: 1, y: 0 } }
    expect(applyAction(state, action)).toBe(state)
  })
})
