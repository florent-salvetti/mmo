import type { Cell, CombatArena, Entity, GameState, MapDefinition, MonsterGroup, Position } from '../shared/types'
import { createGameStateFromMap, createCombatStateFromArena } from '../core/mapLoader'
import combat01Raw from '../../data/maps/combat-01.json'
import combat02Raw from '../../data/maps/combat-02.json'
import arena01Raw  from '../../data/arenas/arena-01.json'
import { getReachableCells } from '../core/movement'
import { getSpell, getSpellTargetCells } from '../core/spells'
import { getCell } from '../core/grid'
import { applyAction } from '../core/reducer'
import { getAIAction } from '../core/ai'
import { renderGrid, renderHighlights, renderSpellRange, renderExitHighlights, renderCubesAndEntities, renderDamageNumbers, spritesReady, hitTestEntitySprite, hasSpriteAnimation, triggerAttackAnimation, resetAttackAnimations, type PlayerDirection } from './render/gridRenderer'
import { startDamageNumber, startFlash, tickEffects, getActiveDamageNumbers, getFlashingEntities, resetEffects } from './effects'
import { computeOrigin, gridToScreen, screenToGrid, TILE_WIDTH, TILE_HEIGHT } from './render/projection'
import { buildPath, startAnimation, tickAnimations, getVisualPosition, getCurrentSegment, resetAnimations } from './animation'
import { getUpcomingTurns } from '../core/turnOrder'

// ---------------------------------------------------------------------------
// État initial — construit depuis la définition de map
// ---------------------------------------------------------------------------

let currentMapDef: MapDefinition = combat01Raw as unknown as MapDefinition
let gameState: GameState         = createGameStateFromMap(currentMapDef)

/** Registre de toutes les maps disponibles, indexées par id. */
const mapRegistry = new Map<string, MapDefinition>([
  ['combat-01', combat01Raw as unknown as MapDefinition],
  ['combat-02', combat02Raw as unknown as MapDefinition],
])

/** Arène de combat dédiée — terrain indépendant des maps d'exploration. */
const combatArena: CombatArena = arena01Raw as unknown as CombatArena

/**
 * Contexte d'exploration mémorisé au déclenchement d'un combat.
 * Utilisé en brique 3 pour retourner exactement là d'où on est parti.
 */
let returnMapDef: MapDefinition | null = null
let returnPlayerPosition: Position | null = null

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
  hideGroupPopup()  // position isoméétrique obsolète après resize
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

  const gridW = gameState.grid[0].length
  const gridH = gameState.grid.length
  // Taille de la grille en pixels natifs (sans scale)
  const gridPixW = (gridW + gridH) * (TILE_WIDTH  / 2)
  const gridPixH = (gridW + gridH) * (TILE_HEIGHT / 2)
  // Scale pour remplir ~92 % de l'espace disponible
  gridScale = Math.min(cssW / gridPixW, cssH / gridPixH) * 0.92

  // L'origine est calculée dans l'espace logique (cssW/gridScale × cssH/gridScale)
  origin = computeOrigin(gridW, gridH, cssW / gridScale, cssH / gridScale)
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
const combatAppEl       = document.querySelector<HTMLElement>('.combat-app')
const summaryEl         = document.getElementById('combat-summary')
const summaryTitleEl    = document.getElementById('summary-title')
const summaryStatsEl    = document.getElementById('summary-stats')
const summaryRewardsEl  = document.getElementById('summary-rewards')
const summaryContinueEl = document.getElementById('summary-continue-btn') as HTMLButtonElement | null
const groupPopupEl      = document.getElementById('group-popup')
const gpopConfirmEl     = document.getElementById('gpop-confirm') as HTMLButtonElement | null
const gpopCancelEl      = document.getElementById('gpop-cancel')  as HTMLButtonElement | null
const hudAbandonBtn     = document.getElementById('abandon-btn')  as HTMLButtonElement | null
const abandonModalEl    = document.getElementById('abandon-modal')
const abandonConfirmEl  = document.getElementById('abandon-confirm-btn') as HTMLButtonElement | null
const abandonCancelEl   = document.getElementById('abandon-cancel-btn')  as HTMLButtonElement | null

// ---------------------------------------------------------------------------
// État de l'UI
// ---------------------------------------------------------------------------

type UIMode    = 'move' | 'spell'
type GameMode  = 'combat' | 'exploration'

const SPELL_COUP_EPEE  = 'coup-epee'
const SPELL_TIR_ARC    = 'tir-arc'
const SPELL_CHARGE     = 'charge'
const AI_STEP_DELAY_MS = 500  // pause entre chaque action IA (visible à l'écran)

let gameMode:      GameMode = 'exploration'
/** Id du groupe actuellement en combat (null = hors combat ou non initialisé).
 *  Exporté : sera lu par la brique suivante pour retirer le groupe vaincu de la map. */
export let activeGroupId: string | null = null
/** Groupe en attente de confirmation (popup visible). Null = pas de popup ouverte. */
let pendingGroup: MonsterGroup | null = null
/** Vrai pendant l'animation de course vers les monstres — bloque les clics canvas. */
let combatRunActive = false
/** Position du joueur en exploration juste avant la course de déclenchement du combat. */
let preRunPlayerPos: Position | null = null
/** Vrai entre la détection d'une fin de combat et le retour en exploration (évite les doubles déclenchements). */
let combatEndScheduled = false
let mode:          UIMode  = 'move'
let activeSpellId: string  = SPELL_COUP_EPEE  // sort actif quand mode === 'spell'
let hoveredPos:    Position | null = null
// Direction visuelle courante de chaque entité — initialisée au premier déplacement (défaut 'SE' à la lecture).
const entityDirections = new Map<string, PlayerDirection>()
let reachable:     Cell[]          = []
let spellRange:    Cell[]          = []
let exitCells:     Cell[]          = []
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

/** Bascule le mode de jeu. En exploration : coupe le combat. En combat : relance le tour.
 *  Exportée : sera appelée par le déclenchement de combat (brique suivante). */
export function setGameMode(newMode: GameMode): void {
  if (gameMode === newMode) return
  gameMode = newMode
  if (newMode === 'exploration') {
    stopTimer()
    aiTurnActive = false
    mode = 'move'
    combatAppEl?.classList.add('mode-exploration')
  } else {
    combatAppEl?.classList.remove('mode-exploration')
    refreshReachable()
    refreshSpellRange()
    if (gameState.status === 'ongoing') {
      if (isCurrentEntityEnemy()) startAITurn()  // [MODE COMBAT]
      else startTurnTimer()                      // [MODE COMBAT]
    }
  }
  // handleResize recalcule gridScale pour le nouveau layout (canvas plus grand/petit)
  // puis appelle render() — indispensable au changement de mode.
  handleResize()
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

function stopTimer(): void {
  if (timerHandle !== null) { clearInterval(timerHandle); timerHandle = null }
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

/**
 * Calcule les cases de bord qui mènent à une map voisine.
 * Relit currentMapDef.neighbors : si 'est' existe → colonne la plus à droite, etc.
 * N'inclut que les cases walkable (le joueur doit pouvoir s'y tenir pour sortir).
 */
function computeExitCells(): void {
  exitCells = []
  const neighbors = currentMapDef.neighbors
  if (!neighbors) return
  const gridH = gameState.grid.length
  const gridW = gameState.grid[0]?.length ?? 0

  for (const row of gameState.grid) {
    for (const cell of row) {
      const { x, y } = cell.position
      if (!cell.walkable) continue
      if (neighbors.est   && x === gridW - 1) { exitCells.push(cell); continue }
      if (neighbors.ouest && x === 0)          { exitCells.push(cell); continue }
      if (neighbors.nord  && y === 0)          { exitCells.push(cell); continue }
      if (neighbors.sud   && y === gridH - 1)  { exitCells.push(cell); continue }
    }
  }
}

// ---------------------------------------------------------------------------
// Boucle IA
// ---------------------------------------------------------------------------

function runAIStep(): void {
  if (gameState.status !== 'ongoing') {
    aiTurnActive = false
    checkCombatEnd()
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
      if (gameState.status !== 'ongoing') { aiTurnActive = false; checkCombatEnd(); render(); return }
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
    checkCombatEnd()
    render()
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
  const entity       = currentEntity()
  const playerEntity = gameState.entities.find(e => e.team === 'player') ?? entity
  const gameOver    = gameState.status !== 'ongoing'
  const allDisabled = aiTurnActive || gameOver

  // Valeurs PA / PM dans la barre de sorts (toujours celles du joueur)
  if (hudApVal) hudApVal.textContent = String(playerEntity.ap)
  if (hudMpVal) hudMpVal.textContent = String(playerEntity.mp)

  // Boutons de sort
  for (const btn of hudSpellButtons) {
    const spellId  = btn.dataset['spellId']!
    const spell    = getSpell(spellId)
    const cd       = playerEntity.cooldowns?.[spellId] ?? 0
    const onCd     = cd > 0
    const noAp     = !allDisabled && !onCd && spell !== undefined && playerEntity.ap < spell.apCost
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
  // Bouton Abandonner (désactivé pendant le tour ennemi et en fin de combat)
  if (hudAbandonBtn) hudAbandonBtn.disabled = allDisabled


  // Hint contextuel

  // Numéro de tour
  if (hudTurnNumEl) hudTurnNumEl.textContent = String(gameState.turn).padStart(2, '0')

  // Carte acteur courant
  if (hudActiveActor) {
    const isEnemy = entity.team === 'enemy'
    hudActiveActor.className = `active-actor ${isEnemy ? 'is-enemy' : 'is-player'}`
    const hpPct = Math.round((entity.hp / entity.maxHp) * 100)
    const aaSprite = entity.team === 'player' ? 'player' : (entity.creatureType ?? 'sanglier')
    hudActiveActor.innerHTML = `
      <div class="aa-hex"><img class="aa-sprite" src="/sprites/${aaSprite}_se.png" alt=""></div>
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
    const aliveCount = gameState.entities.filter(e => e.hp > 0).length
    const turns = getUpcomingTurns(gameState, aliveCount).slice(1)
    hudTimelineEl.innerHTML = turns.map(e => {
      const cls = `turn-token ${e.team === 'player' ? 'is-player' : 'is-enemy'}`
      const spritePrefix = e.team === 'player' ? 'player' : (e.creatureType ?? 'sanglier')
      const hpPct = Math.round((e.hp / e.maxHp) * 100)
      return `<div class="${cls}">
        <img class="tt-sprite" src="/sprites/${spritePrefix}_se.png" alt="">
        <div class="tt-hpbar"><div class="tt-hpbar-fill" style="width:${hpPct}%"></div></div>
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

/**
 * Construit la liste des monstres de groupes en tant qu'entités visuelles statiques.
 * Utilisé en exploration pour les afficher sur la map sans les mettre dans le GameState.
 */
function getGroupMonsterEntities(): Entity[] {
  return currentMapDef.monsterGroups.flatMap(g =>
    g.monsters.map(m => ({
      id:           m.id,
      name:         m.name,
      team:         'enemy' as const,
      creatureType: m.creatureType,
      position:     m.position,
      hp:           m.hp,
      maxHp:        m.maxHp,
      ap:           m.ap,
      maxAp:        m.maxAp,
      mp:           m.mp,
      maxMp:        m.maxMp,
    })),
  )
}

/** Remplace la position des entités animées par leur position visuelle interpolée.
 *  En exploration, ajoute aussi les monstres des groupes (statiques, hors GameState). */
function getVisualEntities(): Entity[] {
  const now = performance.now()
  const stateEntities = gameState.entities.map(e => {
    const vp = getVisualPosition(e.id, now)
    return vp ? { ...e, position: vp } : e
  })
  if (gameMode === 'exploration') {
    return [...stateEntities, ...getGroupMonsterEntities()]
  }
  return stateEntities
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

  if (animsActive || effectsActive || hasSpriteAnimation()) {
    rafId = requestAnimationFrame(animationLoop)
  } else {
    rafId = null
  }
}

/** Affiche le mode de jeu courant en bas à gauche du canvas. */
function renderModeIndicator(): void {
  const logH = cssH / gridScale
  const label = gameMode === 'combat' ? 'MODE: combat' : 'MODE: exploration'
  const color = gameMode === 'combat' ? '#ff6666' : '#66ccff'
  ctx.font         = 'bold 13px monospace'
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle    = 'rgba(0,0,0,0.55)'
  ctx.fillRect(8, logH - 28, 175, 22)
  ctx.fillStyle = color
  ctx.fillText(label, 14, logH - 9)
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
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

  if (gameMode === 'exploration') {
    renderExitHighlights(ctx, exitCells, origin)
  }

  // [MODE COMBAT] Surlignages uniquement en mode combat et pendant le tour du joueur.
  if (gameMode === 'combat' && !aiTurnActive) {
    if (mode === 'move') {
      renderHighlights(ctx, reachable, origin, hoveredPos)  // [MODE COMBAT]
    } else {
      renderSpellRange(ctx, spellRange, origin, hoveredPos)  // [MODE COMBAT]
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
  renderCubesAndEntities(ctx, gameState.grid, visualEntities, origin, entityDirections, flashingEntities, gameMode === 'combat')
  if (gameMode === 'combat') {
    renderDamageNumbers(ctx, getActiveDamageNumbers(now), visualEntities, origin)  // [MODE COMBAT]
  }
  renderModeIndicator()
  renderOverlay()
  updateHudDOM()  // [MODE COMBAT]
}

function renderOverlay(): void {
  // Le résumé HTML (.combat-summary) gère l'affichage de fin de combat.
  // On estompe juste le canvas pour que le champ de bataille reste visible en arrière-plan.
  if (gameState.status === 'ongoing') return
  const logW = cssW / gridScale
  const logH = cssH / gridScale
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.fillRect(0, 0, logW, logH)
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
  if (gameState.status !== 'ongoing') { checkCombatEnd(); render(); return }
  mode = 'move'
  refreshReachable()
  refreshSpellRange()
  const next = currentEntity()
  const nextCls = next.team === 'enemy' ? 'target' : 'actor'
  pushLog(`<span class="${nextCls}">${next.name}</span> commence son tour.`, 'system')
  render()
  if (isCurrentEntityEnemy()) startAITurn()    // [MODE COMBAT]
  else startTurnTimer()                        // [MODE COMBAT]
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

/**
 * Construit et affiche le modal de résumé de fin de combat.
 * Remplit titre, statistiques et récompenses selon le résultat.
 */
function showCombatSummary(status: 'victory' | 'defeat'): void {
  if (!summaryEl || !summaryTitleEl || !summaryStatsEl || !summaryRewardsEl) return
  const isVictory = status === 'victory'
  const enemies   = gameState.entities.filter(e => e.team === 'enemy')
  const player    = gameState.entities.find(e => e.team === 'player')

  summaryTitleEl.textContent = isVictory ? '✦  Victoire  ✦' : '☠  Défaite  ☠'
  summaryTitleEl.className   = `summary-title ${isVictory ? 'is-victory' : 'is-defeat'}`

  const defeatedCount = enemies.filter(e => e.hp <= 0).length
  summaryStatsEl.innerHTML = `
    <div class="summary-stat-row">
      <span class="s-label">Tours</span>
      <span class="s-value">${gameState.turn}</span>
    </div>
    <div class="summary-stat-row">
      <span class="s-label">Ennemis vaincus</span>
      <span class="s-value">${defeatedCount} / ${enemies.length}</span>
    </div>
    <div class="summary-stat-row">
      <span class="s-label">PV restants</span>
      <span class="s-value">${player?.hp ?? 0} / ${player?.maxHp ?? 100}</span>
    </div>`

  if (isVictory) {
    // Valeurs temporaires : système de progression à implémenter plus tard.
    const xp   = enemies.reduce((sum, e) => sum + e.maxHp, 0)
    const gold = defeatedCount * 10
    summaryRewardsEl.innerHTML = `
      <div class="summary-rewards-title">Récompenses</div>
      <div class="summary-reward-row">
        <span class="summary-reward-label">Expérience</span>
        <span class="summary-reward-value xp">+${xp} XP</span>
      </div>
      <div class="summary-reward-row">
        <span class="summary-reward-label">Or</span>
        <span class="summary-reward-value gold">+${gold} or</span>
      </div>`
    summaryRewardsEl.style.display = ''
  } else {
    summaryRewardsEl.style.display = 'none'
  }

  summaryEl.classList.add('is-visible')
}

/**
 * À appeler après chaque mutation de gameState en mode combat.
 * Si le combat vient de se terminer, affiche le résumé.
 * Idempotent : combatEndScheduled empêche les doubles déclenchements.
 */
function checkCombatEnd(): void {
  if (gameMode !== 'combat') return
  if (gameState.status === 'ongoing') return
  if (combatEndScheduled) return
  combatEndScheduled = true
  stopTimer()
  showCombatSummary(gameState.status as 'victory' | 'defeat')
}

/**
 * Revient en exploration après une VICTOIRE.
 * Utilise le contexte mémorisé en brique 2 (returnMapDef / returnPlayerPosition)
 * pour revenir exactement sur la map et la position d'avant le combat.
 * Retire le groupe vaincu EN MÉMOIRE UNIQUEMENT — le JSON source n'est pas touché.
 */
function returnToExploration(): void {
  combatEndScheduled = false
  summaryEl?.classList.remove('is-visible')

  const mapDef    = returnMapDef    ?? currentMapDef
  const playerPos = returnPlayerPosition ?? mapDef.player.startPosition

  // Retire le groupe vaincu de la map d'exploration (session uniquement).
  const cleanMapDef = activeGroupId !== null
    ? { ...mapDef, monsterGroups: mapDef.monsterGroups.filter(g => g.id !== activeGroupId) }
    : mapDef

  activeGroupId        = null
  returnMapDef         = null
  returnPlayerPosition = null

  gameMode = 'exploration'
  combatAppEl?.classList.add('mode-exploration')
  loadMapForExploration(cleanMapDef, playerPos)
}

/**
 * Revient en exploration après une DÉFAITE.
 * Le groupe reste sur la map (pas vaincu). Le joueur réapparaît à sa position d'avant le combat.
 */
function returnToExplorationDefeated(): void {
  combatEndScheduled = false
  summaryEl?.classList.remove('is-visible')
  abandonModalEl?.classList.remove('is-visible')
  stopTimer()
  activeGroupId = null

  const mapDef    = returnMapDef    ?? currentMapDef
  const playerPos = returnPlayerPosition ?? mapDef.player.startPosition

  returnMapDef         = null
  returnPlayerPosition = null

  gameMode = 'exploration'
  combatAppEl?.classList.add('mode-exploration')
  loadMapForExploration(mapDef, playerPos)
}

/**
 * Affiche la bulle de confirmation au-dessus du monstre cliqué.
 * La position est calculée en coordonnées isométriques converties en pixels CSS.
 */
function showGroupPopup(group: MonsterGroup, monsterPos: Position): void {
  if (!groupPopupEl || !combatAppEl) return
  pendingGroup = group

  // Centre isométrique de la case en coordonnées logiques (avant gridScale)
  const screen = gridToScreen(monsterPos, origin)

  // Sommet haut du losange = centre - demi-hauteur → anchor visible au-dessus du sprite
  const anchorCssX = screen.screenX * gridScale
  const anchorCssY = (screen.screenY - TILE_HEIGHT / 2) * gridScale

  // Offset canvas → combat-app (le parent absolument positionné)
  const canvasRect = canvas.getBoundingClientRect()
  const appRect    = combatAppEl.getBoundingClientRect()

  groupPopupEl.style.left = `${canvasRect.left - appRect.left + anchorCssX}px`
  groupPopupEl.style.top  = `${canvasRect.top  - appRect.top  + anchorCssY}px`
  groupPopupEl.classList.add('is-visible')
}

function hideGroupPopup(): void {
  pendingGroup = null
  groupPopupEl?.classList.remove('is-visible')
}


/**
 * Engage un combat contre `group` : anime la course du joueur directement sur
 * la case du monstre le plus proche, puis lance le combat.
 * Le joueur réapparaîtra sur cette même case après le combat.
 */
function engageCombatGroup(group: MonsterGroup): void {
  const player = gameState.entities.find(e => e.team === 'player')
  if (!player) return

  hideGroupPopup()
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  pendingAfterAnimation = null
  resetAnimations()

  // Cible de la course : le monstre le plus proche du joueur
  const runTarget = [...group.monsters]
    .sort((a, b) =>
      (Math.abs(a.position.x - player.position.x) + Math.abs(a.position.y - player.position.y)) -
      (Math.abs(b.position.x - player.position.x) + Math.abs(b.position.y - player.position.y))
    )[0]?.position ?? null

  // Mémorise la case cible — le joueur y réapparaît après le combat
  preRunPlayerPos = runTarget ? { ...runTarget } : { ...player.position }

  const alreadyThere = !runTarget ||
    (runTarget.x === player.position.x && runTarget.y === player.position.y)

  if (!alreadyThere) {
    const path = buildPath(gameState.grid, player.position, runTarget!, new Set(), true)
    const isValidPath = path.length >= 2 && path.every((p, i) => {
      if (i === 0) return true
      const prev = path[i - 1]!
      return Math.max(Math.abs(p.x - prev.x), Math.abs(p.y - prev.y)) === 1
    })

    if (isValidPath) {
      gameState = {
        ...gameState,
        entities: gameState.entities.map(e =>
          e.id === player.id ? { ...e, position: runTarget! } : e
        ),
      }
      entityDirections.set(player.id, directionFromPath(path))
      startAnimation(player.id, path, performance.now())
      combatRunActive = true
      pendingAfterAnimation = () => launchCombat(group, player.id)
      startRenderLoop()
      return
    }
  }

  launchCombat(group, player.id)
}

/** Initialise réellement le GameState de combat et bascule le mode. */
function launchCombat(group: MonsterGroup, playerId: string): void {
  combatRunActive = false
  const player = gameState.entities.find(e => e.id === playerId)
  if (!player) return

  stopTimer()
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  pendingAfterAnimation = null

  // Mémorise le contexte d'exploration pour le retour après combat (brique 3).
  returnMapDef         = currentMapDef
  returnPlayerPosition = { ...player.position }

  gameState          = createCombatStateFromArena(combatArena, group, player)
  activeGroupId      = group.id
  combatEndScheduled = false

  gameMode      = 'combat'
  combatAppEl?.classList.remove('mode-exploration')
  mode          = 'move'
  activeSpellId = SPELL_COUP_EPEE
  hoveredPos    = null
  aiTurnActive  = false
  timeLeft      = TURN_DURATION

  entityDirections.clear()
  logEntries.length = 0
  if (hudLogEntriesEl) hudLogEntriesEl.innerHTML = ''
  if (hudLogCountEl)   hudLogCountEl.textContent = ''
  resetEffects()
  resetAnimations()
  resetAttackAnimations()

  initEntityDirections()
  refreshReachable()
  refreshSpellRange()

  handleResize()

  pushLog(`Combat déclenché (${group.monsters.length} ennemi${group.monsters.length > 1 ? 's' : ''}). À <span class="actor">${currentEntity().name}</span> de jouer !`, 'system')
  startTurnTimer()
}

/**
 * Déplacement libre en mode exploration : le joueur marche vers la case cliquée
 * sans limite de PM ni mécanique de tour. Réutilise le BFS et l'animation existants.
 * Un clic hors-grille depuis le bord correspondant déclenche une transition de map.
 */
function handleExplorationClick(pos: Position): void {
  const player = gameState.entities.find(e => e.team === 'player')
  if (!player) return

  // Clic hors-grille : tentative de transition vers une map voisine
  const cell = getCell(gameState.grid, pos)
  if (!cell) {
    tryMapTransition(pos, player)
    return
  }

  if (!cell.walkable) return
  if (pos.x === player.position.x && pos.y === player.position.y) return

  const blockedForAnim = new Set(
    gameState.entities
      .filter(e => e.id !== player.id && e.hp > 0)
      .map(e => `${e.position.x},${e.position.y}`),
  )
  // allowDiagonals=true : exploration uniquement — le combat reste en 4 directions.
  const path = buildPath(gameState.grid, player.position, pos, blockedForAnim, true)

  // Chebyshev distance ≤ 1 : accepte les 8 directions (orthogonales + diagonales).
  const isValidPath = path.every((p, i) => {
    if (i === 0) return true
    const prev = path[i - 1]!
    return Math.max(Math.abs(p.x - prev.x), Math.abs(p.y - prev.y)) === 1
  })
  if (!isValidPath) return

  // Téléporter la position dans l'état (pas de reducer, pas de coût en PM)
  gameState = {
    ...gameState,
    entities: gameState.entities.map(e =>
      e.id === player.id ? { ...e, position: pos } : e
    ),
  }
  entityDirections.set(player.id, directionFromPath(path))
  startAnimation(player.id, path, performance.now())
  startRenderLoop()
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
  if (aiTurnActive || combatRunActive) return  // bloquer pendant le tour ennemi ou la course vers les monstres

  const click = canvasPoint(e)

  // Mode exploration : tester d'abord le hit-test pixel sur les sprites des monstres
  if (gameMode === 'exploration') {
    for (const group of currentMapDef.monsterGroups) {
      for (const monster of group.monsters) {
        if (hitTestEntitySprite(monster, origin, click.screenX, click.screenY)) {
          showGroupPopup(group, monster.position)
          return
        }
      }
    }
    handleExplorationClick(screenToGrid(click, origin))
    return
  }

  const pos = screenToGrid(click, origin)

  // Mode combat : ignorer les clics hors grille
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
    gameState = applyAction(gameState, { type: 'MOVE', entityId, to: pos })  // [MODE COMBAT]
    if (gameState === prevState) return  // déplacement refusé par le core : on ne fait rien
    checkCombatEnd()
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
    gameState = applyAction(gameState, {  // [MODE COMBAT]
      type: 'USE_SPELL', entityId, spellId: activeSpellId, target: pos,
    })
    if (gameState !== prevState) {
      checkCombatEnd()
      mode = 'move'
      triggerHitEffects(prevState, gameState)
      logSpellUse(prevState, gameState, entityId, activeSpellId)
      triggerAttackAnimation(entityId)

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
// Modal d'abandon
// ---------------------------------------------------------------------------

function openAbandonModal(): void {
  abandonModalEl?.classList.add('is-visible')
}

function closeAbandonModal(): void {
  abandonModalEl?.classList.remove('is-visible')
}

hudAbandonBtn?.addEventListener('click', () => {
  if (gameMode !== 'combat' || gameState.status !== 'ongoing') return
  openAbandonModal()
})

abandonConfirmEl?.addEventListener('click', () => {
  closeAbandonModal()
  returnToExplorationDefeated()
})

abandonCancelEl?.addEventListener('click', () => closeAbandonModal())

// Ferme le modal sur clic extérieur
document.addEventListener('pointerdown', (e) => {
  if (!abandonModalEl?.classList.contains('is-visible')) return
  const panel = abandonModalEl.querySelector('.abandon-panel')
  if (panel && !panel.contains(e.target as Node)) closeAbandonModal()
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
    case 'F':
    case ' ':
      e.preventDefault()
      doEndTurn()
      break
    case 'ESCAPE':
      if (abandonModalEl?.classList.contains('is-visible')) { closeAbandonModal(); break }
      if (pendingGroup !== null) { hideGroupPopup(); break }
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
// Chargement dynamique de map
// ---------------------------------------------------------------------------

/**
 * Remplace le combat en cours par celui décrit dans `def`.
 * Réinitialise toute l'UI et le rendu proprement.
 * Exportée : sera appelée quand un groupe de monstres est engagé (brique suivante).
 */
export function loadMap(def: MapDefinition): void {
  // Arrêter ce qui est en cours
  stopTimer()
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  pendingAfterAnimation = null

  // Nouvel état de jeu
  currentMapDef = def
  gameState     = createGameStateFromMap(def)

  // Réinitialiser l'UI
  gameMode      = 'combat'
  combatAppEl?.classList.remove('mode-exploration')
  mode          = 'move'
  activeSpellId = SPELL_COUP_EPEE
  hoveredPos    = null
  aiTurnActive  = false
  timeLeft      = TURN_DURATION

  // Vider les données transitoires
  entityDirections.clear()
  logEntries.length = 0
  if (hudLogEntriesEl) hudLogEntriesEl.innerHTML = ''
  if (hudLogCountEl)   hudLogCountEl.textContent = ''
  resetEffects()
  resetAnimations()
  resetAttackAnimations()

  // Réinitialiser les orientations et les cases atteignables
  initEntityDirections()
  refreshReachable()
  refreshSpellRange()

  // Recalculer les dimensions de la grille + rendu initial
  handleResize()

  // Message d'intro + timer
  pushLog(`Combat commencé. À <span class="actor">${currentEntity().name}</span> de jouer !`, 'system')
  startTurnTimer()
}

// ---------------------------------------------------------------------------
// Transitions de map (mode exploration)
// ---------------------------------------------------------------------------

/**
 * Calcule la position d'entrée sur la map voisine selon le côté de sortie.
 * La coordonnée perpendiculaire (ex. Y pour une sortie est/ouest) est conservée
 * et simplement clampée aux limites de la nouvelle map.
 */
function computeEntryPosition(def: MapDefinition, exitDir: 'nord' | 'sud' | 'est' | 'ouest', player: Entity): Position {
  const w = def.width
  const h = def.height
  switch (exitDir) {
    case 'est':   return { x: 0,     y: Math.min(player.position.y, h - 1) }
    case 'ouest': return { x: w - 1, y: Math.min(player.position.y, h - 1) }
    case 'nord':  return { x: Math.min(player.position.x, w - 1), y: h - 1 }
    case 'sud':   return { x: Math.min(player.position.x, w - 1), y: 0     }
  }
}

/**
 * Charge la map voisine en restant en mode exploration.
 * Ne réinitialise que ce qui est nécessaire (état de jeu, animations, orientations).
 * Ne touche pas au journal, au mode, au HUD combat caché.
 */
function loadMapForExploration(def: MapDefinition, playerEntry: Position): void {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  pendingAfterAnimation = null

  currentMapDef = def
  gameState     = createGameStateFromMap(def)

  // Placer le joueur à l'entrée (écrase la startPosition de la map)
  gameState = {
    ...gameState,
    entities: gameState.entities.map(e =>
      e.team === 'player' ? { ...e, position: playerEntry } : e
    ),
  }

  mode          = 'move'
  activeSpellId = SPELL_COUP_EPEE
  hoveredPos    = null
  aiTurnActive  = false

  entityDirections.clear()
  resetEffects()
  resetAnimations()
  resetAttackAnimations()

  initEntityDirections()
  refreshReachable()
  refreshSpellRange()
  computeExitCells()

  handleResize()
}

/**
 * Tente une transition vers la map voisine dans la direction du clic hors-grille.
 * La transition ne s'active que si le joueur est déjà sur le bord correspondant.
 */
function tryMapTransition(clickedPos: Position, player: Entity): void {
  const gridW = gameState.grid[0].length
  const gridH = gameState.grid.length

  let exitDir: 'nord' | 'sud' | 'est' | 'ouest' | null = null
  if (clickedPos.x >= gridW && player.position.x === gridW - 1) exitDir = 'est'
  else if (clickedPos.x < 0  && player.position.x === 0)        exitDir = 'ouest'
  else if (clickedPos.y < 0  && player.position.y === 0)        exitDir = 'nord'
  else if (clickedPos.y >= gridH && player.position.y === gridH - 1) exitDir = 'sud'

  if (!exitDir) return

  const neighborId = currentMapDef.neighbors?.[exitDir]
  if (!neighborId) return

  const neighborDef = mapRegistry.get(neighborId)
  if (!neighborDef) return

  const entryPos = computeEntryPosition(neighborDef, exitDir, player)
  loadMapForExploration(neighborDef, entryPos)
}

// ---------------------------------------------------------------------------
// Bulle de confirmation de combat
// ---------------------------------------------------------------------------

gpopConfirmEl?.addEventListener('click', () => {
  if (pendingGroup) engageCombatGroup(pendingGroup)
})

gpopCancelEl?.addEventListener('click', () => hideGroupPopup())

// Ferme la popup sur clic extérieur (pointerdown avant le clic sur le canvas)
document.addEventListener('pointerdown', (e) => {
  if (!groupPopupEl?.classList.contains('is-visible')) return
  if (!groupPopupEl.contains(e.target as Node)) hideGroupPopup()
})

// ---------------------------------------------------------------------------
// Bouton de résumé de combat
// ---------------------------------------------------------------------------

summaryContinueEl?.addEventListener('click', () => {
  if (gameState.status === 'victory') returnToExploration()
  else returnToExplorationDefeated()
})

// ---------------------------------------------------------------------------
// Raccourcis clavier — sélection de map
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (e.key === '1') {
    const def = combat01Raw as unknown as MapDefinition
    loadMapForExploration(def, def.player.startPosition)
    return
  }
  if (e.key === '2') {
    const def = combat02Raw as unknown as MapDefinition
    loadMapForExploration(def, def.player.startPosition)
    return
  }
})

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

combatAppEl?.classList.add('mode-exploration')     // démarre en exploration
initEntityDirections()
refreshReachable()
refreshSpellRange()
computeExitCells()
handleResize()                                     // dimensionne le canvas et premier rendu
new ResizeObserver(handleResize).observe(canvas)   // recalcul à chaque resize de fenêtre
spritesReady.then(() => { render(); startRenderLoop() })  // relance + démarre la boucle d'animation sprite
