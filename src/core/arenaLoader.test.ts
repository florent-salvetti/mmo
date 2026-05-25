import { describe, it, expect } from 'vitest'
import { createCombatStateFromArena } from './mapLoader'
import type { CombatArena, Entity, MonsterGroup } from '../shared/types'
import arena01Raw from '../../data/arenas/arena-01.json'

const arena01 = arena01Raw as unknown as CombatArena

// Joueur partiellement dégradé — pour vérifier la restauration AP/MP.
const testPlayer: Entity = {
  id: 'p1', name: 'Hero', team: 'player',
  position: { x: 0, y: 0 },
  hp: 75, maxHp: 100,
  ap: 2,  maxAp: 6,
  mp: 0,  maxMp: 3,
}

// Groupe de 3 monstres — couvre le cas courant et teste l'ordre des spawns.
const group3: MonsterGroup = {
  id: 'grp-test',
  monsters: [
    { id: 'e1', name: 'Loup A', creatureType: 'loup',
      position: { x: 9, y: 9 }, hp: 30, maxHp: 30, ap: 4, maxAp: 4, mp: 2, maxMp: 2 },
    { id: 'e2', name: 'Loup B', creatureType: 'loup',
      position: { x: 9, y: 9 }, hp: 25, maxHp: 25, ap: 4, maxAp: 4, mp: 2, maxMp: 2 },
    { id: 'e3', name: 'Loup C', creatureType: 'loup',
      position: { x: 9, y: 9 }, hp: 20, maxHp: 20, ap: 4, maxAp: 4, mp: 2, maxMp: 2 },
  ],
}

// Groupe de 6 monstres — dépasse les 5 slots de l'arène, teste le fallback.
const group6: MonsterGroup = {
  id: 'grp-surcharge',
  monsters: Array.from({ length: 6 }, (_, i) => ({
    id: `ex${i}`, name: `Ennemi ${i}`, creatureType: 'test',
    position: { x: 0, y: 0 }, hp: 10, maxHp: 10, ap: 2, maxAp: 2, mp: 1, maxMp: 1,
  })),
}

// ─── Grille ──────────────────────────────────────────────────────────────────

describe('createCombatStateFromArena — grille', () => {
  it('produit les bonnes dimensions depuis arena-01 (12×12)', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    expect(state.grid.length).toBe(12)
    expect(state.grid[0].length).toBe(12)
  })

  it('applique les obstacles de l\'arène (cube non walkable)', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    // arena-01 : cube en (5,4)
    expect(state.grid[4][5].obstacle).toBe('cube')
    expect(state.grid[4][5].walkable).toBe(false)
  })

  it('applique les obstacles de l\'arène (hole non walkable)', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    // arena-01 : hole en (5,5)
    expect(state.grid[5][5].obstacle).toBe('hole')
    expect(state.grid[5][5].walkable).toBe(false)
  })

  it('les cases sans obstacle sont marchables', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    expect(state.grid[0][0].walkable).toBe(true)
    expect(state.grid[0][0].obstacle).toBeUndefined()
  })

  it('la grille est indépendante des maps d\'exploration (dimensions propres à l\'arène)', () => {
    // arena-01 fait 12×12 ; les maps d'exploration font aussi 12×12 dans ce projet,
    // mais l'arène construit SA propre grille depuis ses propres obstacles.
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    // Vérifie qu'une case libre dans l'arène n'est pas "polluée" par des données externes.
    expect(state.grid[1][1].obstacle).toBeUndefined()
  })
})

// ─── Joueur ──────────────────────────────────────────────────────────────────

describe('createCombatStateFromArena — joueur', () => {
  it('place le joueur sur arena.playerSpawn', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const p = state.entities.find(e => e.team === 'player')!
    // arena-01.playerSpawn = {x:1, y:5}
    expect(p.position).toEqual({ x: 1, y: 5 })
  })

  it('restaure les PA du joueur au maximum', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const p = state.entities.find(e => e.team === 'player')!
    expect(p.ap).toBe(6)
    expect(p.maxAp).toBe(6)
  })

  it('restaure les PM du joueur au maximum', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const p = state.entities.find(e => e.team === 'player')!
    expect(p.mp).toBe(3)
    expect(p.maxMp).toBe(3)
  })

  it('conserve les PV actuels du joueur (pas de soin automatique)', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const p = state.entities.find(e => e.team === 'player')!
    expect(p.hp).toBe(75)
    expect(p.maxHp).toBe(100)
  })

  it('conserve l\'identité du joueur (id, name, team)', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const p = state.entities.find(e => e.team === 'player')!
    expect(p.id).toBe('p1')
    expect(p.name).toBe('Hero')
    expect(p.team).toBe('player')
  })
})

// ─── Ennemis ─────────────────────────────────────────────────────────────────

describe('createCombatStateFromArena — ennemis', () => {
  it('crée autant d\'ennemis que de monstres dans le groupe', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    expect(state.entities.filter(e => e.team === 'enemy')).toHaveLength(3)
  })

  it('place le 1er monstre sur enemySpawns[0]', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const e1 = state.entities.find(e => e.id === 'e1')!
    // arena-01.enemySpawns[0] = {x:10, y:5}
    expect(e1.position).toEqual({ x: 10, y: 5 })
  })

  it('place le 2ème monstre sur enemySpawns[1]', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const e2 = state.entities.find(e => e.id === 'e2')!
    // arena-01.enemySpawns[1] = {x:10, y:4}
    expect(e2.position).toEqual({ x: 10, y: 4 })
  })

  it('place le 3ème monstre sur enemySpawns[2]', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const e3 = state.entities.find(e => e.id === 'e3')!
    // arena-01.enemySpawns[2] = {x:10, y:6}
    expect(e3.position).toEqual({ x: 10, y: 6 })
  })

  it('copie les stats des monstres sans les modifier', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    const e1 = state.entities.find(e => e.id === 'e1')!
    expect(e1.hp).toBe(30)
    expect(e1.maxHp).toBe(30)
    expect(e1.ap).toBe(4)
    expect(e1.creatureType).toBe('loup')
  })

  it('affecte team=enemy à tous les monstres', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    for (const e of state.entities.filter(en => en.id !== 'p1')) {
      expect(e.team).toBe('enemy')
    }
  })

  it('réutilise le dernier spawn si le groupe dépasse le nombre de slots', () => {
    const state = createCombatStateFromArena(arena01, group6, testPlayer)
    // arena-01 a 5 spawns ; le 6ème monstre doit prendre enemySpawns[4] = {x:9,y:6}
    const ex5 = state.entities.find(e => e.id === 'ex5')!
    expect(ex5.position).toEqual({ x: 9, y: 6 })
  })
})

// ─── État initial ─────────────────────────────────────────────────────────────

describe('createCombatStateFromArena — état initial', () => {
  it('démarre au tour 1', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    expect(state.turn).toBe(1)
  })

  it('démarre avec status ongoing', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    expect(state.status).toBe('ongoing')
  })

  it('le joueur est l\'entité courante au départ', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    expect(state.currentEntityId).toBe('p1')
  })

  it('entities = [joueur, ...ennemis] dans cet ordre', () => {
    const state = createCombatStateFromArena(arena01, group3, testPlayer)
    expect(state.entities[0].team).toBe('player')
    expect(state.entities.slice(1).every(e => e.team === 'enemy')).toBe(true)
  })
})
