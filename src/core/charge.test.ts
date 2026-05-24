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

function ally(id: string, x: number, y: number): Entity {
  return { id, name: id, team: 'player', position: { x, y },
    hp: 50, maxHp: 50, ap: 4, maxAp: 4, mp: 3, maxMp: 3 }
}

const SPELL = getSpell('charge')!
const IMPACT = 10  // impactDamage dans charge.json

// ---------------------------------------------------------------------------
// Registre — propriétés du sort
// ---------------------------------------------------------------------------

describe('getSpell — charge', () => {
  it('retourne le sort avec les bonnes propriétés', () => {
    expect(SPELL).toBeDefined()
    expect(SPELL.id).toBe('charge')
    expect(SPELL.apCost).toBe(2)
    expect(SPELL.range.min).toBe(1)
    expect(SPELL.range.max).toBe(3)
    expect(SPELL.needsLineOfSight).toBe(false)
    expect(SPELL.cooldown).toBe(2)
    expect(SPELL.effects[0]).toMatchObject({ type: 'dash', maxDistance: 3, impactDamage: 10 })
  })
})

// ---------------------------------------------------------------------------
// Mode libre — déplacement sans dégâts (cible = case vide)
// ---------------------------------------------------------------------------

describe('charge — mode libre (déplacement)', () => {
  it('avance de 3 cases en direction +x sur terrain dégagé', () => {
    const grid = makeGrid(8, 8)
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 4, y: 2 })
  })

  it('avance de 2 cases quand un mur est à la 3e', () => {
    const grid = makeGrid(8, 8, ['4,2'])  // mur à (4,2)
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 3, y: 2 })
  })

  it('avance de 1 case quand la 2e est un mur', () => {
    const grid = makeGrid(8, 8, ['3,2'])  // mur à (3,2)
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
  })

  it('ne bouge pas si la 1ère case est un mur (PA quand même dépensés)', () => {
    const grid = makeGrid(8, 8, ['2,2'])
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 3, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 1, y: 2 })
    expect(hero.ap).toBe(6 - SPELL.apCost)
  })

  it('passe par-dessus une entité morte (hp = 0)', () => {
    const grid = makeGrid(8, 8)
    const dead = { ...enemy('mob', 2, 2), hp: 0 }
    const state = makeState([caster(1, 2), dead], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 4, y: 2 })  // 3 cases, passe par-dessus le mort
  })

  it('s\'arrête avant une entité vivante non ciblée (ennemi sur la trajectoire)', () => {
    // Ennemi à (3,2), cible libre à (4,2) → le caster s'arrête à (2,2).
    const grid = makeGrid(8, 8)
    const state = makeState([caster(1, 2), enemy('mob', 3, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
  })

  it('s\'arrête avant un allié (l\'allié n\'est pas touché)', () => {
    // Allié à (3,2), cible libre à (4,2) → caster s'arrête à (2,2), allié inchangé.
    const grid = makeGrid(8, 8)
    const allyEntity = ally('a', 3, 2)
    const state = makeState([caster(1, 2), allyEntity], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    const allyAfter = result.nextState.entities.find(e => e.id === 'a')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
    expect(allyAfter.hp).toBe(allyEntity.hp)
  })

  it('ne bouge pas si la 1ère case est occupée par une entité vivante', () => {
    const grid = makeGrid(8, 8)
    const state = makeState([caster(1, 2), enemy('mob', 2, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 1, y: 2 })
  })

  it('cible à 1 case : s\'arrête exactement à 1 case même si maxDistance = 3', () => {
    // Terrain entièrement libre, mais le joueur choisit de ne faire qu'1 pas.
    const grid = makeGrid(8, 8)
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 2, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
  })

  it('cible à 2 cases : s\'arrête exactement à 2 cases même si maxDistance = 3', () => {
    const grid = makeGrid(8, 8)
    const state = makeState([caster(1, 2)], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 3, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    expect(hero.position).toEqual({ x: 3, y: 2 })
  })
})

// ---------------------------------------------------------------------------
// Mode offensif — cible = case d'un adversaire vivant
// ---------------------------------------------------------------------------

describe('charge — mode offensif (ennemi ciblé directement)', () => {
  it('s\'arrête juste devant l\'ennemi ciblé et inflige les dégâts (ennemi à 3 cases)', () => {
    const grid = makeGrid(8, 8)
    const mob = enemy('mob', 4, 2)
    const state = makeState([caster(1, 2), mob], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    const mobAfter = result.nextState.entities.find(e => e.id === 'mob')!
    expect(hero.position).toEqual({ x: 3, y: 2 })
    expect(mobAfter.hp).toBe(mob.hp - IMPACT)
  })

  it('s\'arrête juste devant l\'ennemi ciblé et inflige les dégâts (ennemi à 2 cases)', () => {
    const grid = makeGrid(8, 8)
    const mob = enemy('mob', 3, 2)
    const state = makeState([caster(1, 2), mob], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 3, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    const mobAfter = result.nextState.entities.find(e => e.id === 'mob')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
    expect(mobAfter.hp).toBe(mob.hp - IMPACT)
  })

  it('ennemi adjacent (distance 1) : caster ne bouge pas mais inflige quand même les dégâts', () => {
    const grid = makeGrid(8, 8)
    const mob = enemy('mob', 2, 2)
    const state = makeState([caster(1, 2), mob], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 2, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    const mobAfter = result.nextState.entities.find(e => e.id === 'mob')!
    expect(hero.position).toEqual({ x: 1, y: 2 })  // immobile
    expect(mobAfter.hp).toBe(mob.hp - IMPACT)        // mais frappe quand même
  })

  it('mur entre caster et ennemi ciblé : caster bloqué au mur, ennemi non touché', () => {
    const grid = makeGrid(8, 8, ['3,2'])
    const mob = enemy('mob', 4, 2)
    const state = makeState([caster(1, 2), mob], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    const mobAfter = result.nextState.entities.find(e => e.id === 'mob')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
    expect(mobAfter.hp).toBe(mob.hp)  // ennemi non touché : mur interposé
  })

  it('allié entre caster et ennemi ciblé : caster bloqué par l\'allié, ennemi non touché', () => {
    const grid = makeGrid(8, 8)
    const allyEntity = ally('a', 3, 2)
    const mob = enemy('mob', 4, 2)
    const state = makeState([caster(1, 2), allyEntity, mob], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const hero = result.nextState.entities.find(e => e.id === 'hero')!
    const mobAfter = result.nextState.entities.find(e => e.id === 'mob')!
    const allyAfter = result.nextState.entities.find(e => e.id === 'a')!
    expect(hero.position).toEqual({ x: 2, y: 2 })
    expect(mobAfter.hp).toBe(mob.hp)    // ennemi non touché
    expect(allyAfter.hp).toBe(allyEntity.hp)  // allié non touché
  })

  it('seul l\'ennemi ciblé est touché, les autres ennemis sur la grille sont indemnes', () => {
    const grid = makeGrid(8, 8)
    const target = enemy('target', 3, 2)
    const bystander = enemy('other', 5, 2)
    const state = makeState([caster(1, 2), target, bystander], grid, 'hero')
    const result = tryApplySpell(state, 'hero', SPELL, { x: 3, y: 2 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const targetAfter = result.nextState.entities.find(e => e.id === 'target')!
    const bystanderAfter = result.nextState.entities.find(e => e.id === 'other')!
    expect(targetAfter.hp).toBe(target.hp - IMPACT)
    expect(bystanderAfter.hp).toBe(bystander.hp)
  })
})

// ---------------------------------------------------------------------------
// 4 directions cardinales (maxDistance = 3)
// ---------------------------------------------------------------------------

describe('charge — 4 directions cardinales', () => {
  const grid = makeGrid(7, 7)

  it.each([
    ['est  (+x)', { x: 6, y: 3 }, { x: 6, y: 3 }],
    ['ouest (-x)', { x: 0, y: 3 }, { x: 0, y: 3 }],
    ['sud  (+y)', { x: 3, y: 6 }, { x: 3, y: 6 }],
    ['nord (-y)', { x: 3, y: 0 }, { x: 3, y: 0 }],
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
  const grid = makeGrid(8, 8)

  it('refusée si cible en diagonale', () => {
    const state = makeState([caster(2, 2)], grid, 'hero')
    expect(tryApplySpell(state, 'hero', SPELL, { x: 4, y: 4 }).valid).toBe(false)
  })

  it('refusée si cible en diagonale (dx ≠ 0 et dy ≠ 0, petite distance)', () => {
    const state = makeState([caster(2, 2)], grid, 'hero')
    expect(tryApplySpell(state, 'hero', SPELL, { x: 3, y: 3 }).valid).toBe(false)
  })

  it('refusée si PA insuffisants', () => {
    const state = makeState([caster(2, 2, 1)], grid, 'hero')  // ap=1 < coût=2
    expect(tryApplySpell(state, 'hero', SPELL, { x: 4, y: 2 }).valid).toBe(false)
  })

  it('refusée si cible à distance 4 (= portée max + 1)', () => {
    const bigGrid = makeGrid(12, 12)
    const state = makeState([caster(0, 0)], bigGrid, 'hero')
    expect(tryApplySpell(state, 'hero', SPELL, { x: 0, y: 4 }).valid).toBe(false)
  })

  it('refusée si cible hors portée (distance 6)', () => {
    const bigGrid = makeGrid(12, 12)
    const state = makeState([caster(0, 0)], bigGrid, 'hero')
    expect(tryApplySpell(state, 'hero', SPELL, { x: 0, y: 6 }).valid).toBe(false)
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
