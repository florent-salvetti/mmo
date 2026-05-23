import type { Cell, Entity, GameState, Position } from '../shared/types'
import { getReachableCells, type ReachableCell } from '../core/movement'
import { getCell } from '../core/grid'
import { renderGrid, renderHighlights, renderEntities } from './render/gridRenderer'
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
    { id: 'enemy-1',  name: 'Mob A',  team: 'enemy',
      position: { x: 7, y: 2 }, hp: 40,  maxHp: 40,  ap: 4, maxAp: 4, mp: 2, maxMp: 2 },
    { id: 'enemy-2',  name: 'Mob B',  team: 'enemy',
      position: { x: 5, y: 7 }, hp: 40,  maxHp: 40,  ap: 4, maxAp: 4, mp: 2, maxMp: 2 },
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
// État de l'UI (survol souris, cases atteignables calculées)
// ---------------------------------------------------------------------------

let hoveredPos: Position | null = null
let reachable: ReachableCell[]  = []

function currentEntity(): Entity {
  return gameState.entities.find(e => e.id === gameState.currentEntityId)!
}

function refreshReachable(): void {
  const mover = currentEntity()
  reachable = getReachableCells(gameState.grid, mover, gameState.entities, mover.mp)
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function render(): void {
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const reachableCells = reachable.map(r => r.cell)

  renderGrid(ctx, gameState.grid, origin)
  renderHighlights(ctx, reachableCells, origin, hoveredPos)
  renderEntities(ctx, gameState.entities, origin)
  renderHUD(ctx, currentEntity())
}

function renderHUD(ctx: CanvasRenderingContext2D, entity: Entity): void {
  const pad  = 16
  const barW = 120
  const barH = 8

  ctx.font         = 'bold 13px monospace'
  ctx.textBaseline = 'top'

  // PM
  ctx.fillStyle = '#aaaaaa'
  ctx.fillText('PM', pad, pad)
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(pad + 30, pad, barW, barH)
  ctx.fillStyle = '#56cfe1'
  ctx.fillRect(pad + 30, pad, barW * (entity.mp / entity.maxMp), barH)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${entity.mp} / ${entity.maxMp}`, pad + 30 + barW + 8, pad - 1)

  // PA
  ctx.fillStyle = '#aaaaaa'
  ctx.fillText('PA', pad, pad + 20)
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(pad + 30, pad + 20, barW, barH)
  ctx.fillStyle = '#e9c46a'
  ctx.fillRect(pad + 30, pad + 20, barW * (entity.ap / entity.maxAp), barH)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${entity.ap} / ${entity.maxAp}`, pad + 30 + barW + 8, pad + 19)

  // Aide contextuelle
  ctx.fillStyle = entity.mp === 0 ? '#888888' : '#cccccc'
  ctx.font      = '11px monospace'
  ctx.fillText(
    entity.mp === 0 ? 'Plus de PM disponibles' : 'Clic sur case bleue pour se déplacer',
    pad,
    pad + 44,
  )
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
  // Re-render uniquement si la case survolée a changé.
  if (hoveredPos?.x === newPos.x && hoveredPos?.y === newPos.y) return
  hoveredPos = newPos
  render()
})

canvas.addEventListener('mouseleave', () => {
  hoveredPos = null
  render()
})

canvas.addEventListener('click', (e) => {
  const rect      = canvas.getBoundingClientRect()
  const clickedPos = screenToGrid(
    { screenX: e.clientX - rect.left, screenY: e.clientY - rect.top },
    origin,
  )

  // Valider que la case existe dans la grille.
  if (!getCell(gameState.grid, clickedPos)) return

  // Trouver la case dans les cases atteignables.
  const target = reachable.find(
    r => r.cell.position.x === clickedPos.x && r.cell.position.y === clickedPos.y,
  )
  if (!target) return

  // Appliquer le déplacement : nouveau GameState immutable.
  gameState = {
    ...gameState,
    entities: gameState.entities.map(e =>
      e.id === gameState.currentEntityId
        ? { ...e, position: target.cell.position, mp: e.mp - target.cost }
        : e,
    ),
  }

  refreshReachable()
  render()
})

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

refreshReachable()
render()
