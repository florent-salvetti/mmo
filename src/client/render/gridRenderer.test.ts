import { describe, it, expect } from 'vitest'
import { renderEntities } from './gridRenderer'
import type { Entity } from '../../shared/types'
import type { ScreenPos } from './projection'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mock minimal de CanvasRenderingContext2D.
 * Compte les appels à arc() : renderEntities en fait exactement un par entité dessinée.
 */
function makeCtxMock() {
  let arcCount = 0
  const ctx = {
    beginPath:   () => {},
    arc:         () => { arcCount++ },
    fill:        () => {},
    stroke:      () => {},
    fillRect:    () => {},
    fillStyle:   '' as string,
    strokeStyle: '' as string,
    lineWidth:   0,
  } as unknown as CanvasRenderingContext2D
  return { ctx, getArcCount: () => arcCount }
}

function makeEntity(
  id: string, x: number, y: number,
  team: 'player' | 'enemy' = 'player',
  hp = 10,
): Entity {
  return { id, name: id, team, position: { x, y }, hp, maxHp: 10, ap: 6, maxAp: 6, mp: 3, maxMp: 3 }
}

const ORIGIN: ScreenPos = { screenX: 400, screenY: 200 }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderEntities — entités mortes', () => {

  it('dessine une entité vivante (hp > 0)', () => {
    const { ctx, getArcCount } = makeCtxMock()
    renderEntities(ctx, [makeEntity('a', 0, 0)], ORIGIN)
    expect(getArcCount()).toBe(1)
  })

  it('ne dessine pas une entité morte (hp = 0)', () => {
    const { ctx, getArcCount } = makeCtxMock()
    const dead = makeEntity('d', 0, 0, 'enemy', 0)
    renderEntities(ctx, [dead], ORIGIN)
    expect(getArcCount()).toBe(0)
  })

  it('dans un mélange vivant/mort, ne dessine que les vivants', () => {
    const { ctx, getArcCount } = makeCtxMock()
    const alive = makeEntity('a', 0, 0, 'player', 10)
    const dead1 = makeEntity('d1', 1, 0, 'enemy', 0)
    const dead2 = makeEntity('d2', 2, 0, 'enemy', 0)
    renderEntities(ctx, [alive, dead1, dead2], ORIGIN)
    expect(getArcCount()).toBe(1)  // seul le vivant est dessiné
  })

  it('ne dessine rien si toutes les entités sont mortes', () => {
    const { ctx, getArcCount } = makeCtxMock()
    const dead1 = makeEntity('d1', 0, 0, 'player', 0)
    const dead2 = makeEntity('d2', 1, 0, 'enemy', 0)
    renderEntities(ctx, [dead1, dead2], ORIGIN)
    expect(getArcCount()).toBe(0)
  })

})
