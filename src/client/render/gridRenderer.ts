import type { Cell } from '../../shared/types'
import { gridToScreen, TILE_WIDTH, TILE_HEIGHT, type ScreenPos } from './projection'

const COLOR_WALKABLE     = '#2d5a4e'
const COLOR_BLOCKED      = '#1e2030'
const COLOR_STROKE       = '#4a9e8a'
const COLOR_STROKE_DARK  = '#2a3050'

/** Dessine toute la grille isométrique sur le canvas. */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: Cell[][],
  origin: ScreenPos,
): void {
  // Parcours ligne par ligne pour que les tuiles du fond soient dessinées avant celles du premier plan.
  for (const row of grid) {
    for (const cell of row) {
      drawTile(ctx, cell, origin)
    }
  }
}

/** Dessine un losange isométrique pour une case. */
function drawTile(ctx: CanvasRenderingContext2D, cell: Cell, origin: ScreenPos): void {
  const { screenX, screenY } = gridToScreen(cell.position, origin)
  const halfW = TILE_WIDTH  / 2
  const halfH = TILE_HEIGHT / 2

  // Les 4 sommets du losange autour du centre (screenX, screenY) :
  //       top
  //  left     right
  //       bottom
  ctx.beginPath()
  ctx.moveTo(screenX,         screenY - halfH)  // sommet haut
  ctx.lineTo(screenX + halfW, screenY)           // sommet droit
  ctx.lineTo(screenX,         screenY + halfH)   // sommet bas
  ctx.lineTo(screenX - halfW, screenY)           // sommet gauche
  ctx.closePath()

  ctx.fillStyle   = cell.walkable ? COLOR_WALKABLE : COLOR_BLOCKED
  ctx.strokeStyle = cell.walkable ? COLOR_STROKE   : COLOR_STROKE_DARK
  ctx.lineWidth   = 1

  ctx.fill()
  ctx.stroke()
}
