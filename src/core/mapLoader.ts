import type { Cell, Entity, GameState, MapDefinition, MonsterGroup } from '../shared/types'

/**
 * Construit le GameState initial (exploration) à partir d'une définition de map.
 * Ne crée que le joueur — les monstres des groupes ne rejoignent le GameState
 * que lorsqu'un combat est déclenché (future fonction createCombatStateFromGroup).
 * Fonction pure : même entrée → même sortie, aucun effet de bord.
 */
export function createGameStateFromMap(map: MapDefinition): GameState {
  const obstacleIndex = new Map(
    map.obstacles.map(o => [`${o.x},${o.y}`, o.type] as const),
  )

  const grid: Cell[][] = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) => {
      const obstacle = obstacleIndex.get(`${x},${y}`)
      return { position: { x, y }, walkable: obstacle === undefined, obstacle }
    }),
  )

  const p = map.player
  const player: Entity = {
    id:       p.id,
    name:     p.name,
    team:     'player',
    position: { x: p.startPosition.x, y: p.startPosition.y },
    hp:       p.hp,
    maxHp:    p.maxHp,
    ap:       p.ap,
    maxAp:    p.maxAp,
    mp:       p.mp,
    maxMp:    p.maxMp,
  }

  return {
    grid,
    entities:        [player],
    currentEntityId: player.id,
    turn:            1,
    status:          'ongoing',
  }
}

/**
 * Construit le GameState de COMBAT à partir d'une map et d'un groupe de monstres engagé.
 * Le joueur est placé à sa position d'exploration courante (pas la startPosition de la map).
 * Ses PA et PM sont restaurés au maximum (début de combat).
 * Fonction pure : même entrée → même sortie, aucun effet de bord.
 */
export function createCombatStateFromGroup(
  map: MapDefinition,
  group: MonsterGroup,
  player: Entity,
): GameState {
  const obstacleIndex = new Map(
    map.obstacles.map(o => [`${o.x},${o.y}`, o.type] as const),
  )

  const grid: Cell[][] = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) => {
      const obstacle = obstacleIndex.get(`${x},${y}`)
      return { position: { x, y }, walkable: obstacle === undefined, obstacle }
    }),
  )

  const playerEntity: Entity = {
    id:       player.id,
    name:     player.name,
    team:     'player',
    position: { x: player.position.x, y: player.position.y },
    hp:       player.hp,
    maxHp:    player.maxHp,
    ap:       player.maxAp,
    maxAp:    player.maxAp,
    mp:       player.maxMp,
    maxMp:    player.maxMp,
  }

  const enemies: Entity[] = group.monsters.map(m => ({
    id:           m.id,
    name:         m.name,
    team:         'enemy' as const,
    creatureType: m.creatureType,
    position:     { x: m.position.x, y: m.position.y },
    hp:           m.hp,
    maxHp:        m.maxHp,
    ap:           m.ap,
    maxAp:        m.maxAp,
    mp:           m.mp,
    maxMp:        m.maxMp,
  }))

  return {
    grid,
    entities:        [playerEntity, ...enemies],
    currentEntityId: playerEntity.id,
    turn:            1,
    status:          'ongoing',
  }
}
