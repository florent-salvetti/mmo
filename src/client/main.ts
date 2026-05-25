import type { Cell, Entity, GameState, Position } from '../shared/types'
import { getReachableCells } from '../core/movement'
import { getSpell, getSpellTargetCells } from '../core/spells'
import { getCell } from '../core/grid'
import { applyAction } from '../core/reducer'
import { getAIAction } from '../core/ai'
import { renderGrid, renderHighlights, renderSpellRange, renderEntities, renderDamageNumbers, spritesReady, type PlayerDirection } from './render/gridRenderer'
import { startDamageNumber, startFlash, tickEffects, getActiveDamageNumbers, getFlashingEntities } from './effects'
import { computeOrigin, screenToGrid, TILE_WIDTH, TILE_HEIGHT } from './render/projection'
import { buildPath, startAnimation, tickAnimations, getVisualPosition, getCurrentSegment } from './animation'
import { getUpcomingTurns } from '../core/turnOrder'

// ---------------------------------------------------------------------------
// État initial de démonstration
// ---------------------------------------------------------------------------

const GRID_W = 12
const GRID_H = 12
// Trous : bloquent le mouvement, transparents pour la ligne de vue
const HOLES = new Set(['2,3', '2,4', '2,5'])
// Cubes : bloquent le mouvement ET la ligne de vue
const CUBES = new Set(['3,2', '7,6', '6,7', '6,6'])

const grid: Cell[][] = Array.from({ length: GRID_H }, (_, y) =>
  Array.from({ length: GRID_W }, (_, x) => {
    const key = `${x},${y}`
    const obstacle = HOLES.has(key) ? 'hole' as const
                   : CUBES.has(key) ? 'cube' as const
                   : undefined
    return { position: { x, y }, walkable: obstacle === undefined, obstacle }
  }),
)

let gameState: GameState = {
  grid,
  entities: [
    { id: 'player-1', name: 'Kirito', team: 'player',
      position: { x: 1, y: 1 }, hp: 100, maxHp: 100, ap: 6, maxAp: 6, mp: 3, maxMp: 3 },
    { id: 'enemy-1', name: 'Sanglier A', team: 'enemy', creatureType: 'sanglier',
      position: { x: 4, y: 1 }, hp: 40, maxHp: 40, ap: 6, maxAp: 6, mp: 2, maxMp: 2 },
    { id: 'enemy-2', name: 'Sanglier B', team: 'enemy', creatureType: 'sanglier',
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

// Taille CSS courante et ratio de densité — mis à jour à chaque resize.
let dpr       = 1
let cssW      = 0
let cssH      = 0
let origin    = { screenX: 0, screenY: 0 }
let gridScale = 1   // facteur d'agrandissement calculé au resize

/**
 * Appelé au démarrage et à chaque resize de fenêtre.
 * Ajuste la résolution interne du canvas (attributs width/height) pour coller
 * à sa taille CSS × devicePixelRatio (rendu net sur écrans haute densité),
 * recalcule l'origine isométrique, puis relance le rendu.
 */
function handleResize(): void {
  const rect    = canvas.getBoundingClientRect()
  const newDpr  = window.devicePixelRatio || 1
  const newCssW = rect.width
  const newCssH = rect.height
  if (newCssW === 0 || newCssH === 0) return
  dpr  = newDpr
  cssW = newCssW
  cssH = newCssH
  canvas.width  = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)

  // Taille de la grille en pixels natifs (sans scale)
  const gridPixW = (GRID_W + GRID_H) * (TILE_WIDTH  / 2)
  const gridPixH = (GRID_W + GRID_H) * (TILE_HEIGHT / 2)
  // Scale pour remplir ~92 % de l'espace disponible
  gridScale = Math.min(cssW / gridPixW, cssH / gridPixH) * 0.92

  // L'origine est calculée dans l'espace logique (cssW/gridScale × cssH/gridScale)
  origin = computeOrigin(GRID_W, GRID_H, cssW / gridScale, cssH / gridScale)
  render()
}

// ---------------------------------------------------------------------------
// Références DOM du HUD HTML (cachées une fois au démarrage)
// ---------------------------------------------------------------------------

const hudApVal        = document.querySelector<HTMLElement>('.v.ap')
const hudMpVal        = document.querySelector<HTMLElement>('.v.mp')
const hudSpellButtons = document.querySelectorAll<HTMLButtonElement>('.spell[data-spell-id]')
const hudEndTurnBtn   = document.querySelector<HTMLButtonElement>('.end-turn-btn')
const hudTurnNumEl    = document.querySelector<HTMLElement>('.turn-numval')
const hudActiveActor  = document.querySelector<HTMLElement>('.active-actor')
const hudTimerEl      = document.querySelector<HTMLElement>('.turn-timer')
const hudTimerValEl   = document.querySelector<HTMLElement>('.timer-value')
const hudTimerFillEl  = document.querySelector<SVGCircleElement>('.timer-fill')
const hudTimelineEl   = document.querySelector<HTMLElement>('.timeline-track')
const hudAlliesEl     = document.querySelector<HTMLElement>('.portraits-allies')
const hudEnemiesEl    = document.querySelector<HTMLElement>('.portraits-enemies')
const hudLogEntriesEl = document.querySelector<HTMLElement>('.log-entries')
const hudLogCountEl   = document.querySelector<HTMLElement>('.log-count')
const leftTabBtn      = document.querySelector<HTMLButtonElement>('.mobile-tab.left-tab')
const rightTabBtn     = document.querySelector<HTMLButtonElement>('.mobile-tab.right-tab')
const mobileBackdrop  = document.querySelector<HTMLElement>('.mobile-backdrop')
const leftPanel       = document.querySelector<HTMLElement>('.side-panel.left')
const rightPanel      = document.querySelector<HTMLElement>('.side-panel.right')

// ---------------------------------------------------------------------------
// État de l'UI
// ---------------------------------------------------------------------------

type UIMode = 'move' | 'spell'

const SPELL_COUP_EPEE  = 'coup-epee'
const SPELL_TIR_ARC    = 'tir-arc'
const SPELL_CHARGE     = 'charge'
const AI_STEP_DELAY_MS = 500  // pause entre chaque action IA (visible à l'écran)

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

// ---------------------------------------------------------------------------
// Timer de tour et journal de combat
// ---------------------------------------------------------------------------

const TURN_DURATION = 30
let timeLeft    = TURN_DURATION
let timerHandle: ReturnType<typeof setInterval> | null = null

type LogEntry = { turn: number; html: string; type?: string }
const logEntries: LogEntry[] = []

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

function updateTimerDOM(): void {
  if (hudTimerValEl) hudTimerValEl.textContent = String(timeLeft)
  if (hudTimerFillEl) {
    const pct = timeLeft / TURN_DURATION
    hudTimerFillEl.style.strokeDasharray = `${pct * 94.25} 94.25`
  }
  if (hudTimerEl) hudTimerEl.classList.toggle('is-low', timeLeft <= 10)
}

function startTurnTimer(): void {
  if (timerHandle !== null) { clearInterval(timerHandle); timerHandle = null }
  timeLeft = TURN_DURATION
  updateTimerDOM()
  timerHandle = setInterval(() => {
    timeLeft = Math.max(0, timeLeft - 1)
    updateTimerDOM()
    if (timeLeft === 0) {
      clearInterval(timerHandle!)
      timerHandle = null
      if (!aiTurnActive) doEndTurn()
    }
  }, 1000)
}

function pushLog(html: string, type?: string): void {
  logEntries.push({ turn: gameState.turn, html, type })
  if (hudLogEntriesEl) {
    const entry = document.createElement('div')
    entry.className = type ? `log-entry ${type}` : 'log-entry'
    entry.innerHTML = `<span class="log-time">${gameState.turn}</span><span>${html}</span>`
    hudLogEntriesEl.appendChild(entry)
    hudLogEntriesEl.scrollTop = hudLogEntriesEl.scrollHeight
  }
  if (hudLogCountEl) hudLogCountEl.textContent = String(logEntries.length)
}

/**
 * Génère une ou plusieurs entrées de journal pour un lancer de sort.
 * Compare prev/next pour détecter les dégâts et les morts sans avoir besoin
 * de connaître la cible à l'avance (fonctionne aussi pour la charge multi-cases).
 */
function logSpellUse(prev: GameState, next: GameState, casterId: string, spellId: string): void {
  const caster = prev.entities.find(e => e.id === casterId)
  const spell  = getSpell(spellId)
  if (!caster || !spell) return

  const casterCls = caster.team === 'player' ? 'actor' : 'target'

  const hits: Array<{ name: string; cls: string; dmg: number; died: boolean }> = []
  for (const nextEnt of next.entities) {
    const prevEnt = prev.entities.find(e => e.id === nextEnt.id)
    if (!prevEnt || nextEnt.hp >= prevEnt.hp) continue
    hits.push({
      name: prevEnt.name,
      cls:  prevEnt.team === 'player' ? 'actor' : 'target',
      dmg:  prevEnt.hp - nextEnt.hp,
      died: nextEnt.hp <= 0,
    })
  }

  if (hits.length > 0) {
    for (const hit of hits) {
      pushLog(`<span class="${casterCls}">${caster.name}</span> lance <b>${spell.name}</b> → <span class="${hit.cls}">${hit.name}</span> <span class="dmg">−${hit.dmg}</span>`)
      if (hit.died) pushLog(`<span class="${hit.cls}">${hit.name}</span> est éliminé.`, 'system')
    }
  } else {
    pushLog(`<span class="${casterCls}">${caster.name}</span> lance <b>${spell.name}</b>.`)
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
      else { aiTurnActive = false; startTurnTimer(); render() }
    }
    startRenderLoop()
    return
  }

  // USE_SPELL et END_TURN : pas d'animation de déplacement, délai fixe pour que le joueur voit l'action.
  const prevState = gameState
  gameState = applyAction(gameState, action)
  if (action.type === 'USE_SPELL') {
    triggerHitEffects(prevState, gameState)
    logSpellUse(prevState, gameState, action.entityId, action.spellId)
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
    const nextEntity = gameState.entities.find(e => e.id === gameState.currentEntityId)
    const nextCls = nextEntity?.team === 'enemy' ? 'target' : 'actor'
    pushLog(`<span class="${nextCls}">${nextEntity?.name ?? '?'}</span> commence son tour.`, 'system')
    if (isCurrentEntityEnemy()) {
      setTimeout(runAIStep, AI_STEP_DELAY_MS)
    } else {
      aiTurnActive = false
      startTurnTimer()
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

/** Génère le HTML d'une carte portrait pour un panneau latéral. */
function makePortraitCard(entity: Entity, isActive: boolean): string {
  const dead   = entity.hp <= 0
  const hpPct  = Math.round((entity.hp / entity.maxHp) * 100)
  const apPct  = dead ? 0 : Math.round((entity.ap / entity.maxAp) * 100)
  const mpPct  = dead ? 0 : Math.round((entity.mp / entity.maxMp) * 100)
  const glyph  = entity.name.charAt(0).toUpperCase()
  const variant = entity.team === 'player' ? 'is-player'
                : isActive                 ? 'is-target'
                :                            'is-enemy'
  const cls = ['portrait-card', variant, dead ? 'is-dead' : ''].filter(Boolean).join(' ')
  return `<div class="${cls}">
    <div class="portrait-head">
      <div class="portrait-frame">
        <span class="portrait-glyph">${glyph}</span>
      </div>
      <div class="portrait-info">
        <div class="portrait-name">${entity.name}${dead ? ' †' : ''}</div>
        <div class="portrait-class">${entity.team === 'enemy' ? 'Ennemi' : 'Joueur'}</div>
      </div>
    </div>
    <div class="stat-bars">
      <div class="stat-row hp">
        <span class="stat-label">PV</span>
        <div class="stat-track"><div class="stat-fill" style="width:${hpPct}%"></div></div>
        <span class="stat-val"><strong>${entity.hp}</strong>/${entity.maxHp}</span>
      </div>
      ${dead ? '' : `<div class="stat-row ap">
        <span class="stat-label">PA</span>
        <div class="stat-track"><div class="stat-fill" style="width:${apPct}%"></div></div>
        <span class="stat-val"><strong>${entity.ap}</strong>/${entity.maxAp}</span>
      </div>
      <div class="stat-row mp">
        <span class="stat-label">PM</span>
        <div class="stat-track"><div class="stat-fill" style="width:${mpPct}%"></div></div>
        <span class="stat-val"><strong>${entity.mp}</strong>/${entity.maxMp}</span>
      </div>`}
    </div>
  </div>`
}

/**
 * Met à jour le HUD HTML pour refléter l'état courant du jeu.
 * Appelé à chaque render() — idempotent, rapide (lecture/écriture DOM minimale).
 */
function updateHudDOM(): void {
  const entity      = currentEntity()
  const gameOver    = gameState.status !== 'ongoing'
  const allDisabled = aiTurnActive || gameOver

  // Valeurs PA / PM dans la barre de sorts
  if (hudApVal) hudApVal.textContent = String(entity.ap)
  if (hudMpVal) hudMpVal.textContent = String(entity.mp)

  // Boutons de sort
  for (const btn of hudSpellButtons) {
    const spellId  = btn.dataset['spellId']!
    const spell    = getSpell(spellId)
    const cd       = entity.cooldowns?.[spellId] ?? 0
    const onCd     = cd > 0
    const noAp     = !allDisabled && !onCd && spell !== undefined && entity.ap < spell.apCost
    const isActive = !allDisabled && !onCd && mode === 'spell' && activeSpellId === spellId

    const costEl = btn.querySelector<HTMLElement>('.spell-cost')
    if (costEl && spell) costEl.textContent = String(spell.apCost)

    const cdEl = btn.querySelector<HTMLElement>('.hs-cd')
    if (cdEl) {
      cdEl.textContent = String(cd)
      cdEl.classList.toggle('hidden', !onCd)
    }

    btn.classList.toggle('is-selected', isActive)
    btn.classList.toggle('is-disabled', !spell || onCd || noAp || allDisabled)
    btn.disabled = allDisabled || onCd || !spell
  }

  // Bouton Fin de tour
  if (hudEndTurnBtn) hudEndTurnBtn.disabled = allDisabled

  // Hint contextuel

  // Numéro de tour
  if (hudTurnNumEl) hudTurnNumEl.textContent = String(gameState.turn).padStart(2, '0')

  // Carte acteur courant
  if (hudActiveActor) {
    const isEnemy = entity.team === 'enemy'
    hudActiveActor.className = `active-actor ${isEnemy ? 'is-enemy' : 'is-player'}`
    const hpPct = Math.round((entity.hp / entity.maxHp) * 100)
    hudActiveActor.innerHTML = `
      <div class="aa-hex"><span class="aa-glyph">${entity.name.charAt(0).toUpperCase()}</span></div>
      <div class="aa-info">
        <div class="aa-label">${isEnemy ? 'ENNEMI' : 'À VOUS DE JOUER'}</div>
        <div class="aa-name">${entity.name}</div>
        <div class="aa-hp">
          <div class="aa-hp-fill" style="width:${hpPct}%"></div>
          <span class="aa-hp-text mono">${entity.hp}/${entity.maxHp}</span>
        </div>
      </div>`
  }

  // Timeline d'initiative (tokens à venir, hors acteur courant)
  if (hudTimelineEl) {
    const turns = getUpcomingTurns(gameState, 9).slice(1)
    hudTimelineEl.innerHTML = turns.map(e => {
      const cls = `turn-token ${e.team === 'player' ? 'is-player' : 'is-enemy'}`
      return `<div class="${cls}">
        <span class="tt-label">${e.name.charAt(0).toUpperCase()}</span>
        <span class="tt-name">${e.name}</span>
      </div>`
    }).join('')
  }

  // Panneaux de portraits
  if (hudAlliesEl) {
    hudAlliesEl.innerHTML = gameState.entities
      .filter(e => e.team === 'player')
      .map(e => makePortraitCard(e, e.id === gameState.currentEntityId))
      .join('')
  }
  if (hudEnemiesEl) {
    hudEnemiesEl.innerHTML = gameState.entities
      .filter(e => e.team === 'enemy')
      .map(e => makePortraitCard(e, e.id === gameState.currentEntityId))
      .join('')
  }
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
  // Applique l'échelle DPR : tout ce qui est dessiné ensuite utilise des coordonnées
  // CSS (pixels logiques), quel que soit le devicePixelRatio.
  const logW = cssW / gridScale
  const logH = cssH / gridScale
  ctx.setTransform(dpr * gridScale, 0, 0, dpr * gridScale, 0, 0)
  ctx.fillStyle = '#060912'
  ctx.fillRect(0, 0, logW, logH)

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
  renderOverlay()
  updateHudDOM()
}

function renderOverlay(): void {
  if (gameState.status === 'ongoing') return

  const logW = cssW / gridScale
  const logH = cssH / gridScale

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
  ctx.fillRect(0, 0, logW, logH)

  const isVictory = gameState.status === 'victory'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  ctx.font      = 'bold 52px monospace'
  ctx.fillStyle = isVictory ? '#00ff88' : '#ff4455'
  ctx.fillText(isVictory ? 'Victoire !' : 'Defaite...', logW / 2, logH / 2 - 20)

  ctx.font      = '16px monospace'
  ctx.fillStyle = '#888888'
  ctx.fillText('Rechargez la page pour rejouer', logW / 2, logH / 2 + 36)

  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
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
// Actions UI réutilisables (canvas + boutons HTML)
// ---------------------------------------------------------------------------

/**
 * Sélectionne un sort (passe en mode spell) ou revient en mode déplacement
 * si le sort était déjà sélectionné. Sans effet pendant le tour ennemi ou si
 * le sort est en cooldown.
 */
function selectSpell(spellId: string): void {
  if (aiTurnActive) return
  if ((currentEntity().cooldowns?.[spellId] ?? 0) > 0) return
  if (mode === 'spell' && activeSpellId === spellId) {
    mode = 'move'
  } else {
    activeSpellId = spellId
    mode = 'spell'
    refreshSpellRange()
  }
  render()
}

/** Termine le tour du joueur courant. Sans effet pendant le tour ennemi. */
function doEndTurn(): void {
  if (aiTurnActive) return
  if (timerHandle !== null) { clearInterval(timerHandle); timerHandle = null }
  gameState = applyAction(gameState, { type: 'END_TURN', entityId: gameState.currentEntityId })
  mode = 'move'
  refreshReachable()
  refreshSpellRange()
  const next = currentEntity()
  const nextCls = next.team === 'enemy' ? 'target' : 'actor'
  pushLog(`<span class="${nextCls}">${next.name}</span> commence son tour.`, 'system')
  render()
  if (isCurrentEntityEnemy()) startAITurn()
  else startTurnTimer()
}

// ---------------------------------------------------------------------------
// Événements souris
// ---------------------------------------------------------------------------

/**
 * Convertit un événement souris en coordonnées logiques du jeu (pixels CSS),
 * cohérentes avec origin et screenToGrid.
 *
 * Le facteur cssW / rect.width normalise un éventuel écart entre la taille
 * CSS mesurée au clic et celle qui a servi à calculer origin au dernier resize
 * (vaut 1 en fonctionnement normal, garde les deux espaces cohérents si le
 * ResizeObserver n'a pas encore recalculé origin après un resize très rapide).
 */
function canvasPoint(e: MouseEvent): { screenX: number; screenY: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    screenX: (e.clientX - rect.left) * (cssW / rect.width)  / gridScale,
    screenY: (e.clientY - rect.top)  * (cssH / rect.height) / gridScale,
  }
}

canvas.addEventListener('mousemove', (e) => {
  if (aiTurnActive) return
  const newPos = screenToGrid(canvasPoint(e), origin)
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

  const pos = screenToGrid(canvasPoint(e), origin)
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
      mode = 'move'
      triggerHitEffects(prevState, gameState)
      logSpellUse(prevState, gameState, entityId, activeSpellId)

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
// Boutons HUD HTML
// ---------------------------------------------------------------------------

for (const btn of hudSpellButtons) {
  btn.addEventListener('click', () => {
    const spellId = btn.dataset['spellId']!
    selectSpell(spellId)
  })
}

hudEndTurnBtn?.addEventListener('click', () => doEndTurn())

// ---------------------------------------------------------------------------
// Clavier
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (e.repeat) return
  switch (e.key.toUpperCase()) {
    case 'A': selectSpell(SPELL_COUP_EPEE); break
    case 'Z': selectSpell(SPELL_TIR_ARC);  break
    case 'E': selectSpell(SPELL_CHARGE);   break
    case 'F':
    case ' ':
      e.preventDefault()
      doEndTurn()
      break
    case 'ESCAPE':
      if (mode === 'spell') { mode = 'move'; render() }
      break
  }
})

// ---------------------------------------------------------------------------
// Panneaux mobiles
// ---------------------------------------------------------------------------

function toggleMobilePanel(side: 'left' | 'right'): void {
  const panel     = side === 'left' ? leftPanel    : rightPanel
  const tab       = side === 'left' ? leftTabBtn   : rightTabBtn
  const otherPanel = side === 'left' ? rightPanel   : leftPanel
  const otherTab   = side === 'left' ? rightTabBtn  : leftTabBtn
  const isActive  = panel?.classList.contains('mobile-active') ?? false
  otherPanel?.classList.remove('mobile-active')
  otherTab?.classList.remove('active')
  if (isActive) {
    panel?.classList.remove('mobile-active')
    tab?.classList.remove('active')
    if (mobileBackdrop) mobileBackdrop.style.display = 'none'
  } else {
    panel?.classList.add('mobile-active')
    tab?.classList.add('active')
    if (mobileBackdrop) mobileBackdrop.style.display = 'block'
  }
}

leftTabBtn?.addEventListener('click',  () => toggleMobilePanel('left'))
rightTabBtn?.addEventListener('click', () => toggleMobilePanel('right'))
mobileBackdrop?.addEventListener('click', () => {
  leftPanel?.classList.remove('mobile-active')
  rightPanel?.classList.remove('mobile-active')
  leftTabBtn?.classList.remove('active')
  rightTabBtn?.classList.remove('active')
  if (mobileBackdrop) mobileBackdrop.style.display = 'none'
})

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

initEntityDirections()
refreshReachable()
refreshSpellRange()
handleResize()                                     // dimensionne le canvas et premier rendu
new ResizeObserver(handleResize).observe(canvas)   // recalcul à chaque resize de fenêtre
spritesReady.then(() => render())                  // relance quand les sprites sont chargés
pushLog(`Combat commencé. À <span class="actor">${currentEntity().name}</span> de jouer !`, 'system')
startTurnTimer()
