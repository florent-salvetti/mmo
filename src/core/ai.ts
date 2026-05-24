import type { Action, Entity, GameState, Position, Spell } from '../shared/types'
import { manhattanDistance } from './grid'
import { getReachableCells, getPathDistances } from './movement'
import { getSpell, tryApplySpell } from './spells'
import { hasLineOfSight } from './lineOfSight'

function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`
}

// Sorts utilisés par l'IA ennemie — ajouter une ligne ici pour étendre le répertoire.
const SPELL_COUP_EPEE = 'coup-epee'
const SPELL_CHARGE    = 'charge'

/**
 * Calcule les dégâts totaux qu'un sort peut infliger.
 * Prend en compte les effets 'damage' ET le impactDamage des effets 'dash'.
 */
function spellDamage(spell: Spell): number {
  return spell.effects.reduce((sum, e) => {
    if (e.type === 'damage') return sum + e.value
    if (e.type === 'dash')   return sum + e.impactDamage
    return sum
  }, 0)
}

/**
 * Sélectionne la cible optimale parmi les entités à portée.
 * Priorité 1 : une entité achevable ce tour (hp <= damage total du sort).
 * Priorité 2 : l'entité avec le moins de PV.
 */
function pickTarget(damage: number, inRange: Entity[]): Entity | undefined {
  if (inRange.length === 0) return undefined
  const killable = inRange.filter(p => p.hp <= damage)
  if (killable.length > 0) return killable.reduce((best, p) => p.hp < best.hp ? p : best)
  return inRange.reduce((best, p) => p.hp < best.hp ? p : best)
}

/**
 * Renvoie la prochaine action qu'un ennemi doit jouer.
 *
 * Priorité stricte :
 *  1. Coup d'épée — si un joueur est adjacent (portée [1,1]) et que les PA suffisent.
 *  2. Charge     — si disponible (pas en cooldown, PA suffisants) et qu'un joueur vivant
 *                  est aligné sur une ligne cardinale et que la charge l'atteindrait et
 *                  lui infligerait des dégâts (chemin non bloqué).
 *  3. Avancer    — se déplacer vers le joueur le plus proche si ça rapproche réellement.
 *  4. Fin de tour.
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

  // --- 1. Coup d'épée : attaque au corps à corps ---
  const coupEpee = getSpell(SPELL_COUP_EPEE)
  if (coupEpee && entity.ap >= coupEpee.apCost) {
    const inRange = players.filter(p => {
      const dist = manhattanDistance(entity.position, p.position)
      if (dist < coupEpee.range.min || dist > coupEpee.range.max) return false
      return !coupEpee.needsLineOfSight || hasLineOfSight(state.grid, entity.position, p.position)
    })
    const target = pickTarget(spellDamage(coupEpee), inRange)
    if (target) {
      return { type: 'USE_SPELL', entityId, spellId: SPELL_COUP_EPEE, target: target.position }
    }
  }

  // --- 2. Charge : engager un joueur sur une ligne cardinale ---
  // On délègue toute la validation à tryApplySpell (portée, cardinal, cooldown, PA),
  // puis on vérifie que la charge inflige bien des dégâts (chemin réellement dégagé).
  const chargeSpell = getSpell(SPELL_CHARGE)
  if (chargeSpell && entity.ap >= chargeSpell.apCost && (entity.cooldowns?.[SPELL_CHARGE] ?? 0) === 0) {
    const chargeableTargets: Entity[] = []
    for (const player of players) {
      const result = tryApplySpell(state, entityId, chargeSpell, player.position)
      if (!result.valid) continue
      // La charge est utilisée uniquement si elle touche effectivement le joueur.
      // Un mur ou un allié sur le chemin empêche le contact → pas de dégâts → on passe.
      const playerAfter = result.nextState.entities.find(e => e.id === player.id)!
      if (playerAfter.hp < player.hp) chargeableTargets.push(player)
    }
    const target = pickTarget(spellDamage(chargeSpell), chargeableTargets)
    if (target) {
      return { type: 'USE_SPELL', entityId, spellId: SPELL_CHARGE, target: target.position }
    }
  }

  // --- 3. Avancer vers le joueur le plus proche ---
  const reachable = getReachableCells(state.grid, entity, state.entities, entity.mp)

  // BFS depuis le joueur : distances réelles tenant compte des entités qui bloquent.
  // On exclut le mover lui-même et la cible (nearest) des obstacles, sinon le BFS
  // ne pourrait jamais atteindre la cible ni partir de la case du mover.
  const blockedForPath = new Set(
    state.entities
      .filter(e => e.hp > 0 && e.id !== entity.id && e.id !== nearest.id)
      .map(e => posKey(e.position)),
  )
  const distFromNearest = getPathDistances(state.grid, nearest.position, blockedForPath)
  const currentRealDist = distFromNearest.get(posKey(entity.position)) ?? Infinity

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

  // --- 4. Fin de tour ---
  return { type: 'END_TURN', entityId }
}

/** Retourne l'entité de `candidates` la plus proche de `from`. */
function closestTo(from: Entity, candidates: Entity[]): Entity {
  return candidates.reduce((best, c) =>
    manhattanDistance(from.position, c.position) < manhattanDistance(from.position, best.position)
      ? c : best,
  )
}
