import type { Cell, Entity, Position } from '../../shared/types'
import { gridToScreen, TILE_WIDTH, TILE_HEIGHT, type ScreenPos } from './projection'

const COLOR_WALKABLE    = '#2d5a4e'
const COLOR_BLOCKED     = '#1e2030'
const COLOR_STROKE      = '#4a9e8a'
const COLOR_STROKE_DARK = '#2a3050'

/** Dessine toute la grille isométrique sur le canvas. */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: Cell[][],
  origin: ScreenPos,
): void {
  for (const row of grid) {
    for (const cell of row) {
      drawTile(ctx, cell, origin)
    }
  }
}

/** Dessine les surlignages bleus sur les cases atteignables. */
export function renderHighlights(
  ctx: CanvasRenderingContext2D,
  reachable: Cell[],
  origin: ScreenPos,
  hoveredPos: Position | null,
): void {
  for (const cell of reachable) {
    const { x, y } = cell.position
    const isHovered = hoveredPos !== null && hoveredPos.x === x && hoveredPos.y === y
    const { screenX, screenY } = gridToScreen(cell.position, origin)
    const halfW = TILE_WIDTH  / 2
    const halfH = TILE_HEIGHT / 2

    ctx.beginPath()
    ctx.moveTo(screenX,         screenY - halfH)
    ctx.lineTo(screenX + halfW, screenY)
    ctx.lineTo(screenX,         screenY + halfH)
    ctx.lineTo(screenX - halfW, screenY)
    ctx.closePath()

    ctx.fillStyle = isHovered ? 'rgba(80, 180, 255, 0.65)' : 'rgba(80, 180, 255, 0.28)'
    ctx.fill()

    if (isHovered) {
      ctx.strokeStyle = 'rgba(180, 230, 255, 0.9)'
      ctx.lineWidth   = 1.5
      ctx.stroke()
    }
  }
}

/** Dessine toutes les entités comme des cercles colorés au centre de leur case. */
export function renderEntities(
  ctx: CanvasRenderingContext2D,
  entities: Entity[],
  origin: ScreenPos,
): void {
  for (const entity of entities) {
    const { screenX, screenY } = gridToScreen(entity.position, origin)
    const radius = 10
    const fill   = entity.team === 'player' ? '#56cfe1' : '#ef233c'
    const stroke = entity.team === 'player' ? '#caf0f8' : '#ffd6d6'

    ctx.beginPath()
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2)
    ctx.fillStyle   = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth   = 2
    ctx.fill()
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------
// Privé
// ---------------------------------------------------------------------------

function drawTile(ctx: CanvasRenderingContext2D, cell: Cell, origin: ScreenPos): void {
  const { screenX, screenY } = gridToScreen(cell.position, origin)
  const halfW = TILE_WIDTH  / 2
  const halfH = TILE_HEIGHT / 2

  ctx.beginPath()
  ctx.moveTo(screenX,         screenY - halfH)
  ctx.lineTo(screenX + halfW, screenY)
  ctx.lineTo(screenX,         screenY + halfH)
  ctx.lineTo(screenX - halfW, screenY)
  ctx.closePath()

  ctx.fillStyle   = cell.walkable ? COLOR_WALKABLE : COLOR_BLOCKED
  ctx.strokeStyle = cell.walkable ? COLOR_STROKE   : COLOR_STROKE_DARK
  ctx.lineWidth   = 1
  ctx.fill()
  ctx.stroke()
}
