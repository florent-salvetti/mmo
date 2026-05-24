import type { CombatStatus, Entity, GameState, Action } from '../shared/types'
import { getReachableCells } from './movement'
import { getSpell, tryApplySpell } from './spells'

/**
 * Machine à états du jeu : prend un état + une action, retourne le nouvel état.
 * Ne mute jamais l'état reçu — toujours un nouvel objet.
 * Retourne l'état inchangé (même référence) si l'action est invalide,
 * non implémentée, ou si le combat est déjà terminé.
 */
export function applyAction(state: GameState, action: Action): GameState {
  // Aucune action n'est traitée si le combat est fini.
  if (state.status !== 'ongoing') return state

  switch (action.type) {
    case 'MOVE':
      if (action.entityId !== state.currentEntityId) return state
      return applyMove(state, action)

    case 'END_TURN': {
      if (action.entityId !== state.currentEntityId) return state

      const currentIdx = state.entities.findIndex(e => e.id === state.currentEntityId)
      const n = state.entities.length

      // Chercher la prochaine entité vivante (hp > 0), en cyclant.
      let nextIdx = (currentIdx + 1) % n
      for (let i = 0; i < n - 1 && state.entities[nextIdx]!.hp <= 0; i++) {
        nextIdx = (nextIdx + 1) % n
      }

      const nextId  = state.entities[nextIdx]!.id
      // Tour incrémenté quand on repassedpar l'index 0 (un cycle complet).
      const didWrap = nextIdx <= currentIdx

      return {
        ...state,
        entities: state.entities.map(e =>
          e.id === nextId ? decrementCooldowns({ ...e, ap: e.maxAp, mp: e.maxMp }) : e,
        ),
        currentEntityId: nextId,
        turn: didWrap ? state.turn + 1 : state.turn,
      }
    }

    case 'USE_SPELL': {
      if (action.entityId !== state.currentEntityId) return state
      const spell = getSpell(action.spellId)
      if (!spell) return state
      const result = tryApplySpell(state, action.entityId, spell, action.target)
      if (!result.valid) return state
      // Recalculer le statut après l'application des dégâts.
      return {
        ...result.nextState,
        status: computeCombatStatus(result.nextState.entities),
      }
    }

    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// Statut du combat
// ---------------------------------------------------------------------------

/**
 * Dérive le statut du combat depuis les PV des entités.
 * Victoire si tous les ennemis sont à 0 PV ; défaite si tous les joueurs le sont.
 */
export function computeCombatStatus(entities: Entity[]): CombatStatus {
  const anyEnemyAlive  = entities.some(e => e.team === 'enemy'  && e.hp > 0)
  const anyPlayerAlive = entities.some(e => e.team === 'player' && e.hp > 0)
  if (!anyEnemyAlive)  return 'victory'
  if (!anyPlayerAlive) return 'defeat'
  return 'ongoing'
}

// ---------------------------------------------------------------------------
// Helpers privés
// ---------------------------------------------------------------------------

/**
 * Décrémente tous les cooldowns d'une entité d'un tour.
 * Les cooldowns arrivés à 0 sont supprimés (sort de nouveau disponible).
 */
function decrementCooldowns(entity: Entity): Entity {
  if (!entity.cooldowns) return entity
  const next: Record<string, number> = {}
  for (const [spellId, remaining] of Object.entries(entity.cooldowns)) {
    if (remaining > 1) next[spellId] = remaining - 1
    // remaining === 1 → expire ce tour → retiré de la map (= disponible)
  }
  const hasCooldowns = Object.keys(next).length > 0
  return { ...entity, cooldowns: hasCooldowns ? next : undefined }
}

function applyMove(
  state: GameState,
  action: Extract<Action, { type: 'MOVE' }>,
): GameState {
  const mover = state.entities.find(e => e.id === action.entityId)
  if (!mover) return state

  const reachable = getReachableCells(state.grid, mover, state.entities, mover.mp)
  const target = reachable.find(
    r => r.cell.position.x === action.to.x && r.cell.position.y === action.to.y,
  )
  if (!target) return state

  return {
    ...state,
    entities: state.entities.map(e =>
      e.id === action.entityId
        ? { ...e, position: action.to, mp: e.mp - target.cost }
        : e,
    ),
  }
}
