import type { Cell, Entity, GameState, MapDefinition } from '../shared/types'

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
