import { describe, it, expect } from 'vitest'
import type { Cell, Entity, GameState } from '../../src/shared/types'
import { tryApplySpell, getSpell } from './spells'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(w: number, h: number, blocked: string[] = []): Cell[][] {
  const set = new Set(blocked)
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      position: { x, y },
      walkable: !set.has(`${x},${y}`),
    })),
  )
}

function makeState(entities: Entity[], grid: Cell[][], casterId: string): GameState {
  return { grid, entities, currentEntityId: casterId, turn: 1, status: 'ongoing' }
}

function caster(x: number, y: number, ap = 6): Entity {
  return { id: 'hero', name: 'Hero', team: 'player', position: { x, y },
    hp: 100, maxHp: 100, ap, maxAp: ap, mp: 3, maxMp: 3 }
}

function enemy(id: string, x: number, y: number): Entity {
  return { id, name: id, team: 'enemy', position: { x, y },
    hp: 40, maxHp: 40, ap: 4, maxAp: 4, mp: 2, maxMp: 2 }
}

const SPELL = getSpell('charge')!

// ---------------------------------------------------------------------------
// Registre
// ---------------------------------------------------------------------------

describe('getSpell — charge', () => {
  it('retourne le sort avec les bonnes propriétés', () => {
    expect(SPELL).toBeDefined()
    expect(SPELL.id).toBe('charge')
    expect(SPELL.apCost).toBe(2)
    expect(SPELL.range.min).toBe(1)
    expect(SPELL.range.max).toBe(4)
    expect(SPELL.needsLineOfSight).toBe(false)
    expect(SPELL.effects[0]).toMatchObject({ type: 'dash', maxDistance: 2 })
  })
})

// ---------------------------------------------------------------------------
// Déplacement nominal
// ---------------------------------------------------------------------------

describe('charge — déplacement sur terrain libre', () => {
  it('avance de 2 cases en direction +x', () => {
    const grid = makeGrid(6, 6)
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 3, y: 2 })
  })

  it('avance de 1 case quand seule la 1ère case est libre (mur à la 2e)', () => {
    const grid = makeGrid(6, 6, ['3,2'])  // mur à (3,2)
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
  })

  it('ne bouge pas si la 1ère case est un mur (PA quand même dépensés)', () => {
    const grid = makeGrid(6, 6, ['2,2'])  // mur immédiatement devant
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 3, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 1, y: 2 })        // n'a pas bougé
    expect(hero.ap).toBe(6 - SPELL.apCost)               // PA dépensés
  })
})

// ---------------------------------------------------------------------------
// Blocage par entité
// ---------------------------------------------------------------------------

describe('charge — blocage par une entité vivante', () => {
  it('s\'arrête avant une entité à la 2e case', () => {
    const grid = makeGrid(6, 6)
    const state = makeState([caster(1, 2), enemy('mob', 3, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
  })

  it('ne bouge pas si une entité occupe la 1ère case', () => {
    const grid = makeGrid(6, 6)
    const state = makeState([caster(1, 2), enemy('mob', 2, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 1, y: 2 })
  })

  it('ne bloque pas sur une entité morte (hp = 0)', () => {
    const grid = makeGrid(6, 6)
    const dead = { ...enemy('mob', 2, 2), hp: 0 }
    const state = makeState([caster(1, 2), dead], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 3, y: 2 })  // passe par-dessus le mort
  })
})

// ---------------------------------------------------------------------------
// 4 directions
// ---------------------------------------------------------------------------

describe('charge — 4 directions cardinales', () => {
  const grid = makeGrid(7, 7)

  it.each([
    ['est  (+x)', { x: 5, y: 3 }, { x: 5, y: 3 }],
    ['ouest (-x)', { x: 1, y: 3 }, { x: 1, y: 3 }],
    ['sud  (+y)', { x: 3, y: 5 }, { x: 3, y: 5 }],
    ['nord (-y)', { x: 3, y: 1 }, { x: 3, y: 1 }],
  ])('charge vers %s', (_dir, target, expected) => {
    const state = makeState([caster(3, 3)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, target)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual(expected)
  })
})

// ---------------------------------------------------------------------------
// Validations — cas refusés
// ---------------------------------------------------------------------------

describe('charge — validations', () => {
  const grid = makeGrid(6, 6)

  it('refusée si cible en diagonale', () => {
    const state = makeState([caster(2, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 4 })
    expect(result.valid).toBe(false)
  })

  it('refusée si cible en diagonale (dx ≠ 0 et dy ≠ 0, petite distance)', () => {
    const state = makeState([caster(2, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 3, y: 3 })
    expect(result.valid).toBe(false)
  })

  it('refusée si PA insuffisants', () => {
    const state = makeState([caster(2, 2, 1)], grid, 'hero')  // ap=1 < coût=2
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(false)
  })

  it('refusée si cible hors portée', () => {
    const bigGrid = makeGrid(12, 12)
    const state = makeState([caster(0, 0)], bigGrid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 0, y: 6 })  // dist=6 > max=4
    expect(result.valid).toBe(false)
  })

  it('les PA sont décrémentés du coût exact', () => {
    const state = makeState([caster(2, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.ap).toBe(6 - SPELL.apCost)
  })
})
