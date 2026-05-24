import type { Cell, Entity, Position } from '../../shared/types'
import type { ActiveDamageNumber } from '../effects'
import { gridToScreen, TILE_WIDTH, TILE_HEIGHT, type ScreenPos } from './projection'

const COLOR_WALKABLE    = '#2d5a4e'
const COLOR_BLOCKED     = '#1e2030'
const COLOR_STROKE      = '#4a9e8a'
const COLOR_STROKE_DARK = '#2a3050'

// ─── Réglages des sprites — modifie ces constantes pour caler les entités ──────────
/** Largeur du sprite joueur en pixels. */
const PLAYER_SPRITE_W = 80
/** Décalage vertical joueur en pixels — positif = descend, négatif = monte. */
const PLAYER_SPRITE_Y_OFFSET = 16

/** Largeur du sprite ennemi en pixels. */
const ENEMY_SPRITE_W = 68
/** Décalage vertical ennemi en pixels — positif = descend, négatif = monte. */
const ENEMY_SPRITE_Y_OFFSET = 18
// ───────────────────────────────────────────────────────────────────────────────────

/** Direction visuelle courante d'une entité, déduite de son dernier déplacement sur la grille. */
export type PlayerDirection = 'NE' | 'NO' | 'SE' | 'SO'

const DIRECTIONS: PlayerDirection[] = ['NE', 'NO', 'SE', 'SO']

// Préfixes de sprites connus — ajouter un type de créature ici pour le charger au démarrage.
const KNOWN_CREATURE_PREFIXES = ['player', 'sanglier']

// Sprites chargés avec succès : src → HTMLImageElement.
// Guard typeof Image : en environnement test Node, Image n'est pas défini
// → la Map reste vide → getSprite() retourne null → fallback cercle → les tests passent.
const loadedSprites = new Map<string, HTMLImageElement>()

function loadSprite(src: string): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve()
  return new Promise(resolve => {
    const img = new Image()
    img.onload  = () => { loadedSprites.set(src, img); resolve() }
    img.onerror = () => resolve()  // absent ou réseau → fallback en cascade, on démarre quand même
    img.src = src
  })
}

/** Chemin du sprite directionnel : /sprites/sanglier_ne.png, /sprites/player_so.png, etc. */
function spritePath(prefix: string, dir: PlayerDirection): string {
  return `/sprites/${prefix}_${dir.toLowerCase()}.png`
}

/** Chemin du sprite de fallback sans direction : /sprites/player.png, etc. */
function fallbackSpritePath(prefix: string): string {
  return `/sprites/${prefix}.png`
}

/**
 * Promesse résolue quand tous les sprites sont chargés (ou ont échoué).
 * Attendre cette promesse avant le premier render() évite le flash du cercle de fallback.
 */
export const spritesReady: Promise<void> = Promise.all(
  KNOWN_CREATURE_PREFIXES.flatMap(prefix => [
    loadSprite(fallbackSpritePath(prefix)),
    ...DIRECTIONS.map(dir => loadSprite(spritePath(prefix, dir))),
  ]),
).then(() => undefined)

/**
 * Retourne le sprite à afficher pour un préfixe et une direction.
 * Cascade : directionnel → prefix.png → null (→ cercle de fallback).
 */
function getSprite(prefix: string, dir: PlayerDirection): HTMLImageElement | null {
  return loadedSprites.get(spritePath(prefix, dir))
    ?? loadedSprites.get(fallbackSpritePath(prefix))
    ?? null
}

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

/**
 * Dessine toutes les entités vivantes avec leur barre de PV.
 * `directions` associe l'id de chaque entité à sa direction visuelle courante.
 * Les entités absentes de la map utilisent 'SE' par défaut.
 */
export function renderEntities(
  ctx: CanvasRenderingContext2D,
  entities: Entity[],
  origin: ScreenPos,
  directions: Map<string, PlayerDirection> = new Map(),
  flashingEntities: Map<string, number> = new Map(),
): void {
  for (const entity of entities) {
    if (entity.hp <= 0) continue

    const { screenX, screenY } = gridToScreen(entity.position, origin)
    const dir    = directions.get(entity.id) ?? 'SE'
    const prefix = entity.team === 'player' ? 'player' : (entity.creatureType ?? null)
    let hpBarY: number

    const spriteW  = entity.team === 'player' ? PLAYER_SPRITE_W   : ENEMY_SPRITE_W
    const yOffset  = entity.team === 'player' ? PLAYER_SPRITE_Y_OFFSET : ENEMY_SPRITE_Y_OFFSET

    if (prefix !== null) {
      const sprite = getSprite(prefix, dir)
      if (sprite) {
        const spriteH = spriteW * sprite.naturalHeight / sprite.naturalWidth
        const spriteY = screenY - spriteH + yOffset
        ctx.drawImage(sprite, screenX - spriteW / 2, spriteY, spriteW, spriteH)
        hpBarY = spriteY - 4
      } else {
        const cy = screenY + yOffset
        drawEntityCircle(ctx, screenX, cy, entity.team)
        hpBarY = cy - 10 - 6
      }
    } else {
      const cy = screenY + yOffset
      drawEntityCircle(ctx, screenX, cy, entity.team)
      hpBarY = cy - 10 - 6
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

    // Flash blanc sur la cible touchée — disque centré sur la case.
    const flashAlpha = flashingEntities.get(entity.id)
    if (flashAlpha !== undefined) {
      ctx.save()
      ctx.globalAlpha = flashAlpha
      ctx.fillStyle   = '#ffffff'
      ctx.beginPath()
      ctx.arc(screenX, screenY, 20, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
}

/**
 * Dessine les chiffres de dégâts flottants au-dessus des entités touchées.
 * Appelé après renderEntities pour que les chiffres passent par-dessus les sprites.
 */
export function renderDamageNumbers(
  ctx: CanvasRenderingContext2D,
  numbers: ActiveDamageNumber[],
  entities: Entity[],
  origin: ScreenPos,
): void {
  if (numbers.length === 0) return
  ctx.save()
  ctx.font         = 'bold 14px monospace'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth    = 3
  ctx.strokeStyle  = '#000000'
  for (const num of numbers) {
    const entity = entities.find(e => e.id === num.entityId)
    if (!entity) continue
    const { screenX, screenY } = gridToScreen(entity.position, origin)
    const y = screenY - 30 + num.dy
    ctx.globalAlpha = num.alpha
    ctx.strokeText(`-${num.value}`, screenX, y)
    ctx.fillStyle = '#ff4444'
    ctx.fillText(`-${num.value}`, screenX, y)
  }
  ctx.restore()
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

function drawEntityCircle(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  team: string,
): void {
  ctx.beginPath()
  ctx.arc(screenX, screenY, 10, 0, Math.PI * 2)
  ctx.fillStyle   = team === 'player' ? '#56cfe1' : '#ef233c'
  ctx.strokeStyle = team === 'player' ? '#caf0f8' : '#ffd6d6'
  ctx.lineWidth   = 2
  ctx.fill()
  ctx.stroke()
}
