import type { Cell, Entity, Position } from '../../shared/types'
import { gridToScreen, TILE_WIDTH, TILE_HEIGHT, type ScreenPos } from './projection'

const COLOR_WALKABLE    = '#2d5a4e'
const COLOR_BLOCKED     = '#1e2030'
const COLOR_STROKE      = '#4a9e8a'
const COLOR_STROKE_DARK = '#2a3050'

// ─── Réglages du sprite joueur — modifie ces deux lignes pour caler le perso ─
/** Largeur du sprite en pixels — change cette valeur pour agrandir ou rétrécir le perso. */
const PLAYER_SPRITE_W = 80
/** Décalage vertical en pixels — positif = descend le perso, négatif = le monte. */
const PLAYER_SPRITE_Y_OFFSET = 9
// ──────────────────────────────────────────────────────────────────────────────

// Chargement unique au démarrage du module.
// Guard typeof : en environnement test Node, Image n'existe pas → playerSpriteReady reste false
// → le code retombe systématiquement sur le cercle cyan, les tests passent sans modification.
const playerSprite: HTMLImageElement | null =
  typeof Image !== 'undefined' ? new Image() : null
let playerSpriteReady = false

/**
 * Promesse résolue quand tous les sprites sont chargés (ou en erreur → fallback).
 * Attendre cette promesse avant le premier render() évite le flash du cercle de fallback.
 */
export const spritesReady: Promise<void> = new Promise(resolve => {
  if (!playerSprite) { resolve(); return }
  playerSprite.onload  = () => { playerSpriteReady = true; resolve() }
  playerSprite.onerror = () => resolve()  // image absente → fallback cercle, on démarre quand même
  playerSprite.src     = '/sprites/player.png'
})

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

/** Dessine les surlignages orange sur les cases ciblables par un sort. */
export function renderSpellRange(
  ctx: CanvasRenderingContext2D,
  cells: Cell[],
  origin: ScreenPos,
  hoveredPos: Position | null,
): void {
  for (const cell of cells) {
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

    ctx.fillStyle = isHovered ? 'rgba(255, 120, 50, 0.65)' : 'rgba(255, 120, 50, 0.28)'
    ctx.fill()

    if (isHovered) {
      ctx.strokeStyle = 'rgba(255, 200, 150, 0.9)'
      ctx.lineWidth   = 1.5
      ctx.stroke()
    }
  }
}

/** Dessine toutes les entités vivantes avec leur barre de PV. */
export function renderEntities(
  ctx: CanvasRenderingContext2D,
  entities: Entity[],
  origin: ScreenPos,
): void {
  for (const entity of entities) {
    if (entity.hp <= 0) continue

    const { screenX, screenY } = gridToScreen(entity.position, origin)
    let hpBarY: number

    if (entity.team === 'player' && playerSpriteReady && playerSprite) {
      // Sprite joueur : bas-centre de l'image posé sur le centre de la case.
      const spriteH = PLAYER_SPRITE_W * playerSprite.naturalHeight / playerSprite.naturalWidth
      const spriteY = screenY - spriteH + PLAYER_SPRITE_Y_OFFSET
      ctx.drawImage(playerSprite, screenX - PLAYER_SPRITE_W / 2, spriteY, PLAYER_SPRITE_W, spriteH)
      hpBarY = spriteY - 4
    } else {
      // Cercle (ennemis, ou fallback joueur si sprite non encore chargé).
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
      hpBarY = screenY - radius - 6
    }

    // Barre de PV positionnée juste au-dessus du sprite ou du cercle.
    const ratio  = entity.hp / entity.maxHp
    const barW   = 20
    const barH   = 3
    const barClr = ratio > 0.6 ? '#4caf50' : ratio > 0.3 ? '#ffc107' : '#f44336'
    ctx.fillStyle = '#222233'
    ctx.fillRect(screenX - barW / 2, hpBarY, barW, barH)
    ctx.fillStyle = barClr
    ctx.fillRect(screenX - barW / 2, hpBarY, barW * ratio, barH)
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
