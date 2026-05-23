import type { Action, Entity, GameState } from '../shared/types'
import { manhattanDistance } from './grid'
import { getReachableCells } from './movement'
import { getSpell } from './spells'
import { hasLineOfSight } from './lineOfSight'

// Sort utilisé par tous les ennemis — Phase 1.
// Chaque ennemi a accès au même sort que le joueur ; la liste par entité viendra plus tard.
const ENEMY_SPELL_ID = 'coup-epee'

/**
 * Renvoie la prochaine action qu'un ennemi doit jouer.
 *
 * Priorité :
 *  1. Attaquer — si un joueur est à portée du sort et que les PA suffisent.
 *  2. Avancer — se déplacer vers le joueur le plus proche si ça rapproche.
 *  3. Fin de tour — sinon (plus de PA, plus de PM, ou déjà collé).
 *
 * Renvoie UNE seule action. Le client appelle cette fonction en boucle
 * jusqu'à recevoir END_TURN pour simuler le tour complet de l'ennemi.
 *
 * Fonction pure : aucun effet de bord.
 */
export function getAIAction(state: GameState, entityId: string): Action {
  const entity = state.entities.find(e => e.id === entityId)
  if (!entity) return { type: 'END_TURN', entityId }

  const players = state.entities.filter(e => e.team === 'player')
  if (players.length === 0) return { type: 'END_TURN', entityId }

  const nearest = closestTo(entity, players)

  // --- 1. Attaque si un joueur est dans la portée du sort ---
  const spell = getSpell(ENEMY_SPELL_ID)
  if (spell && entity.ap >= spell.apCost) {
    const target = players.find(p => {
      const dist = manhattanDistance(entity.position, p.position)
      if (dist < spell.range.min || dist > spell.range.max) return false
      return !spell.needsLineOfSight || hasLineOfSight(state.grid, entity.position, p.position)
    })
    if (target) {
      return { type: 'USE_SPELL', entityId, spellId: ENEMY_SPELL_ID, target: target.position }
    }
  }

  // --- 2. Avancer vers le joueur le plus proche ---
  const currentDist = manhattanDistance(entity.position, nearest.position)
  const reachable   = getReachableCells(state.grid, entity, state.entities, entity.mp)

  // Garde uniquement les cases qui rapprochent réellement l'ennemi.
  const closer = reachable.filter(
    r => manhattanDistance(r.cell.position, nearest.position) < currentDist,
  )

  if (closer.length > 0) {
    const best = closer.reduce((b, r) =>
      manhattanDistance(r.cell.position, nearest.position) <
      manhattanDistance(b.cell.position, nearest.position) ? r : b,
    )
    return { type: 'MOVE', entityId, to: best.cell.position }
  }

  // --- 3. Fin de tour ---
  return { type: 'END_TURN', entityId }
}

/** Retourne l'entité de `candidates` la plus proche de `from`. */
function closestTo(from: Entity, candidates: Entity[]): Entity {
  return candidates.reduce((best, c) =>
    manhattanDistance(from.position, c.position) < manhattanDistance(from.position, best.position)
      ? c : best,
  )
}
