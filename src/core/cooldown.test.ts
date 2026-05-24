import { describe, it, expect } from 'vitest'
import type { Cell, Entity, GameState } from '../../src/shared/types'
import { applyAction } from './reducer'
import { tryApplySpell, getSpell } from './spells'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(w: number, h: number): Cell[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({ position: { x, y }, walkable: true })),
  )
}

function player(x = 1, y = 1, ap = 6): Entity {
  return { id: 'player', name: 'Hero', team: 'player', position: { x, y },
    hp: 100, maxHp: 100, ap, maxAp: ap, mp: 3, maxMp: 3 }
}

function enemy(x = 8, y = 8): Entity {
  return { id: 'enemy', name: 'Mob', team: 'enemy', position: { x, y },
    hp: 40, maxHp: 40, ap: 4, maxAp: 4, mp: 2, maxMp: 2 }
}

function makeState(entities: Entity[], currentEntityId = 'player'): GameState {
  return { grid: makeGrid(10, 10), entities, currentEntityId, turn: 1, status: 'ongoing' }
}

const CHARGE  = getSpell('charge')!
const COUP    = getSpell('coup-epee')!

// ---------------------------------------------------------------------------
// Validation — sort sans cooldown
// ---------------------------------------------------------------------------

describe('cooldown — sort sans cooldown (coup-epee)', () => {
  it('toujours lançable, aucun cooldown armé après lancement', () => {
    // Ennemi adjacent en (1,2), portée 1 OK pour coup-epee (range 1-1).
    const mob: Entity = { ...enemy(), position: { x: 1, y: 2 }, hp: 80, maxHp: 80 }
    const state = makeState([player(1, 1, 10), mob])

    const r1 = tryApplySpell(state, 'player', COUP, { x: 1, y: 2 })
    expect(r1.valid).toBe(true)
    if (!r1.valid) return

    const caster1 = r1.nextState.entities.find(e => e.id === 'player')!
    expect(caster1.cooldowns).toBeUndefined()   // aucun cooldown armé

    // 2e lancer dans le même tour (AP 10-3=7, suffit encore)
    const r2 = tryApplySpell(r1.nextState, 'player', COUP, { x: 1, y: 2 })
    expect(r2.valid).toBe(true)   // pas bloqué par cooldown
  })
})

// ---------------------------------------------------------------------------
// Validation — cooldown de la charge
// ---------------------------------------------------------------------------

describe('cooldown — charge (cooldown = 2)', () => {
  it('lançable au 1er tour (cooldowns absent)', () => {
    const state = makeState([player(), enemy()])
    const result = tryApplySpell(state, 'player', CHARGE, { x: 1, y: 3 })
    expect(result.valid).toBe(true)
  })

  it('cooldown armé à 2 immédiatement après lancement', () => {
    const state = makeState([player(), enemy()])
    const result = tryApplySpell(state, 'player', CHARGE, { x: 1, y: 3 })
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const caster = result.nextState.entities.find(e => e.id === 'player')!
    expect(caster.cooldowns?.['charge']).toBe(2)
  })

  it('refusé dans le même tour (cooldown = 2, encore actif)', () => {
    // Simuler l'état avec cooldown déjà armé à 2 (= vient d'être lancé).
    const p: Entity = { ...player(), cooldowns: { charge: 2 } }
    const state = makeState([p, enemy()])
    const result = tryApplySpell(state, 'player', CHARGE, { x: 1, y: 3 })
    expect(result.valid).toBe(false)
  })

  it('refusé quand cooldown = 1 (1 tour restant)', () => {
    const p: Entity = { ...player(), cooldowns: { charge: 1 } }
    const state = makeState([p, enemy()])
    const result = tryApplySpell(state, 'player', CHARGE, { x: 1, y: 3 })
    expect(result.valid).toBe(false)
  })

  it('lançable quand cooldowns est vide (cooldown expiré)', () => {
    const p: Entity = { ...player(), cooldowns: {} }
    const state = makeState([p, enemy()])
    const result = tryApplySpell(state, 'player', CHARGE, { x: 1, y: 3 })
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Décompte par tour d'entité
// ---------------------------------------------------------------------------

describe('cooldown — décompte tour par tour', () => {
  it('END_TURN décrémente les cooldowns de l\'entité ENTRANTE (pas celle qui finit)', () => {
    // Player lance charge → cooldowns.charge = 2.
    const initialState = makeState([player(), enemy()])
    let state = applyAction(initialState, {
      type: 'USE_SPELL', entityId: 'player', spellId: 'charge', target: { x: 1, y: 3 },
    })
    expect(state.entities.find(e => e.id === 'player')!.cooldowns?.['charge']).toBe(2)

    // Player finit son tour → enemy prend la main.
    // Les cooldowns de PLAYER ne bougent pas (c'est l'enemy qui entre, pas le player).
    state = applyAction(state, { type: 'END_TURN', entityId: 'player' })
    expect(state.currentEntityId).toBe('enemy')
    expect(state.entities.find(e => e.id === 'player')!.cooldowns?.['charge']).toBe(2)

    // Enemy finit son tour → player reprend la main.
    // Les cooldowns du PLAYER sont décrémentés (2 → 1).
    state = applyAction(state, { type: 'END_TURN', entityId: 'enemy' })
    expect(state.currentEntityId).toBe('player')
    expect(state.entities.find(e => e.id === 'player')!.cooldowns?.['charge']).toBe(1)
  })

  it('cooldown expire et disparaît du Record après le 2e décompte', () => {
    // Partir avec cooldowns.charge = 1 et simuler END_TURN → player.
    const p: Entity = { ...player(), cooldowns: { charge: 1 } }
    const state = makeState([p, enemy()], 'enemy')   // c'est le tour de l'ennemi
    const next = applyAction(state, { type: 'END_TURN', entityId: 'enemy' })

    // Le player reprend la main : son cooldown charge passe 1 → 0 → retiré.
    expect(next.currentEntityId).toBe('player')
    expect(next.entities.find(e => e.id === 'player')!.cooldowns).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Cycle complet
// ---------------------------------------------------------------------------

describe('cooldown — cycle complet (charge cooldown = 2)', () => {
  it('charge indisponible pendant 2 tours de l\'entité, disponible au 3e', () => {
    let state = makeState([player(), enemy()])

    // Tour 1 (player) : lance charge → atterrit en (1,3).
    state = applyAction(state, {
      type: 'USE_SPELL', entityId: 'player', spellId: 'charge', target: { x: 1, y: 3 },
    })
    expect(state.entities.find(e => e.id === 'player')!.cooldowns?.['charge']).toBe(2)

    // Fin du tour player → début du tour enemy (cooldowns player inchangés).
    state = applyAction(state, { type: 'END_TURN', entityId: 'player' })

    // Fin du tour enemy → début du tour player (cooldown 2 → 1).
    state = applyAction(state, { type: 'END_TURN', entityId: 'enemy' })
    expect(state.currentEntityId).toBe('player')
    // Tour player 2 : charge refusée (cooldown = 1).
    const attempt1 = applyAction(state, {
      type: 'USE_SPELL', entityId: 'player', spellId: 'charge', target: { x: 1, y: 5 },
    })
    expect(attempt1).toBe(state)   // état inchangé = refus

    // Fin du tour player → début du tour enemy.
    state = applyAction(state, { type: 'END_TURN', entityId: 'player' })

    // Fin du tour enemy → début du tour player (cooldown 1 → 0 → retiré).
    state = applyAction(state, { type: 'END_TURN', entityId: 'enemy' })
    expect(state.currentEntityId).toBe('player')
    expect(state.entities.find(e => e.id === 'player')!.cooldowns).toBeUndefined()

    // Tour player 3 : charge de nouveau disponible (depuis (1,3) vers (1,5)).
    const attempt2 = applyAction(state, {
      type: 'USE_SPELL', entityId: 'player', spellId: 'charge', target: { x: 1, y: 5 },
    })
    expect(attempt2).not.toBe(state)   // état changé = succès
    expect(attempt2.entities.find(e => e.id === 'player')!.cooldowns?.['charge']).toBe(2)
  })
})
