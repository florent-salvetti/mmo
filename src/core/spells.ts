import type { Cell, Entity, GameState, Position, Spell, SpellEffect } from '../shared/types'
import { manhattanDistance, getCell } from './grid'
import { hasLineOfSight } from './lineOfSight'

// Un import par fichier JSON — Vite les traite au build, TypeScript les type-check.
import coupEpeeRaw from '../../data/spells/coup-epee.json'
import tirArcRaw   from '../../data/spells/tir-arc.json'
import chargeRaw   from '../../data/spells/charge.json'

// Le registre mappe chaque id de sort vers sa définition.
// Ajouter un sort = ajouter une ligne ici + son fichier JSON.
const SPELL_REGISTRY: Record<string, Spell> = {
  [coupEpeeRaw.id]: coupEpeeRaw as unknown as Spell,
  [tirArcRaw.id]:   tirArcRaw   as unknown as Spell,
  [chargeRaw.id]:   chargeRaw   as unknown as Spell,
}

/** Retourne la définition d'un sort par son id, ou undefined si inconnu. */
export function getSpell(id: string): Spell | undefined {
  return SPELL_REGISTRY[id]
}

/**
 * Calcule la case d'arrivée d'un dash depuis la position du lanceur dans la direction
 * (stepX, stepY), en s'arrêtant avant tout obstacle (mur ou entité vivante).
 * Retourne la position du lanceur lui-même si aucun mouvement n'est possible.
 *
 * Miroir de la logique de applyDash — utilisé par le client pour afficher les cases
 * ciblables sans avoir à dupliquer le calcul.
 */
export function getDashDestination(
  state: GameState,
  casterId: string,
  stepX: number,
  stepY: number,
  maxDistance: number,
): Position {
  const caster = state.entities.find(e => e.id === casterId)
  if (!caster) return { x: 0, y: 0 }

  let landX = caster.position.x
  let landY = caster.position.y

  for (let step = 1; step <= maxDistance; step++) {
    const nx = caster.position.x + stepX * step
    const ny = caster.position.y + stepY * step
    const cell = getCell(state.grid, { x: nx, y: ny })
    if (!cell || !cell.walkable) break
    const occupied = state.entities.some(
      e => e.hp > 0 && e.id !== casterId && e.position.x === nx && e.position.y === ny,
    )
    if (occupied) break
    landX = nx
    landY = ny
  }

  return { x: landX, y: landY }
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

  if ((caster.cooldowns?.[spell.id] ?? 0) > 0) return { valid: false }

  const dist = manhattanDistance(caster.position, target)
  if (dist < spell.range.min || dist > spell.range.max) return { valid: false }

  if (spell.needsLineOfSight && !hasLineOfSight(state.grid, caster.position, target)) {
    return { valid: false }
  }

  // Validation spécifique aux effets 'dash' : la cible doit être sur une ligne cardinale pure.
  for (const effect of spell.effects) {
    if (effect.type === 'dash') {
      const dx = target.x - caster.position.x
      const dy = target.y - caster.position.y
      if (dx === 0 && dy === 0) return { valid: false }
      if (dx !== 0 && dy !== 0) return { valid: false }  // diagonale → refusé
    }
  }

  // --- Tout est valide : construire le nouvel état ---

  // 1. Décrémenter les PA du lanceur.
  let nextState: GameState = {
    ...state,
    entities: state.entities.map(e =>
      e.id === casterId ? { ...e, ap: e.ap - spell.apCost } : e,
    ),
  }

  // 2. Appliquer chaque effet.
  for (const effect of spell.effects) {
    nextState = applyEffect(nextState, casterId, target, effect)
  }

  // 3. Armer le cooldown si le sort en a un.
  if (spell.cooldown && spell.cooldown > 0) {
    nextState = {
      ...nextState,
      entities: nextState.entities.map(e =>
        e.id === casterId
          ? { ...e, cooldowns: { ...e.cooldowns, [spell.id]: spell.cooldown! } }
          : e,
      ),
    }
  }

  return { valid: true, nextState }
}

// ---------------------------------------------------------------------------
// Effets
// ---------------------------------------------------------------------------

function applyEffect(state: GameState, casterId: string, target: Position, effect: SpellEffect): GameState {
  switch (effect.type) {
    case 'damage': return applyDamage(state, target, effect.value)
    case 'dash':   return applyDash(state, casterId, target, effect.maxDistance, effect.impactDamage)
  }
}

function applyDamage(state: GameState, target: Position, value: number): GameState {
  return {
    ...state,
    entities: state.entities.map(e =>
      e.position.x === target.x && e.position.y === target.y && e.hp > 0
        ? { ...e, hp: Math.max(0, e.hp - value) }
        : e,
    ),
  }
}

/**
 * Déplace le lanceur dans la direction (caster → target) en deux modes :
 *
 * Mode offensif — si `target` est occupée par un adversaire vivant :
 *   Le lanceur fonce vers cet adversaire et s'arrête sur la case juste devant lui.
 *   Si aucun obstacle ne bloque le chemin et que le lanceur atterrit bien en face,
 *   il inflige `impactDamage` à l'adversaire ciblé.
 *
 * Mode libre — si `target` est une case vide (pas d'adversaire dessus) :
 *   Le lanceur avance jusqu'à `maxDistance` cases dans la direction de la cible,
 *   s'arrêtant avant tout mur ou entité vivante. Pas de dégâts.
 */
function applyDash(
  state: GameState,
  casterId: string,
  target: Position,
  maxDistance: number,
  impactDamage: number,
): GameState {
  const caster = state.entities.find(e => e.id === casterId)
  if (!caster) return state

  const stepX = Math.sign(target.x - caster.position.x)
  const stepY = Math.sign(target.y - caster.position.y)

  // Mode offensif : la cible est un adversaire vivant.
  const targetAdversary = state.entities.find(
    e => e.hp > 0 && e.team !== caster.team &&
         e.position.x === target.x && e.position.y === target.y,
  )
  const isOffensive = targetAdversary !== undefined

  let landX = caster.position.x
  let landY = caster.position.y

  for (let step = 1; step <= maxDistance; step++) {
    const nx = caster.position.x + stepX * step
    const ny = caster.position.y + stepY * step

    // Offensif : on s'arrête AVANT l'adversaire cible (il occupe sa case).
    if (isOffensive && nx === target.x && ny === target.y) break

    const cell = getCell(state.grid, { x: nx, y: ny })
    if (!cell || !cell.walkable) break
    const occupied = state.entities.some(
      e => e.hp > 0 && e.id !== casterId && e.position.x === nx && e.position.y === ny,
    )
    if (occupied) break
    landX = nx
    landY = ny
    // Mode libre : s'arrêter exactement sur la case cible (respect de la distance choisie).
    if (!isOffensive && nx === target.x && ny === target.y) break
  }

  // Appliquer le déplacement si le lanceur a avancé.
  let result: GameState = (landX !== caster.position.x || landY !== caster.position.y)
    ? {
        ...state,
        entities: state.entities.map(e =>
          e.id === casterId ? { ...e, position: { x: landX, y: landY } } : e,
        ),
      }
    : state

  // Dégâts d'impact : uniquement en mode offensif, et uniquement si le lanceur
  // a atterri exactement en face de l'adversaire cible (rien n'a bloqué le chemin).
  if (isOffensive && impactDamage > 0) {
    const frontX = landX + stepX
    const frontY = landY + stepY
    if (frontX === target.x && frontY === target.y) {
      result = applyDamage(result, target, impactDamage)
    }
  }

  return result
}
