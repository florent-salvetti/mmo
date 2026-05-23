import { describe, it, expect } from 'vitest'
import { getAIAction } from './ai'
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
  ap = 6, mp = 3,
): Entity {
  return {
    id, name: id, team,
    position: { x, y },
    hp: 50, maxHp: 50,
    ap, maxAp: 6,
    mp, maxMp: 3,
  }
}

function makeState(entities: Entity[], grid?: Cell[][]): GameState {
  return {
    grid: grid ?? makeGrid(10, 10),
    entities,
    currentEntityId: entities[0]!.id,
    turn: 1,
  }
}

// ---------------------------------------------------------------------------
// Attaque
// ---------------------------------------------------------------------------

describe('getAIAction — attaque', () => {
  it('attaque le joueur adjacent si assez de PA', () => {
    // ennemi en (2,2), joueur en (2,3) — dist=1, portée [1,1] → USE_SPELL
    const enemy  = makeEntity('e', 2, 2, 'enemy', 6, 3)
    const player = makeEntity('p', 2, 3, 'player')
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.spellId).toBe('coup-epee')
    expect(action.target).toEqual({ x: 2, y: 3 })
  })

  it('n\'attaque pas si les PA sont insuffisants', () => {
    // 2 PA disponibles < 3 requis par coup-epee
    const enemy  = makeEntity('e', 2, 2, 'enemy', 2, 3)
    const player = makeEntity('p', 2, 3)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).not.toBe('USE_SPELL')
  })

  it('n\'attaque pas si le joueur est hors portée (dist=2, max=1)', () => {
    const enemy  = makeEntity('e', 0, 0, 'enemy', 6, 0)
    const player = makeEntity('p', 2, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).not.toBe('USE_SPELL')
  })

  it('attaque le joueur adjacent parmi plusieurs, pas le lointain', () => {
    // joueur1 adjacent (dist=1), joueur2 loin (dist=5)
    const enemy   = makeEntity('e', 3, 3, 'enemy', 6, 3)
    const close   = makeEntity('p1', 3, 4)
    const distant = makeEntity('p2', 8, 3)
    const action  = getAIAction(makeState([enemy, close, distant]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.target).toEqual({ x: 3, y: 4 })
  })
})

// ---------------------------------------------------------------------------
// Déplacement
// ---------------------------------------------------------------------------

describe('getAIAction — déplacement', () => {
  it('se déplace vers le joueur le plus proche quand hors portée', () => {
    // ennemi en (0,0), joueur en (5,0), mp=3
    const enemy  = makeEntity('e', 0, 0, 'enemy', 0, 3)  // ap=0 → ne peut pas attaquer
    const player = makeEntity('p', 5, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('MOVE')
    if (action.type !== 'MOVE') return
    // La case cible doit être plus proche du joueur qu'(0,0)
    const distBefore = Math.abs(0 - 5)  // 5
    const distAfter  = Math.abs(action.to.x - 5) + Math.abs(action.to.y - 0)
    expect(distAfter).toBeLessThan(distBefore)
  })

  it('se rapproche du joueur le plus proche parmi plusieurs', () => {
    // ennemi en (0,0), joueur1 en (0,8), joueur2 en (0,3) — le plus proche est joueur2
    const enemy   = makeEntity('e', 0, 0, 'enemy', 0, 2)
    const far     = makeEntity('p1', 0, 8)
    const near    = makeEntity('p2', 0, 3)
    const action  = getAIAction(makeState([enemy, far, near]), 'e')
    expect(action.type).toBe('MOVE')
    if (action.type !== 'MOVE') return
    // Doit avancer vers (0,3), donc y doit croître
    expect(action.to.y).toBeGreaterThan(0)
    expect(action.to.x).toBe(0)
  })

  it('ne se déplace pas si toutes les cases accessibles s\'éloignent du joueur', () => {
    // ennemi en (1,0), joueur en (0,0) — adjacent (dist=1)
    // Les cases accessibles seront à dist≥1 du joueur (joueur bloque (0,0))
    const enemy  = makeEntity('e', 1, 0, 'enemy', 0, 2)
    const player = makeEntity('p', 0, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    // Pas d'attaque (ap=0), pas de case plus proche → END_TURN
    expect(action.type).toBe('END_TURN')
  })

  it('ne se déplace pas si les PM sont épuisés', () => {
    const enemy  = makeEntity('e', 0, 0, 'enemy', 0, 0)  // ap=0, mp=0
    const player = makeEntity('p', 5, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('END_TURN')
  })
})

// ---------------------------------------------------------------------------
// Fin de tour
// ---------------------------------------------------------------------------

describe('getAIAction — fin de tour', () => {
  it('retourne END_TURN si aucun joueur vivant', () => {
    const enemy  = makeEntity('e', 0, 0, 'enemy')
    const action = getAIAction(makeState([enemy]), 'e')
    expect(action.type).toBe('END_TURN')
  })

  it('retourne END_TURN si l\'entité est introuvable', () => {
    const player = makeEntity('p', 0, 0)
    const action = getAIAction(makeState([player]), 'inconnu')
    expect(action.type).toBe('END_TURN')
  })

  it('END_TURN porte l\'entityId correct', () => {
    const enemy  = makeEntity('e', 0, 0, 'enemy', 0, 0)
    const player = makeEntity('p', 5, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('END_TURN')
    if (action.type !== 'END_TURN') return
    expect(action.entityId).toBe('e')
  })
})

// ---------------------------------------------------------------------------
// Priorité : attaque avant déplacement
// ---------------------------------------------------------------------------

describe('getAIAction — priorité attaque > déplacement', () => {
  it('attaque plutôt que de se déplacer quand les deux sont possibles', () => {
    // ennemi adjacent au joueur, assez de PA ET de PM
    const enemy  = makeEntity('e', 2, 2, 'enemy', 6, 3)
    const player = makeEntity('p', 2, 3)
    const action = getAIAction(makeState([enemy, player]), 'e')
    // Doit attaquer, pas se déplacer
    expect(action.type).toBe('USE_SPELL')
  })
})
