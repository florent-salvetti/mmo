import type { Cell, Entity, GameState, Position, Spell, SpellEffect } from '../shared/types'
import { manhattanDistance, getCell } from './grid'
import { hasLineOfSight } from './lineOfSight'

// Un import par fichier JSON — Vite les traite au build, TypeScript les type-check.
import coupEpeeRaw from '../../data/spells/coup-epee.json'

// Le registre mappe chaque id de sort vers sa définition.
// Ajouter un sort = ajouter une ligne ici + son fichier JSON.
const SPELL_REGISTRY: Record<string, Spell> = {
  [coupEpeeRaw.id]: coupEpeeRaw as unknown as Spell,
}

/** Retourne la définition d'un sort par son id, ou undefined si inconnu. */
export function getSpell(id: string): Spell | undefined {
  return SPELL_REGISTRY[id]
}

/**
 * Retourne toutes les cases ciblables par un sort depuis la position du lanceur.
 * Filtre par portée [range.min, range.max] et, si needsLineOfSight, par ligne de vue.
 * N'exige pas que la case soit walkable : on peut cibler une case occupée par un ennemi.
 */
export function getSpellTargetCells(grid: Cell[][], caster: Entity, spell: Spell): Cell[] {
  const result: Cell[] = []
  for (const row of grid) {
    for (const cell of row) {
      const dist = manhattanDistance(caster.position, cell.position)
      if (dist < spell.range.min || dist > spell.range.max) continue
      if (spell.needsLineOfSight && !hasLineOfSight(grid, caster.position, cell.position)) continue
      result.push(cell)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Application d'un sort
// ---------------------------------------------------------------------------

export type SpellCastResult =
  | { valid: true;  nextState: GameState }
  | { valid: false }

/**
 * Valide et applique un sort sur l'état donné.
 *
 * Validations dans l'ordre :
 *  1. Le lanceur existe
 *  2. La case cible est dans la grille
 *  3. Assez de PA
 *  4. Cible dans la portée [range.min, range.max] (distance Manhattan)
 *  5. Ligne de vue si needsLineOfSight
 *
 * Si tout est valide : PA décrémentés, effets appliqués, nouvel état retourné.
 * Sinon : { valid: false } — l'appelant retourne l'état inchangé.
 */
export function tryApplySpell(
  state: GameState,
  casterId: string,
  spell: Spell,
  target: Position,
): SpellCastResult {
  const caster = state.entities.find(e => e.id === casterId)
  if (!caster) return { valid: false }

  if (!getCell(state.grid, target)) return { valid: false }

  if (caster.ap < spell.apCost) return { valid: false }

  const dist = manhattanDistance(caster.position, target)
  if (dist < spell.range.min || dist > spell.range.max) return { valid: false }

  if (spell.needsLineOfSight && !hasLineOfSight(state.grid, caster.position, target)) {
    return { valid: false }
  }

  // --- Tout est valide : construire le nouvel état ---

  // 1. Décrémenter les PA du lanceur.
  let nextState: GameState = {
    ...state,
    entities: state.entities.map(e =>
      e.id === casterId ? { ...e, ap: e.ap - spell.apCost } : e,
    ),
  }

  // 2. Appliquer chaque effet sur la case cible.
  for (const effect of spell.effects) {
    nextState = applyEffect(nextState, target, effect)
  }

  return { valid: true, nextState }
}

// ---------------------------------------------------------------------------
// Effets
// ---------------------------------------------------------------------------

function applyEffect(state: GameState, target: Position, effect: SpellEffect): GameState {
  switch (effect.type) {
    case 'damage':
      return applyDamage(state, target, effect.value)
    // Quand HealEffect, PushEffect, etc. seront ajoutés à SpellEffect,
    // TypeScript signalera ici qu'un cas n'est pas traité (retour manquant).
  }
}

function applyDamage(state: GameState, target: Position, value: number): GameState {
  return {
    ...state,
    entities: state.entities.map(e =>
      e.position.x === target.x && e.position.y === target.y
        ? { ...e, hp: Math.max(0, e.hp - value) }
        : e,
    ),
  }
}
