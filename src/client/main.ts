import type { Cell, Entity, GameState, Position } from '../shared/types'
import { getReachableCells } from '../core/movement'
import { getSpell, getSpellTargetCells } from '../core/spells'
import { getCell } from '../core/grid'
import { applyAction } from '../core/reducer'
import { renderGrid, renderHighlights, renderSpellRange, renderEntities } from './render/gridRenderer'
import { computeOrigin, screenToGrid } from './render/projection'

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
    { id: 'enemy-1', name: 'Mob A', team: 'enemy',
      position: { x: 2, y: 1 }, hp: 40, maxHp: 40, ap: 4, maxAp: 4, mp: 2, maxMp: 2 },
    { id: 'enemy-2', name: 'Mob B', team: 'enemy',
      position: { x: 5, y: 7 }, hp: 40, maxHp: 40, ap: 4, maxAp: 4, mp: 2, maxMp: 2 },
  ],
  currentEntityId: 'player-1',
  turn: 1,
}

// ---------------------------------------------------------------------------
// Canvas + origine isométrique
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx    = canvas.getContext('2d')!
const origin = computeOrigin(GRID_W, GRID_H, canvas)

// ---------------------------------------------------------------------------
// État de l'UI
// ---------------------------------------------------------------------------

type UIMode = 'move' | 'spell'

const PLAYER_SPELL_ID = 'coup-epee'

// Zone du bouton sort dans le canvas (coordonnées pixels).
const SPELL_BTN = { x: 16, y: 56, w: 152, h: 22 }

let mode:       UIMode          = 'move'
let hoveredPos: Position | null = null
let reachable:  Cell[]          = []
let spellRange: Cell[]          = []

function currentEntity(): Entity {
  return gameState.entities.find(e => e.id === gameState.currentEntityId)!
}

function refreshReachable(): void {
  const mover = currentEntity()
  reachable = getReachableCells(gameState.grid, mover, gameState.entities, mover.mp)
    .map(r => r.cell)
}

function refreshSpellRange(): void {
  const spell = getSpell(PLAYER_SPELL_ID)
  if (!spell) { spellRange = []; return }
  spellRange = getSpellTargetCells(gameState.grid, currentEntity(), spell)
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function render(): void {
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  renderGrid(ctx, gameState.grid, origin)

  if (mode === 'move') {
    renderHighlights(ctx, reachable, origin, hoveredPos)
  } else {
    renderSpellRange(ctx, spellRange, origin, hoveredPos)
  }

  renderEntities(ctx, gameState.entities, origin)
  renderHUD(ctx, currentEntity())
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

  // Bouton sort
  const isSpellMode = mode === 'spell'
  ctx.fillStyle   = isSpellMode ? '#5a2a14' : '#1e2e1e'
  ctx.fillRect(SPELL_BTN.x, SPELL_BTN.y, SPELL_BTN.w, SPELL_BTN.h)
  ctx.strokeStyle = isSpellMode ? '#ff7832' : '#56cfe1'
  ctx.lineWidth   = 1.5
  ctx.strokeRect(SPELL_BTN.x, SPELL_BTN.y, SPELL_BTN.w, SPELL_BTN.h)
  ctx.fillStyle = isSpellMode ? '#ff9a5c' : '#cccccc'
  ctx.font      = '11px monospace'
  ctx.fillText("Coup d'epee (3 PA)", SPELL_BTN.x + 6, SPELL_BTN.y + 6)

  // Texte d'aide contextuel
  const spell  = getSpell(PLAYER_SPELL_ID)
  const canCast = spell !== undefined && entity.ap >= spell.apCost
  const hint = mode === 'move'
    ? (entity.mp === 0 ? 'Plus de PM disponibles' : 'Clic case bleue = deplacer')
    : (canCast ? 'Clic case orange = lancer' : 'PA insuffisants')
  ctx.fillStyle = '#888888'
  ctx.font      = '10px monospace'
  ctx.fillText(hint, pad, SPELL_BTN.y + SPELL_BTN.h + 6)
}

// ---------------------------------------------------------------------------
// Événements souris
// ---------------------------------------------------------------------------

canvas.addEventListener('mousemove', (e) => {
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
  hoveredPos = null
  render()
})

canvas.addEventListener('click', (e) => {
  const rect   = canvas.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const clickY = e.clientY - rect.top

  // Clic sur le bouton sort : basculer entre les modes.
  if (
    clickX >= SPELL_BTN.x && clickX <= SPELL_BTN.x + SPELL_BTN.w &&
    clickY >= SPELL_BTN.y && clickY <= SPELL_BTN.y + SPELL_BTN.h
  ) {
    mode = mode === 'spell' ? 'move' : 'spell'
    render()
    return
  }

  const pos = screenToGrid({ screenX: clickX, screenY: clickY }, origin)
  if (!getCell(gameState.grid, pos)) return

  if (mode === 'move') {
    gameState = applyAction(gameState, { type: 'MOVE', entityId: gameState.currentEntityId, to: pos })
    refreshReachable()
    refreshSpellRange()
    render()
  } else {
    // Mode sort : envoyer USE_SPELL. Si l'état a changé, le sort a été appliqué.
    const prevState = gameState
    gameState = applyAction(gameState, {
      type: 'USE_SPELL', entityId: gameState.currentEntityId, spellId: PLAYER_SPELL_ID, target: pos,
    })
    if (gameState !== prevState) {
      refreshSpellRange()
      render()
    }
  }
})

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

refreshReachable()
refreshSpellRange()
render()
