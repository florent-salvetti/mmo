import type { Action, Entity, GameState, Position, Spell } from '../shared/types'
import { manhattanDistance } from './grid'
import { getReachableCells, getPathDistances } from './movement'
import { getSpell } from './spells'
import { hasLineOfSight } from './lineOfSight'

function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`
}

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

  const players = state.entities.filter(e => e.team === 'player' && e.hp > 0)
  if (players.length === 0) return { type: 'END_TURN', entityId }

  const nearest = closestTo(entity, players)

  // --- 1. Attaque si un joueur est dans la portée du sort ---
  const spell = getSpell(ENEMY_SPELL_ID)
  if (spell && entity.ap >= spell.apCost) {
    const inRange = players.filter(p => {
      const dist = manhattanDistance(entity.position, p.position)
      if (dist < spell.range.min || dist > spell.range.max) return false
      return !spell.needsLineOfSight || hasLineOfSight(state.grid, entity.position, p.position)
    })
    const target = pickTarget(spell, inRange)
    if (target) {
      return { type: 'USE_SPELL', entityId, spellId: ENEMY_SPELL_ID, target: target.position }
    }
  }

  // --- 2. Avancer vers le joueur le plus proche ---
  const reachable = getReachableCells(state.grid, entity, state.entities, entity.mp)

  // BFS depuis le joueur : distances réelles sur la topologie de la grille.
  // On part du joueur (pas de l'ennemi) pour comparer chaque case accessible
  // à la position actuelle de l'ennemi — même au-delà de sa portée de déplacement.
  const distFromNearest   = getPathDistances(state.grid, nearest.position)
  const currentRealDist   = distFromNearest.get(posKey(entity.position)) ?? Infinity

  // Garde uniquement les cases qui rapprochent réellement (coût chemin réel, pas Manhattan).
  const closer = reachable.filter(
    r => (distFromNearest.get(posKey(r.cell.position)) ?? Infinity) < currentRealDist,
  )

  if (closer.length > 0) {
    const best = closer.reduce((b, r) => {
      const dR = distFromNearest.get(posKey(r.cell.position)) ?? Infinity
      const dB = distFromNearest.get(posKey(b.cell.position)) ?? Infinity
      return dR < dB ? r : b
    })
    return { type: 'MOVE', entityId, to: best.cell.position }
  }

  // --- 3. Fin de tour ---
  return { type: 'END_TURN', entityId }
}

/**
 * Sélectionne la cible optimale parmi les joueurs à portée.
 * Priorité 1 : un joueur achevable ce tour (dégâts totaux du sort >= PV actuels).
 * Priorité 2 : le joueur avec le moins de PV.
 * Retourne undefined si la liste est vide.
 */
function pickTarget(spell: Spell, inRange: Entity[]): Entity | undefined {
  if (inRange.length === 0) return undefined

  const damage = spell.effects.reduce((sum, e) => sum + e.value, 0)

  const killable = inRange.filter(p => p.hp <= damage)
  if (killable.length > 0) {
    return killable.reduce((best, p) => p.hp < best.hp ? p : best)
  }

  return inRange.reduce((best, p) => p.hp < best.hp ? p : best)
}

/** Retourne l'entité de `candidates` la plus proche de `from`. */
function closestTo(from: Entity, candidates: Entity[]): Entity {
  return candidates.reduce((best, c) =>
    manhattanDistance(from.position, c.position) < manhattanDistance(from.position, best.position)
      ? c : best,
  )
}
