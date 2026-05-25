import { describe, it, expect } from 'vitest'
import { getUpcomingTurns } from './turnOrder'
import type { Entity, GameState } from '../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntity(
  id: string,
  team: 'player' | 'enemy' = 'player',
  hp = 10,
): Entity {
  return {
    id, name: id, team,
    position: { x: 0, y: 0 },
    hp, maxHp: 10, ap: 6, maxAp: 6, mp: 3, maxMp: 3,
  }
}

function makeState(entities: Entity[], currentEntityId: string): GameState {
  return { grid: [], entities, currentEntityId, turn: 1, status: 'ongoing' }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getUpcomingTurns — ordre depuis l\'entité courante', () => {

  it('retourne l\'entité courante en premier', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B'), makeEntity('C')],
      'B',
    )
    expect(getUpcomingTurns(state, 3).map(e => e.id)).toEqual(['B', 'C', 'A'])
  })

  it('count=1 retourne uniquement l\'entité courante', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B'), makeEntity('C')],
      'B',
    )
    expect(getUpcomingTurns(state, 1).map(e => e.id)).toEqual(['B'])
  })

  it('count par défaut retourne 8 entrées', () => {
    const state = makeState([makeEntity('A'), makeEntity('B')], 'A')
    expect(getUpcomingTurns(state)).toHaveLength(8)
  })

})

describe('getUpcomingTurns — cyclage', () => {

  it('cycle correctement au-delà du dernier combattant', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B'), makeEntity('C')],
      'B',
    )
    expect(getUpcomingTurns(state, 6).map(e => e.id))
      .toEqual(['B', 'C', 'A', 'B', 'C', 'A'])
  })

  it('depuis le dernier combattant, repasse au premier', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B'), makeEntity('C')],
      'C',
    )
    expect(getUpcomingTurns(state, 4).map(e => e.id))
      .toEqual(['C', 'A', 'B', 'C'])
  })

  it('depuis le premier combattant, ordre naturel du tableau', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B'), makeEntity('C')],
      'A',
    )
    expect(getUpcomingTurns(state, 3).map(e => e.id))
      .toEqual(['A', 'B', 'C'])
  })

  it('une seule entité vivante : toujours cette entité', () => {
    const state = makeState([makeEntity('A')], 'A')
    expect(getUpcomingTurns(state, 4).map(e => e.id))
      .toEqual(['A', 'A', 'A', 'A'])
  })

})

describe('getUpcomingTurns — entités mortes sautées', () => {

  it('ignore une entité morte au milieu du cycle', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B', 'enemy', 0), makeEntity('C')],
      'A',
    )
    expect(getUpcomingTurns(state, 4).map(e => e.id))
      .toEqual(['A', 'C', 'A', 'C'])
  })

  it('ignore plusieurs entités mortes consécutives', () => {
    const state = makeState(
      [
        makeEntity('A'),
        makeEntity('B', 'enemy', 0),
        makeEntity('C', 'enemy', 0),
        makeEntity('D'),
      ],
      'A',
    )
    expect(getUpcomingTurns(state, 4).map(e => e.id))
      .toEqual(['A', 'D', 'A', 'D'])
  })

  it('entité courante vivante entourée de morts, cycle ne les inclut pas', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B', 'enemy', 0), makeEntity('C')],
      'A',
    )
    expect(getUpcomingTurns(state, 3).map(e => e.id))
      .toEqual(['A', 'C', 'A'])
  })

  it('retourne [] si toutes les entités sont mortes', () => {
    const state = makeState(
      [makeEntity('A', 'player', 0), makeEntity('B', 'enemy', 0)],
      'A',
    )
    expect(getUpcomingTurns(state, 4)).toEqual([])
  })

})

describe('getUpcomingTurns — cas limites', () => {

  it('count=0 retourne tableau vide', () => {
    const state = makeState([makeEntity('A'), makeEntity('B')], 'A')
    expect(getUpcomingTurns(state, 0)).toEqual([])
  })

  it('retourne les références directes aux entités (pas des copies)', () => {
    const entities = [makeEntity('A'), makeEntity('B')]
    const state = makeState(entities, 'A')
    const turns = getUpcomingTurns(state, 2)
    expect(turns[0]).toBe(entities[0])
    expect(turns[1]).toBe(entities[1])
  })

  it('currentEntityId introuvable parmi les vivants → commence au premier vivant', () => {
    const state = makeState(
      [makeEntity('A'), makeEntity('B')],
      'GHOST',
    )
    expect(getUpcomingTurns(state, 3).map(e => e.id))
      .toEqual(['A', 'B', 'A'])
  })

})
