import type { Cell, Entity, GameState, Position } from '../shared/types'
import { getReachableCells } from '../core/movement'
import { getSpell, getSpellTargetCells } from '../core/spells'
import { getCell } from '../core/grid'
import { applyAction } from '../core/reducer'
import { getAIAction } from '../core/ai'
import { renderGrid, renderHighlights, renderSpellRange, renderEntities, renderDamageNumbers, spritesReady, type PlayerDirection } from './render/gridRenderer'
import { startDamageNumber, startFlash, tickEffects, getActiveDamageNumbers, getFlashingEntities } from './effects'
import { computeOrigin, screenToGrid } from './render/projection'
import { buildPath, startAnimation, tickAnimations, getVisualPosition, getCurrentSegment } from './animation'

// ---------------------------------------------------------------------------
// État initial de démonstration
// ---------------------------------------------------------------------------

const GRID_W = 10
const GRID_H = 10
const BLOCKED = new Set(['2,3', '2,4', '2,5', '3,2', '7,6', '6,7', '6,6'])

const grid: Cell[][] = Array.from({ length: GRID_H }, (_, y) =>
  Array.from({ length: GRID_W }, (_, x) => ({
    position: { x, y },
    walkable: !BLOCKED.has(`${x},${y}`),
  })),
)

let gameState: GameState = {
  grid,
  entities: [
    { id: 'player-1', name: 'Kirito', team: 'player',
      position: { x: 1, y: 1 }, hp: 100, maxHp: 100, ap: 6, maxAp: 6, mp: 3, maxMp: 3 },
    { id: 'enemy-1', name: 'Mob A', team: 'enemy', creatureType: 'sanglier',
      position: { x: 4, y: 1 }, hp: 40, maxHp: 40, ap: 6, maxAp: 6, mp: 2, maxMp: 2 },
    { id: 'enemy-2', name: 'Mob B', team: 'enemy', creatureType: 'sanglier',
      position: { x: 5, y: 7 }, hp: 40, maxHp: 40, ap: 6, maxAp: 6, mp: 2, maxMp: 2 },
  ],
  currentEntityId: 'player-1',
  turn: 1,
  status: 'ongoing',
}

// ---------------------------------------------------------------------------
// Canvas + origine isométrique
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx    = canvas.getContext('2d')!
const origin = computeOrigin(GRID_W, GRID_H, canvas)

// ---------------------------------------------------------------------------
// Références DOM du HUD HTML (cachées une fois au démarrage)
// ---------------------------------------------------------------------------

const hudApVal        = document.querySelector<HTMLElement>('.hud-res-val.ap')
const hudApBar        = document.querySelector<HTMLElement>('.hud-res-bar-fill.ap')
const hudMpVal        = document.querySelector<HTMLElement>('.hud-res-val.mp')
const hudMpBar        = document.querySelector<HTMLElement>('.hud-res-bar-fill.mp')
const hudSpellButtons = document.querySelectorAll<HTMLButtonElement>('.hud-spell[data-spell-id]')
const hudEndTurnBtn   = document.querySelector<HTMLButtonElement>('.hud-end-turn')

// ---------------------------------------------------------------------------
// État de l'UI
// ---------------------------------------------------------------------------

type UIMode = 'move' | 'spell'

const SPELL_COUP_EPEE  = 'coup-epee'
const SPELL_TIR_ARC    = 'tir-arc'
const SPELL_CHARGE     = 'charge'
const AI_STEP_DELAY_MS = 500  // pause entre chaque action IA (visible à l'écran)

// Zones des boutons dans le canvas (coordonnées pixels).
const COUP_EPEE_BTN = { x:  16, y: 56, w: 140, h: 22 }
const TIR_ARC_BTN   = { x: 164, y: 56, w: 130, h: 22 }
const CHARGE_BTN    = { x: 302, y: 56, w: 105, h: 22 }
const END_TURN_BTN  = { x: 414, y: 56, w: 100, h: 22 }

let mode:          UIMode  = 'move'
let activeSpellId: string  = SPELL_COUP_EPEE  // sort actif quand mode === 'spell'
let hoveredPos:    Position | null = null
// Direction visuelle courante de chaque entité — initialisée au premier déplacement (défaut 'SE' à la lecture).
const entityDirections = new Map<string, PlayerDirection>()
let reachable:     Cell[]          = []
let spellRange:    Cell[]          = []
let aiTurnActive:  boolean         = false
let pendingAfterAnimation: (() => void) | null = null
let rafId: number | null = null

function currentEntity(): Entity {
  return gameState.entities.find(e => e.id === gameState.currentEntityId)!
}

function isCurrentEntityEnemy(): boolean {
  return currentEntity().team === 'enemy'
}

/**
 * Déduit la direction visuelle de `from` vers `to`.
 * Projection isométrique : x+1→SE, x-1→NO, y+1→SO, y-1→NE.
 * dx est prioritaire sur dy (même logique que le déplacement sur grille).
 */
function directionTo(from: Position, to: Position): PlayerDirection {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx > 0) return 'SE'
  if (dx < 0) return 'NO'
  if (dy > 0) return 'SO'
  return 'NE'
}

/** Déduit la direction visuelle depuis le dernier segment d'un chemin. */
function directionFromPath(path: Position[]): PlayerDirection {
  if (path.length < 2) return 'SE'
  return directionTo(path[path.length - 2]!, path[path.length - 1]!)
}

/**
 * Initialise l'orientation de chaque entité vers l'adversaire vivant le plus proche
 * (distance Manhattan). Appelé une seule fois au démarrage, avant le premier rendu.
 */
function initEntityDirections(): void {
  for (const entity of gameState.entities) {
    if (entity.hp <= 0) continue
    const opponents = gameState.entities.filter(e => e.team !== entity.team && e.hp > 0)
    if (opponents.length === 0) continue
    const nearest = opponents.reduce((best, e) =>
      Math.abs(e.position.x - entity.position.x) + Math.abs(e.position.y - entity.position.y) <
      Math.abs(best.position.x - entity.position.x) + Math.abs(best.position.y - entity.position.y)
        ? e : best,
    )
    entityDirections.set(entity.id, directionTo(entity.position, nearest.position))
  }
}

/**
 * Compare l'état avant/après un sort pour détecter les entités qui ont perdu des PV
 * et déclencher les effets visuels correspondants (chiffre flottant + flash).
 */
function triggerHitEffects(prev: GameState, next: GameState): void {
  const now = performance.now()
  for (const entity of next.entities) {
    const before = prev.entities.find(e => e.id === entity.id)
    if (!before || entity.hp >= before.hp) continue
    startDamageNumber(entity.id, before.hp - entity.hp, now)
    startFlash(entity.id, now)
  }
}

function refreshReachable(): void {
  const mover = currentEntity()
  reachable = getReachableCells(gameState.grid, mover, gameState.entities, mover.mp)
    .map(r => r.cell)
}

/**
 * Pour la charge, on surligne case par case dans chaque direction cardinale :
 *
 * - Case libre walkable : surlignée comme destination de déplacement partiel ou complet.
 *   Le joueur peut cliquer n'importe laquelle pour s'y arrêter exactement.
 *
 * - Adversaire vivant rencontré dans la portée : sa case est surlignée comme cible offensive
 *   (charge jusqu'à lui + dégâts d'impact). Le scan s'arrête là.
 *
 * - Allié ou mur : le scan s'arrête sans surligner cette case ni celles au-delà.
 */
function refreshChargeTargets(): void {
  const entity = currentEntity()
  const spell = getSpell(SPELL_CHARGE)
  if (!spell) { spellRange = []; return }
  const dashEffect = spell.effects.find(e => e.type === 'dash')
  if (!dashEffect || dashEffect.type !== 'dash') { spellRange = []; return }

  const maxDistance = dashEffect.maxDistance
  const targets: Cell[] = []

  for (const [stepX, stepY] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    for (let step = 1; step <= maxDistance; step++) {
      const nx = entity.position.x + stepX * step
      const ny = entity.position.y + stepY * step
      const cell = getCell(gameState.grid, { x: nx, y: ny })
      if (!cell || !cell.walkable) break  // mur ou hors grille → stop

      const atCell = gameState.entities.find(e => e.hp > 0 && e.position.x === nx && e.position.y === ny)
      if (atCell) {
        if (atCell.team !== entity.team) targets.push(cell)  // adversaire → surligner + stop
        break  // toute entité vivante arrête le scan
      }

      targets.push(cell)  // case libre → destination de déplacement possible
    }
  }
  spellRange = targets
}

function refreshSpellRange(): void {
  // Si le sort actif est en recharge pour l'entité courante, revenir en mode déplacement.
  if ((currentEntity().cooldowns?.[activeSpellId] ?? 0) > 0) {
    mode = 'move'
    spellRange = []
    return
  }
  if (activeSpellId === SPELL_CHARGE) { refreshChargeTargets(); return }
  const spell = getSpell(activeSpellId)
  if (!spell) { spellRange = []; return }
  spellRange = getSpellTargetCells(gameState.grid, currentEntity(), spell)
}

// ---------------------------------------------------------------------------
// Boucle IA
// ---------------------------------------------------------------------------

function runAIStep(): void {
  if (gameState.status !== 'ongoing') {
    aiTurnActive = false
    render()
    return
  }

  const action = getAIAction(gameState, gameState.currentEntityId)

  // Le MOVE est animé : on applique l'état immédiatement, puis on attend la fin de l'animation.
  if (action.type === 'MOVE') {
    const prevState      = gameState
    const fromPos        = currentEntity().position
    const blockedForAnim = new Set(
      gameState.entities
        .filter(e => e.id !== gameState.currentEntityId && e.hp > 0)
        .map(e => `${e.position.x},${e.position.y}`),
    )
    gameState = applyAction(gameState, action)
    if (gameState === prevState) {
      // Garde-fou : l'IA ne devrait jamais proposer un déplacement illégal,
      // mais si ça arrive on relance le cycle plutôt que de bloquer.
      setTimeout(runAIStep, AI_STEP_DELAY_MS)
      return
    }
    refreshReachable()
    refreshSpellRange()
    const aiPath = buildPath(gameState.grid, fromPos, action.to, blockedForAnim)
    entityDirections.set(action.entityId, directionFromPath(aiPath))
    startAnimation(action.entityId, aiPath, performance.now())
    pendingAfterAnimation = () => {
      if (gameState.status !== 'ongoing') { aiTurnActive = false; render(); return }
      if (isCurrentEntityEnemy()) setTimeout(runAIStep, 0)
      else { aiTurnActive = false; render() }
    }
    startRenderLoop()
    return
  }

  // USE_SPELL et END_TURN : pas d'animation de déplacement, délai fixe pour que le joueur voit l'action.
  const prevState = gameState
  gameState = applyAction(gameState, action)
  if (action.type === 'USE_SPELL') {
    triggerHitEffects(prevState, gameState)
    // Orienter le lanceur vers sa cible (charge → direction du mouvement ; sinon → direction vers la cible).
    const prevCaster = prevState.entities.find(e => e.id === action.entityId)
    const nextCaster = gameState.entities.find(e => e.id === action.entityId)
    if (prevCaster && nextCaster &&
        (prevCaster.position.x !== nextCaster.position.x ||
         prevCaster.position.y !== nextCaster.position.y)) {
      entityDirections.set(action.entityId, directionFromPath(
        buildDashAnimPath(prevCaster.position, nextCaster.position),
      ))
    } else if (prevCaster) {
      entityDirections.set(action.entityId, directionTo(prevCaster.position, action.target))
    }
  }
  refreshReachable()
  refreshSpellRange()
  render()
  if (action.type === 'USE_SPELL') startRenderLoop()  // anime les effets visuels en parallèle

  if (gameState.status !== 'ongoing') {
    aiTurnActive = false
    return
  }

  if (action.type === 'END_TURN') {
    if (isCurrentEntityEnemy()) {
      setTimeout(runAIStep, AI_STEP_DELAY_MS)
    } else {
      aiTurnActive = false
      render()
    }
  } else {
    setTimeout(runAIStep, AI_STEP_DELAY_MS)
  }
}

function startAITurn(): void {
  aiTurnActive = true
  render()  // efface les surlignages joueur immédiatement
  setTimeout(runAIStep, AI_STEP_DELAY_MS)
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

/**
 * Met à jour le HUD HTML pour refléter l'état courant du jeu.
 * Appelé à chaque render() — idempotent, rapide (lecture/écriture DOM minimale).
 */
function updateHudDOM(): void {
  const entity     = currentEntity()
  const gameOver   = gameState.status !== 'ongoing'
  const allDisabled = aiTurnActive || gameOver

  // Jauges PA
  if (hudApVal) hudApVal.textContent = String(entity.ap)
  if (hudApBar) hudApBar.style.width  = `${(entity.ap / entity.maxAp) * 100}%`

  // Jauges PM
  if (hudMpVal) hudMpVal.textContent = String(entity.mp)
  if (hudMpBar) hudMpBar.style.width  = `${(entity.mp / entity.maxMp) * 100}%`

  // Boutons de sort
  for (const btn of hudSpellButtons) {
    const spellId = btn.dataset['spellId']!
    const spell   = getSpell(spellId)
    const cd      = entity.cooldowns?.[spellId] ?? 0
    const onCd    = cd > 0
    const noAp    = !allDisabled && !onCd && spell !== undefined && entity.ap < spell.apCost
    const isActive = !allDisabled && !onCd && mode === 'spell' && activeSpellId === spellId

    // Coût PA réel depuis les données du sort
    const costEl = btn.querySelector<HTMLElement>('.hs-cost')
    if (costEl && spell) costEl.textContent = String(spell.apCost)

    // Indicateur de cooldown (chiffre + masquage)
    const cdEl = btn.querySelector<HTMLElement>('.hs-cd')
    if (cdEl) {
      cdEl.textContent = String(cd)
      cdEl.classList.toggle('hidden', !onCd)
    }

    btn.classList.toggle('active',      isActive)
    btn.classList.toggle('on-cooldown', onCd)
    btn.classList.toggle('no-ap',       noAp)
    btn.disabled = allDisabled || onCd
  }

  // Bouton Fin de tour
  if (hudEndTurnBtn) hudEndTurnBtn.disabled = allDisabled
}

/** Remplace la position des entités animées par leur position visuelle interpolée. */
function getVisualEntities(): Entity[] {
  const now = performance.now()
  return gameState.entities.map(e => {
    const vp = getVisualPosition(e.id, now)
    return vp ? { ...e, position: vp } : e
  })
}

/**
 * Lance la boucle requestAnimationFrame si elle n'est pas déjà active.
 * La boucle s'arrête d'elle-même quand toutes les animations sont terminées.
 */
function startRenderLoop(): void {
  if (rafId !== null) return
  rafId = requestAnimationFrame(animationLoop)
}

function animationLoop(now: number): void {
  const animsActive   = tickAnimations(now)
  const effectsActive = tickEffects(now)
  render()

  // La callback IA se déclenche dès que les animations de déplacement sont terminées,
  // sans attendre la fin des effets visuels (chiffres flottants, flash).
  if (!animsActive && pendingAfterAnimation !== null) {
    const cb = pendingAfterAnimation
    pendingAfterAnimation = null
    cb()
  }

  if (animsActive || effectsActive) {
    rafId = requestAnimationFrame(animationLoop)
  } else {
    rafId = null
  }
}

function render(): void {
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  renderGrid(ctx, gameState.grid, origin)

  // Les surlignages ne s'affichent que pendant le tour du joueur.
  if (!aiTurnActive) {
    if (mode === 'move') {
      renderHighlights(ctx, reachable, origin, hoveredPos)
    } else {
      renderSpellRange(ctx, spellRange, origin, hoveredPos)
    }
  }

  // Orientation dynamique : à chaque frame, on lit le segment actif de chaque entité animée.
  // Si pas d'animation, la direction reste celle du dernier déplacement (direction de repos).
  const now = performance.now()
  for (const entity of gameState.entities) {
    if (entity.hp <= 0) continue
    const seg = getCurrentSegment(entity.id, now)
    if (seg) entityDirections.set(entity.id, directionFromPath([seg.from, seg.to]))
  }

  const visualEntities    = getVisualEntities()
  const flashingEntities  = getFlashingEntities(now)
  renderEntities(ctx, visualEntities, origin, entityDirections, flashingEntities)
  renderDamageNumbers(ctx, getActiveDamageNumbers(now), visualEntities, origin)
  renderHUD(ctx, currentEntity())
  renderOverlay()
  updateHudDOM()
}

function renderOverlay(): void {
  if (gameState.status === 'ongoing') return

  // Voile semi-transparent par-dessus la scène.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const isVictory = gameState.status === 'victory'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  ctx.font      = 'bold 52px monospace'
  ctx.fillStyle = isVictory ? '#00ff88' : '#ff4455'
  ctx.fillText(isVictory ? 'Victoire !' : 'Defaite...', canvas.width / 2, canvas.height / 2 - 20)

  ctx.font      = '16px monospace'
  ctx.fillStyle = '#888888'
  ctx.fillText('Rechargez la page pour rejouer', canvas.width / 2, canvas.height / 2 + 36)

  // Réinitialiser l'alignement pour les autres draws.
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
}

function renderHUD(ctx: CanvasRenderingContext2D, entity: Entity): void {
  const pad  = 16
  const barW = 120
  const barH = 8

  ctx.font         = 'bold 13px monospace'
  ctx.textBaseline = 'top'

  // Barre PM
  ctx.fillStyle = '#aaaaaa'
  ctx.fillText('PM', pad, pad)
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(pad + 30, pad, barW, barH)
  ctx.fillStyle = '#56cfe1'
  ctx.fillRect(pad + 30, pad, barW * (entity.mp / entity.maxMp), barH)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${entity.mp} / ${entity.maxMp}`, pad + 30 + barW + 8, pad - 1)

  // Barre PA
  ctx.fillStyle = '#aaaaaa'
  ctx.fillText('PA', pad, pad + 20)
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(pad + 30, pad + 20, barW, barH)
  ctx.fillStyle = '#e9c46a'
  ctx.fillRect(pad + 30, pad + 20, barW * (entity.ap / entity.maxAp), barH)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${entity.ap} / ${entity.maxAp}`, pad + 30 + barW + 8, pad + 19)

  // Boutons de sort (désactivés pendant le tour ennemi)
  ctx.font      = '11px monospace'
  ctx.lineWidth = 1.5
  for (const { id, btn, label } of [
    { id: SPELL_COUP_EPEE, btn: COUP_EPEE_BTN, label: "Coup d'epee (3 PA)" },
    { id: SPELL_TIR_ARC,   btn: TIR_ARC_BTN,   label: "Tir a l'arc (4 PA)" },
    { id: SPELL_CHARGE,    btn: CHARGE_BTN,    label: 'Charge (2 PA)' },
  ]) {
    const cd         = entity.cooldowns?.[id] ?? 0
    const onCooldown = cd > 0
    const isDisabled = aiTurnActive || onCooldown
    const isActive   = !isDisabled && mode === 'spell' && activeSpellId === id
    // Quand en recharge : remplace "(N PA)" par "[cd: N]" pour ne pas confondre avec le coût PA.
    const displayLabel = onCooldown ? label.split(' (')[0] + ` [cd: ${cd}]` : label
    ctx.fillStyle   = isDisabled ? '#141414' : (isActive ? '#5a2a14' : '#1e2e1e')
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h)
    ctx.strokeStyle = isDisabled ? '#444444' : (isActive ? '#ff7832' : '#56cfe1')
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h)
    ctx.fillStyle   = isDisabled ? '#555555' : (isActive ? '#ff9a5c' : '#cccccc')
    ctx.fillText(displayLabel, btn.x + 6, btn.y + 6)
  }

  // Bouton "Fin de tour" (désactivé pendant le tour ennemi)
  ctx.fillStyle   = aiTurnActive ? '#141414' : '#1e1020'
  ctx.fillRect(END_TURN_BTN.x, END_TURN_BTN.y, END_TURN_BTN.w, END_TURN_BTN.h)
  ctx.strokeStyle = aiTurnActive ? '#444444' : '#c77dff'
  ctx.lineWidth   = 1.5
  ctx.strokeRect(END_TURN_BTN.x, END_TURN_BTN.y, END_TURN_BTN.w, END_TURN_BTN.h)
  ctx.fillStyle = aiTurnActive ? '#555555' : '#c77dff'
  ctx.font      = '11px monospace'
  ctx.fillText('Fin de tour', END_TURN_BTN.x + 8, END_TURN_BTN.y + 6)

  // Texte d'aide contextuel
  ctx.fillStyle = '#888888'
  ctx.font      = '10px monospace'
  if (aiTurnActive) {
    ctx.fillText(`Tour de ${entity.name}...`, pad, COUP_EPEE_BTN.y + COUP_EPEE_BTN.h + 6)
  } else {
    const spell    = getSpell(activeSpellId)
    const cdActive = entity.cooldowns?.[activeSpellId] ?? 0
    const canCast  = spell !== undefined && entity.ap >= spell.apCost && cdActive === 0
    const hint     = mode === 'move'
      ? (entity.mp === 0 ? 'Plus de PM disponibles' : 'Clic case bleue = deplacer')
      : (cdActive > 0 ? `En recharge : ${cdActive} tour(s)` : (canCast ? 'Clic case orange = lancer' : 'PA insuffisants'))
    ctx.fillText(hint, pad, COUP_EPEE_BTN.y + COUP_EPEE_BTN.h + 6)
  }
}

/**
 * Construit le chemin d'animation pour un déplacement en ligne droite (dash).
 * Chaque case intermédiaire est listée pour que la vitesse soit identique
 * à un déplacement normal (100 ms par case).
 */
function buildDashAnimPath(from: Position, to: Position): Position[] {
  const stepX = Math.sign(to.x - from.x)
  const stepY = Math.sign(to.y - from.y)
  const path: Position[] = [from]
  let cur = from
  while (cur.x !== to.x || cur.y !== to.y) {
    cur = { x: cur.x + stepX, y: cur.y + stepY }
    path.push({ ...cur })
  }
  return path
}

// ---------------------------------------------------------------------------
// Événements souris
// ---------------------------------------------------------------------------

canvas.addEventListener('mousemove', (e) => {
  if (aiTurnActive) return
  const rect   = canvas.getBoundingClientRect()
  const newPos = screenToGrid(
    { screenX: e.clientX - rect.left, screenY: e.clientY - rect.top },
    origin,
  )
  if (hoveredPos?.x === newPos.x && hoveredPos?.y === newPos.y) return
  hoveredPos = newPos
  render()
})

canvas.addEventListener('mouseleave', () => {
  if (aiTurnActive) return
  hoveredPos = null
  render()
})

canvas.addEventListener('click', (e) => {
  if (aiTurnActive) return  // bloquer les clics pendant le tour ennemi

  const rect   = canvas.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const clickY = e.clientY - rect.top

  // Clic sur un bouton de sort : activer ce sort (re-cliquer le sort actif = retour mode déplacement).
  for (const { id, btn } of [
    { id: SPELL_COUP_EPEE, btn: COUP_EPEE_BTN },
    { id: SPELL_TIR_ARC,   btn: TIR_ARC_BTN },
    { id: SPELL_CHARGE,    btn: CHARGE_BTN },
  ]) {
    if (clickX >= btn.x && clickX <= btn.x + btn.w && clickY >= btn.y && clickY <= btn.y + btn.h) {
      if ((currentEntity().cooldowns?.[id] ?? 0) > 0) return  // sort en recharge : clic ignoré
      if (mode === 'spell' && activeSpellId === id) {
        mode = 'move'
      } else {
        activeSpellId = id
        mode = 'spell'
        refreshSpellRange()
      }
      render()
      return
    }
  }

  // Clic sur le bouton "Fin de tour".
  if (
    clickX >= END_TURN_BTN.x && clickX <= END_TURN_BTN.x + END_TURN_BTN.w &&
    clickY >= END_TURN_BTN.y && clickY <= END_TURN_BTN.y + END_TURN_BTN.h
  ) {
    gameState = applyAction(gameState, { type: 'END_TURN', entityId: gameState.currentEntityId })
    mode = 'move'
    refreshReachable()
    refreshSpellRange()
    render()
    if (isCurrentEntityEnemy()) startAITurn()
    return
  }

  const pos = screenToGrid({ screenX: clickX, screenY: clickY }, origin)
  if (!getCell(gameState.grid, pos)) return

  if (mode === 'move') {
    const prevState      = gameState
    const fromPos        = currentEntity().position
    const entityId       = gameState.currentEntityId
    const blockedForAnim = new Set(
      gameState.entities
        .filter(e => e.id !== entityId && e.hp > 0)
        .map(e => `${e.position.x},${e.position.y}`),
    )
    gameState = applyAction(gameState, { type: 'MOVE', entityId, to: pos })
    if (gameState === prevState) return  // déplacement refusé par le core : on ne fait rien
    refreshReachable()
    refreshSpellRange()
    const path = buildPath(gameState.grid, fromPos, pos, blockedForAnim)
    entityDirections.set(entityId, directionFromPath(path))
    startAnimation(entityId, path, performance.now())
    startRenderLoop()
  } else {
    // Mode sort : envoyer USE_SPELL. Si l'état a changé, le sort a été appliqué.
    const entityId  = gameState.currentEntityId
    const prevState = gameState
    gameState = applyAction(gameState, {
      type: 'USE_SPELL', entityId, spellId: activeSpellId, target: pos,
    })
    if (gameState !== prevState) {
      triggerHitEffects(prevState, gameState)

      // Si le lanceur s'est physiquement déplacé (ex. charge), animer le glissement.
      const prevCaster = prevState.entities.find(e => e.id === entityId)
      const nextCaster = gameState.entities.find(e => e.id === entityId)
      if (
        prevCaster && nextCaster &&
        (prevCaster.position.x !== nextCaster.position.x ||
         prevCaster.position.y !== nextCaster.position.y)
      ) {
        // Charge : le lanceur s'est déplacé → orienter dans la direction du mouvement.
        const dashAnimPath = buildDashAnimPath(prevCaster.position, nextCaster.position)
        entityDirections.set(entityId, directionFromPath(dashAnimPath))
        startAnimation(entityId, dashAnimPath, performance.now())
      } else if (prevCaster) {
        // Sort sans déplacement (coup-epee, tir-arc) : tourner vers la case cible.
        entityDirections.set(entityId, directionTo(prevCaster.position, pos))
      }

      refreshReachable()
      refreshSpellRange()
      startRenderLoop()  // la boucle RAF gère le rendu + l'animation des effets
    }
  }
})

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

initEntityDirections()
refreshReachable()
refreshSpellRange()
spritesReady.then(() => render())
