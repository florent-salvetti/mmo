import type { GameState, Action } from '../shared/types'
import { getReachableCells } from './movement'
import { getSpell, tryApplySpell } from './spells'

/**
 * Machine à états du jeu : prend un état + une action, retourne le nouvel état.
 * Ne mute jamais l'état reçu — toujours un nouvel objet.
 * Retourne l'état inchangé (même référence) si l'action est invalide ou non implémentée.
 */
export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'MOVE':
      // Seule l'entité dont c'est le tour peut agir.
      if (action.entityId !== state.currentEntityId) return state
      return applyMove(state, action)

    case 'END_TURN':
      return state  // Phase 2

    case 'USE_SPELL': {
      if (action.entityId !== state.currentEntityId) return state
      const spell = getSpell(action.spellId)
      if (!spell) return state
      const result = tryApplySpell(state, action.entityId, spell, action.target)
      return result.valid ? result.nextState : state
    }

    default: {
      // Garde-fou de compilation : si un nouveau type d'Action est ajouté au
      // type union sans être traité ici, TypeScript refuse de compiler.
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// Handlers privés
// ---------------------------------------------------------------------------

function applyMove(
  state: GameState,
  action: Extract<Action, { type: 'MOVE' }>,
): GameState {
  const mover = state.entities.find(e => e.id === action.entityId)
  if (!mover) return state

  // Le core valide lui-même la légalité du déplacement.
  const reachable = getReachableCells(state.grid, mover, state.entities, mover.mp)
  const target = reachable.find(
    r => r.cell.position.x === action.to.x && r.cell.position.y === action.to.y,
  )
  if (!target) return state  // case hors portée, occupée ou inexistante

  return {
    ...state,
    entities: state.entities.map(e =>
      e.id === action.entityId
        ? { ...e, position: action.to, mp: e.mp - target.cost }
        : e,
    ),
  }
}
