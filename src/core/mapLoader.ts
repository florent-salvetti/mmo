import type { Cell, Entity, GameState, MapDefinition } from '../shared/types'

/**
 * Construit le GameState initial à partir d'une définition de map.
 * Fonction pure : même entrée → même sortie, aucun effet de bord.
 */
export function createGameStateFromMap(map: MapDefinition): GameState {
  // Index rapide des obstacles pour la construction de la grille.
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

  const enemies: Entity[] = map.enemies.map(e => ({
    id:           e.id,
    name:         e.name,
    team:         'enemy' as const,
    creatureType: e.creatureType,
    position:     { x: e.startPosition.x, y: e.startPosition.y },
    hp:           e.hp,
    maxHp:        e.maxHp,
    ap:           e.ap,
    maxAp:        e.maxAp,
    mp:           e.mp,
    maxMp:        e.maxMp,
  }))

  return {
    grid,
    entities:        [player, ...enemies],
    currentEntityId: player.id,
    turn:            1,
    status:          'ongoing',
  }
}
