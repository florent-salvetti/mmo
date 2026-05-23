import { describe, it, expect } from 'vitest'
import { tryApplySpell, getSpell } from './spells'
import { applyAction } from './reducer'
import type { Cell, Entity, GameState, Spell } from '../shared/types'

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
  ap = 6, hp = 50,
): Entity {
  return {
    id, name: id, team,
    position: { x, y },
    hp, maxHp: hp,
    ap, maxAp: ap,
    mp: 3, maxMp: 3,
  }
}

function makeState(entities: Entity[], grid?: Cell[][]): GameState {
  return {
    grid: grid ?? makeGrid(7, 7),
    entities,
    currentEntityId: entities[0]!.id,
    turn: 1,
  }
}

// Sort de test : portée 1–3, pas de LOS, 10 dégâts, coût 2 PA
const SPELL: Spell = {
  id: 'test', name: 'Test',
  apCost: 2,
  range: { min: 1, max: 3 },
  needsLineOfSight: false,
  effects: [{ type: 'damage', value: 10 }],
}

const SPELL_LOS: Spell = { ...SPELL, id: 'test-los', needsLineOfSight: true }

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('tryApplySpell — validation', () => {
  it('caster introuvable → invalid', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    expect(tryApplySpell(state, 'inconnu', SPELL, { x: 1, y: 0 }).valid).toBe(false)
  })

  it('case cible hors de la grille → invalid', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    expect(tryApplySpell(state, 'p', SPELL, { x: 99, y: 0 }).valid).toBe(false)
  })

  it('PA insuffisants → invalid', () => {
    const caster = makeEntity('p', 0, 0, 'player', 1) // 1 PA, sort coûte 2
    expect(tryApplySpell(makeState([caster]), 'p', SPELL, { x: 1, y: 0 }).valid).toBe(false)
  })

  it('cible hors portée maximale → invalid', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    // dist=4, range.max=3
    expect(tryApplySpell(state, 'p', SPELL, { x: 4, y: 0 }).valid).toBe(false)
  })

  it('cible sous la portée minimale (soi-même, dist=0) → invalid', () => {
    const state = makeState([makeEntity('p', 3, 3)])
    // dist=0, range.min=1
    expect(tryApplySpell(state, 'p', SPELL, { x: 3, y: 3 }).valid).toBe(false)
  })

  it('LOS requise et ligne bloquée par un mur → invalid', () => {
    // Caster(0,0) — MUR(1,0) — cible(2,0) : ligne de vue coupée
    const state = makeState([makeEntity('p', 0, 0)], makeGrid(5, 1, ['1,0']))
    expect(tryApplySpell(state, 'p', SPELL_LOS, { x: 2, y: 0 }).valid).toBe(false)
  })

  it('LOS non requise avec mur entre les deux → valid', () => {
    const state = makeState([makeEntity('p', 0, 0)], makeGrid(5, 1, ['1,0']))
    expect(tryApplySpell(state, 'p', SPELL, { x: 2, y: 0 }).valid).toBe(true)
  })

  it('LOS requise et ligne dégagée → valid', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    expect(tryApplySpell(state, 'p', SPELL_LOS, { x: 2, y: 0 }).valid).toBe(true)
  })

  it('cible exactement à portée maximale → valid', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    // dist=3, range.max=3 → juste dans la portée
    expect(tryApplySpell(state, 'p', SPELL, { x: 3, y: 0 }).valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Effets appliqués
// ---------------------------------------------------------------------------

describe('tryApplySpell — effets', () => {
  it('les PA du lanceur sont décrémentés du coût exact', () => {
    const state  = makeState([makeEntity('p', 0, 0, 'player', 6)])
    const result = tryApplySpell(state, 'p', SPELL, { x: 1, y: 0 }) // coûte 2 PA
    if (!result.valid) throw new Error('attendu valid')
    expect(result.nextState.entities.find(e => e.id === 'p')!.ap).toBe(4)
  })

  it('les dégâts réduisent les PV de l\'entité sur la case cible', () => {
    const caster = makeEntity('p', 0, 0, 'player', 6, 50)
    const target = makeEntity('e', 1, 0, 'enemy',  6, 50)
    const result = tryApplySpell(makeState([caster, target]), 'p', SPELL, { x: 1, y: 0 })
    if (!result.valid) throw new Error('attendu valid')
    expect(result.nextState.entities.find(e => e.id === 'e')!.hp).toBe(40)
  })

  it('les PV ne tombent pas en dessous de 0', () => {
    const caster = makeEntity('p', 0, 0, 'player', 6, 50)
    const target = makeEntity('e', 1, 0, 'enemy',  6, 5) // 5 PV < 10 dégâts
    const result = tryApplySpell(makeState([caster, target]), 'p', SPELL, { x: 1, y: 0 })
    if (!result.valid) throw new Error('attendu valid')
    expect(result.nextState.entities.find(e => e.id === 'e')!.hp).toBe(0)
  })

  it('case vide : sort valide, PA dépensés, aucun PV changé', () => {
    const caster = makeEntity('p', 0, 0, 'player', 6, 50)
    const result = tryApplySpell(makeState([caster]), 'p', SPELL, { x: 1, y: 0 })
    if (!result.valid) throw new Error('attendu valid')
    expect(result.nextState.entities.find(e => e.id === 'p')!.ap).toBe(4)
    expect(result.nextState.entities.find(e => e.id === 'p')!.hp).toBe(50)
  })

  it('effets multiples appliqués en séquence', () => {
    const DOUBLE: Spell = {
      ...SPELL,
      effects: [{ type: 'damage', value: 10 }, { type: 'damage', value: 15 }],
    }
    const caster = makeEntity('p', 0, 0, 'player', 6, 50)
    const target = makeEntity('e', 1, 0, 'enemy',  6, 50)
    const result = tryApplySpell(makeState([caster, target]), 'p', DOUBLE, { x: 1, y: 0 })
    if (!result.valid) throw new Error('attendu valid')
    expect(result.nextState.entities.find(e => e.id === 'e')!.hp).toBe(25) // 50-10-15
  })

  it('les entités hors de la case cible ne sont pas affectées', () => {
    const caster    = makeEntity('p',  0, 0, 'player', 6, 50)
    const target    = makeEntity('e1', 1, 0, 'enemy',  6, 50)
    const bystander = makeEntity('e2', 5, 5, 'enemy',  6, 50)
    const result    = tryApplySpell(makeState([caster, target, bystander]), 'p', SPELL, { x: 1, y: 0 })
    if (!result.valid) throw new Error('attendu valid')
    expect(result.nextState.entities.find(e => e.id === 'e2')!.hp).toBe(50)
  })

  it('la grille et le numéro de tour restent inchangés', () => {
    const state  = makeState([makeEntity('p', 0, 0)])
    const result = tryApplySpell(state, 'p', SPELL, { x: 1, y: 0 })
    if (!result.valid) throw new Error('attendu valid')
    expect(result.nextState.grid).toBe(state.grid)
    expect(result.nextState.turn).toBe(state.turn)
  })
})

// ---------------------------------------------------------------------------
// Registre : sort chargé depuis JSON
// ---------------------------------------------------------------------------

describe('getSpell — registre', () => {
  it('retourne le sort coup-epee avec les bonnes données', () => {
    const spell = getSpell('coup-epee')
    expect(spell).toBeDefined()
    expect(spell!.apCost).toBe(3)
    expect(spell!.range).toEqual({ min: 1, max: 1 })
    expect(spell!.needsLineOfSight).toBe(true)
    expect(spell!.effects).toHaveLength(1)
    expect(spell!.effects[0]).toEqual({ type: 'damage', value: 12 })
  })

  it('retourne undefined pour un id inconnu', () => {
    expect(getSpell('sort-inexistant')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Intégration : coup-epee via applyAction
// ---------------------------------------------------------------------------

describe('applyAction USE_SPELL — coup-epee', () => {
  it('coup valide : PA décrémentes, ennemi blessé', () => {
    const player = makeEntity('p', 2, 2, 'player', 6, 100)
    const enemy  = makeEntity('e', 2, 3, 'enemy',  4, 40)
    const state  = makeState([player, enemy])
    // dist=1, range [1,1], LOS dégagée → valide
    const next = applyAction(state, {
      type: 'USE_SPELL', entityId: 'p', spellId: 'coup-epee', target: { x: 2, y: 3 },
    })
    expect(next.entities.find(e => e.id === 'p')!.ap).toBe(3)  // 6-3
    expect(next.entities.find(e => e.id === 'e')!.hp).toBe(28) // 40-12
  })

  it('ennemi trop loin (dist=2, maxRange=1) → état inchangé', () => {
    const state = makeState([makeEntity('p', 2, 2, 'player', 6, 100), makeEntity('e', 2, 4, 'enemy')])
    const next  = applyAction(state, {
      type: 'USE_SPELL', entityId: 'p', spellId: 'coup-epee', target: { x: 2, y: 4 },
    })
    expect(next).toBe(state)
  })

  it('LOS bloquée par un mur → état inchangé', () => {
    // Mur en (2,3) entre (2,2) et (2,4) — mais maxRange=1 donc impossible d'atteindre (2,4)
    // On teste plutôt : caster en (0,0), mur en (1,0), mais maxRange=1 donc caster ne peut
    // atteindre que (1,0) qui est le mur lui-même → case non-walkable → pas de problème LOS.
    // Cas plus intéressant : sort avec portée 2, LOS bloquée.
    // On utilise directement tryApplySpell avec SPELL_LOS.
    const state = makeState(
      [makeEntity('p', 0, 0, 'player', 6)],
      makeGrid(5, 1, ['1,0']),
    )
    const result = tryApplySpell(state, 'p', SPELL_LOS, { x: 2, y: 0 })
    expect(result.valid).toBe(false)
  })

  it('id de sort inconnu → état inchangé (même référence)', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    const next  = applyAction(state, {
      type: 'USE_SPELL', entityId: 'p', spellId: 'magie-noire', target: { x: 1, y: 0 },
    })
    expect(next).toBe(state)
  })

  it('pas le tour de cette entité → état inchangé', () => {
    const p1    = makeEntity('p1', 0, 0, 'player', 6)
    const p2    = makeEntity('p2', 3, 3, 'player', 6)
    const state = { ...makeState([p1, p2]), currentEntityId: 'p1' }
    const next  = applyAction(state, {
      type: 'USE_SPELL', entityId: 'p2', spellId: 'coup-epee', target: { x: 4, y: 3 },
    })
    expect(next).toBe(state)
  })
})
