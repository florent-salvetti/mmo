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
    status: 'ongoing',
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
  it('passe au combattant suivant dans l\'ordre du tableau', () => {
    const p1    = makeEntity('p1', 0, 0)
    const p2    = makeEntity('p2', 1, 0)
    const state = makeState([p1, p2], { currentEntityId: 'p1' })
    const next  = applyAction(state, { type: 'END_TURN', entityId: 'p1' })
    expect(next.currentEntityId).toBe('p2')
  })

  it('restaure les PA et PM de l\'entité dont le tour commence', () => {
    const p1 = makeEntity('p1', 0, 0)  // maxAp=6, maxMp=3
    // p2 a dépensé des ressources
    const p2 = { ...makeEntity('p2', 1, 0), ap: 2, mp: 1 }
    const state = makeState([p1, p2], { currentEntityId: 'p1' })
    const next  = applyAction(state, { type: 'END_TURN', entityId: 'p1' })
    const p2After = next.entities.find(e => e.id === 'p2')!
    expect(p2After.ap).toBe(6)  // restauré à maxAp
    expect(p2After.mp).toBe(3)  // restauré à maxMp
  })

  it('ne modifie pas les PA/PM de l\'entité qui vient de finir son tour', () => {
    const p1 = { ...makeEntity('p1', 0, 0), ap: 3, mp: 1 }  // p1 a dépensé
    const p2 = makeEntity('p2', 1, 0)
    const state = makeState([p1, p2], { currentEntityId: 'p1' })
    const next  = applyAction(state, { type: 'END_TURN', entityId: 'p1' })
    const p1After = next.entities.find(e => e.id === 'p1')!
    expect(p1After.ap).toBe(3)  // inchangé
    expect(p1After.mp).toBe(1)  // inchangé
  })

  it('boucle au premier combattant après le dernier', () => {
    const p1    = makeEntity('p1', 0, 0)
    const p2    = makeEntity('p2', 1, 0)
    const state = makeState([p1, p2], { currentEntityId: 'p2' })
    const next  = applyAction(state, { type: 'END_TURN', entityId: 'p2' })
    expect(next.currentEntityId).toBe('p1')
  })

  it('incrémente le numéro de tour quand on revient au premier combattant', () => {
    const p1    = makeEntity('p1', 0, 0)
    const p2    = makeEntity('p2', 1, 0)
    const state = makeState([p1, p2], { currentEntityId: 'p2', turn: 1 })
    const next  = applyAction(state, { type: 'END_TURN', entityId: 'p2' })
    expect(next.turn).toBe(2)
  })

  it('ne change pas le tour si on n\'est pas encore au dernier combattant', () => {
    const p1    = makeEntity('p1', 0, 0)
    const p2    = makeEntity('p2', 1, 0)
    const state = makeState([p1, p2], { currentEntityId: 'p1', turn: 1 })
    const next  = applyAction(state, { type: 'END_TURN', entityId: 'p1' })
    expect(next.turn).toBe(1)
  })

  it('retourne l\'état inchangé si ce n\'est pas le tour de cette entité', () => {
    const p1    = makeEntity('p1', 0, 0)
    const p2    = makeEntity('p2', 1, 0)
    const state = makeState([p1, p2], { currentEntityId: 'p1' })
    expect(applyAction(state, { type: 'END_TURN', entityId: 'p2' })).toBe(state)
  })

  it('ne modifie pas la grille', () => {
    const state = makeState([makeEntity('p1', 0, 0), makeEntity('p2', 1, 0)])
    const next  = applyAction(state, { type: 'END_TURN', entityId: 'p1' })
    expect(next.grid).toBe(state.grid)
  })

  it('saute les entités mortes (hp=0)', () => {
    const p1 = makeEntity('p1', 0, 0)
    const p2 = { ...makeEntity('p2', 1, 0), hp: 0 }  // mort
    const p3 = makeEntity('p3', 2, 0)
    const next = applyAction(makeState([p1, p2, p3]), { type: 'END_TURN', entityId: 'p1' })
    expect(next.currentEntityId).toBe('p3')
  })

  it('saute plusieurs entités mortes d\'affilée', () => {
    const p1 = makeEntity('p1', 0, 0)
    const p2 = { ...makeEntity('p2', 1, 0), hp: 0 }
    const p3 = { ...makeEntity('p3', 2, 0), hp: 0 }
    const p4 = makeEntity('p4', 3, 0)
    const next = applyAction(makeState([p1, p2, p3, p4]), { type: 'END_TURN', entityId: 'p1' })
    expect(next.currentEntityId).toBe('p4')
  })
})

// ---------------------------------------------------------------------------
// Statut du combat
// ---------------------------------------------------------------------------

describe('applyAction — statut de combat', () => {
  it('status passe à "victory" quand le dernier ennemi tombe à 0 PV', () => {
    // makeEntity crée des entités avec hp=10, coup-epee fait 12 dégâts → mort
    const player = makeEntity('p', 0, 0, 'player')
    const enemy  = makeEntity('e', 1, 0, 'enemy')
    const state  = makeState([player, enemy])
    const next   = applyAction(state, {
      type: 'USE_SPELL', entityId: 'p', spellId: 'coup-epee', target: { x: 1, y: 0 },
    })
    expect(next.status).toBe('victory')
  })

  it('status passe à "defeat" quand le dernier joueur tombe à 0 PV', () => {
    const player = makeEntity('p', 1, 0, 'player')
    const enemy  = makeEntity('e', 0, 0, 'enemy')
    const state  = makeState([enemy, player], { currentEntityId: 'e' })
    const next   = applyAction(state, {
      type: 'USE_SPELL', entityId: 'e', spellId: 'coup-epee', target: { x: 1, y: 0 },
    })
    expect(next.status).toBe('defeat')
  })

  it('status reste "ongoing" tant que les deux camps ont des survivants', () => {
    const player = { ...makeEntity('p', 0, 0, 'player'), hp: 50, maxHp: 50 }
    const enemy  = { ...makeEntity('e', 1, 0, 'enemy'),  hp: 50, maxHp: 50 }
    const state  = makeState([player, enemy])
    const next   = applyAction(state, {
      type: 'USE_SPELL', entityId: 'p', spellId: 'coup-epee', target: { x: 1, y: 0 },
    })
    expect(next.status).toBe('ongoing')
  })

  it('aucune action n\'est appliquée si le combat est terminé (victory)', () => {
    const player = makeEntity('p', 0, 0)
    const state  = makeState([player], { status: 'victory' })
    expect(applyAction(state, { type: 'END_TURN', entityId: 'p' })).toBe(state)
    expect(applyAction(state, { type: 'MOVE', entityId: 'p', to: { x: 1, y: 0 } })).toBe(state)
  })

  it('aucune action n\'est appliquée si le combat est terminé (defeat)', () => {
    const enemy = makeEntity('e', 0, 0, 'enemy')
    const state = makeState([enemy], { status: 'defeat' })
    expect(applyAction(state, { type: 'END_TURN', entityId: 'e' })).toBe(state)
  })
})

describe('applyAction — USE_SPELL', () => {
  it('retourne l\'état inchangé pour un sort inconnu', () => {
    const state = makeState([makeEntity('p', 0, 0)])
    const action = { type: 'USE_SPELL' as const, entityId: 'p', spellId: 's1', target: { x: 1, y: 0 } }
    expect(applyAction(state, action)).toBe(state)
  })
})
