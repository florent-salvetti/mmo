import type { Cell, Entity, Position } from '../../shared/types'
import type { ActiveDamageNumber } from '../effects'
import { getVisualPosition } from '../animation'
import { gridToScreen, TILE_WIDTH, TILE_HEIGHT, type ScreenPos } from './projection'

// Couleurs de la grille — calquées sur les tokens CSS du design
const COLOR_CELL     = 'rgba(20, 30, 60, 0.55)'      // --cell-fill
const COLOR_CELL_ALT = 'rgba(28, 42, 78, 0.55)'      // --cell-fill-alt
const COLOR_GRID     = 'rgba(120, 180, 255, 0.18)'   // --grid-line

// Couleurs du cube isométrique
const CUBE_TOP    = '#4c5773'
const CUBE_LEFT   = '#2b3145'
const CUBE_RIGHT  = '#1c2030'
const CUBE_STROKE = 'rgba(160, 200, 255, 0.38)'

// Hauteur visible du cube en pixels (faces latérales)
const CUBE_H = TILE_HEIGHT * 0.525

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

// ─── Spritesheets Knight ──────────────────────────────────────────────────────

/** Coordonnées d'une frame dans une spritesheet. */
type FrameRect = { x: number; y: number; w: number; h: number }

/** Entrée du cache spritesheet : image chargée, frames découpées et durées associées. */
type SpritesheetEntry = { image: HTMLImageElement; frames: FrameRect[]; durations: number[] }

/** Cache spritesheet : chemin PNG → { image, frames[], durations[] }. */
const loadedSheets = new Map<string, SpritesheetEntry>()

/** Format minimal du JSON PixelOver dont on a besoin. */
type PixelOverJSON = {
  frames: Array<{ frame: { x: number; y: number; w: number; h: number }; duration: number }>
}

/**
 * Charge une spritesheet PNG + son JSON PixelOver associé et les met en cache.
 * Guard fetch/Image : retourne immédiatement en environnement test (Node).
 */
async function loadSpritesheet(pngSrc: string, jsonSrc: string): Promise<void> {
  if (typeof fetch === 'undefined') return
  if (typeof Image === 'undefined') return
  try {
    const json      = await fetch(jsonSrc).then(r => r.json()) as PixelOverJSON
    const frames    = json.frames.map(f => ({ ...f.frame }))
    const durations = json.frames.map(f => f.duration)
    await new Promise<void>(resolve => {
      const img = new Image()
      img.onload  = () => { loadedSheets.set(pngSrc, { image: img, frames, durations }); resolve() }
      img.onerror = () => resolve()
      img.src     = pngSrc
    })
  } catch {
    // réseau ou JSON invalide → fallback silencieux
  }
}

/**
 * Calcule l'index de la frame à afficher à l'instant `now` (ms) pour une animation en boucle.
 * Utilise les durées par frame du JSON PixelOver.
 */
function getCurrentFrame(durations: number[], now: number): number {
  if (durations.length === 0) return 0
  const total = durations.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let t = now % total
  for (let i = 0; i < durations.length; i++) {
    t -= durations[i]!
    if (t < 0) return i
  }
  return durations.length - 1
}

/**
 * Renvoie true si au moins une spritesheet animée est chargée.
 * Utilisé par la boucle RAF de main.ts pour maintenir le rendu en continu.
 */
export function hasSpriteAnimation(): boolean {
  return loadedSheets.size > 0
}

// Correspondance direction de jeu → numéro de direction du pack Knight.
// dir1 = SE, dir3 = SO, dir5 = NO, dir7 = NE (vérifié visuellement sur les sprites).
const KNIGHT_DIR: Record<PlayerDirection, number> = { SE: 7, SO: 1, NO: 3, NE: 5 }

function knightIdlePng(dir: PlayerDirection): string {
  return `/sprites/KnightBasic/Idle/Knight_Idle_dir${KNIGHT_DIR[dir]}.png`
}
function knightIdleJson(dir: PlayerDirection): string {
  return `/sprites/KnightBasic/Idle/Knight_Idle_dir${KNIGHT_DIR[dir]}.json`
}

function knightWalkPng(dir: PlayerDirection): string {
  return `/sprites/KnightBasic/Walk/Knight_Walk_dir${KNIGHT_DIR[dir]}.png`
}
function knightWalkJson(dir: PlayerDirection): string {
  return `/sprites/KnightBasic/Walk/Knight_Walk_dir${KNIGHT_DIR[dir]}.json`
}

/**
 * Taille d'affichage des frames Knight (frames carrées 256×256).
 * Le personnage occupe ~25–30 % de la frame → ajuster ici si trop grand/petit.
 */
const KNIGHT_DISPLAY_W = 160
/**
 * Position des pieds dans la frame source, exprimée en fraction de la hauteur totale.
 * Les frames Knight ont beaucoup de blanc sous les pieds (~40 %).
 * Ajuster entre 0.5 et 0.7 pour aligner les pieds avec le sol isométrique.
 */
const KNIGHT_FEET_RATIO = 0.50

// ─────────────────────────────────────────────────────────────────────────────

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
export const spritesReady: Promise<void> = Promise.all([
  ...KNOWN_CREATURE_PREFIXES.flatMap(prefix => [
    loadSprite(fallbackSpritePath(prefix)),
    ...DIRECTIONS.map(dir => loadSprite(spritePath(prefix, dir))),
  ]),
  ...DIRECTIONS.map(dir => loadSpritesheet(knightIdlePng(dir), knightIdleJson(dir))),
  ...DIRECTIONS.map(dir => loadSpritesheet(knightWalkPng(dir), knightWalkJson(dir))),
]).then(() => undefined)

/**
 * Retourne le sprite à afficher pour un préfixe et une direction.
 * Cascade : directionnel → prefix.png → null (→ cercle de fallback).
 */
function getSprite(prefix: string, dir: PlayerDirection): HTMLImageElement | null {
  return loadedSprites.get(spritePath(prefix, dir))
    ?? loadedSprites.get(fallbackSpritePath(prefix))
    ?? null
}

/**
 * Dessine toute la grille isométrique sur le canvas (dalles uniquement).
 * Les cubes sont dessinés séparément via renderCubesAndEntities pour respecter la profondeur.
 */
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

    ctx.fillStyle = isHovered ? 'rgba(77, 217, 255, 0.55)' : 'rgba(77, 217, 255, 0.22)'
    ctx.fill()

    ctx.strokeStyle = isHovered ? 'rgba(77, 217, 255, 0.95)' : 'rgba(77, 217, 255, 0.50)'
    ctx.lineWidth   = isHovered ? 1.5 : 1
    ctx.stroke()
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

    ctx.fillStyle = isHovered ? 'rgba(184, 108, 255, 0.55)' : 'rgba(184, 108, 255, 0.22)'
    ctx.fill()

    ctx.strokeStyle = isHovered ? 'rgba(184, 108, 255, 0.95)' : 'rgba(184, 108, 255, 0.50)'
    ctx.lineWidth   = isHovered ? 1.5 : 1
    ctx.stroke()
  }
}

/** Dessine une entité vivante (sprite ou cercle), sa barre de PV et son éventuel flash. */
function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  origin: ScreenPos,
  directions: Map<string, PlayerDirection>,
  flashingEntities: Map<string, number>,
): void {
  const { screenX, screenY } = gridToScreen(entity.position, origin)
  const dir = directions.get(entity.id) ?? 'SE'
  let hpBarY: number

  if (entity.team === 'player') {
    // ── Joueur : spritesheet Knight (frame 0 Idle) ──────────────────────────
    const now     = performance.now()
    const moving  = getVisualPosition(entity.id, now) !== null
    const sheet   = loadedSheets.get(moving ? knightWalkPng(dir) : knightIdlePng(dir))
    if (sheet && sheet.frames.length > 0) {
      const fi      = getCurrentFrame(sheet.durations, now)
      const frame   = sheet.frames[fi]!
      const dw      = KNIGHT_DISPLAY_W
      // Ancre les pieds (à KNIGHT_FEET_RATIO de la hauteur de frame) sur le point-sol (screenY)
      const spriteY = screenY - dw * KNIGHT_FEET_RATIO
      ctx.drawImage(sheet.image, frame.x, frame.y, frame.w, frame.h,
        screenX - dw / 2, spriteY, dw, dw)
      hpBarY = spriteY - 4
    } else {
      // Fallback : sprite statique Kirito ou cercle
      const sprite = getSprite('player', dir)
      if (sprite) {
        const spriteH = PLAYER_SPRITE_W * sprite.naturalHeight / sprite.naturalWidth
        const spriteY = screenY - spriteH + PLAYER_SPRITE_Y_OFFSET
        ctx.drawImage(sprite, screenX - PLAYER_SPRITE_W / 2, spriteY, PLAYER_SPRITE_W, spriteH)
        hpBarY = spriteY - 4
      } else {
        const cy = screenY + PLAYER_SPRITE_Y_OFFSET
        drawEntityCircle(ctx, screenX, cy, 'player')
        hpBarY = cy - 10 - 6
      }
    }
  } else {
    // ── Ennemis : sprites statiques existants (sanglier, etc.) ──────────────
    const prefix  = entity.creatureType ?? null
    const spriteW = ENEMY_SPRITE_W
    const yOffset = ENEMY_SPRITE_Y_OFFSET
    if (prefix !== null) {
      const sprite = getSprite(prefix, dir)
      if (sprite) {
        const spriteH = spriteW * sprite.naturalHeight / sprite.naturalWidth
        const spriteY = screenY - spriteH + yOffset
        ctx.drawImage(sprite, screenX - spriteW / 2, spriteY, spriteW, spriteH)
        hpBarY = spriteY - 4
      } else {
        const cy = screenY + yOffset
        drawEntityCircle(ctx, screenX, cy, 'enemy')
        hpBarY = cy - 10 - 6
      }
    } else {
      const cy = screenY + yOffset
      drawEntityCircle(ctx, screenX, cy, 'enemy')
      hpBarY = cy - 10 - 6
    }
  }

  const ratio  = entity.hp / entity.maxHp
  const barW   = 20
  const barH   = 3
  const barClr = ratio > 0.6 ? '#4caf50' : ratio > 0.3 ? '#ffc107' : '#f44336'
  ctx.fillStyle = '#222233'
  ctx.fillRect(screenX - barW / 2, hpBarY, barW, barH)
  ctx.fillStyle = barClr
  ctx.fillRect(screenX - barW / 2, hpBarY, barW * ratio, barH)

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
    drawEntity(ctx, entity, origin, directions, flashingEntities)
  }
}

/**
 * Dessine cubes et entités dans une passe unique triée par profondeur isométrique (x + y).
 * Garantit que les entités derrière un cube ne passent pas devant.
 */
export function renderCubesAndEntities(
  ctx: CanvasRenderingContext2D,
  grid: Cell[][],
  entities: Entity[],
  origin: ScreenPos,
  directions: Map<string, PlayerDirection> = new Map(),
  flashingEntities: Map<string, number> = new Map(),
): void {
  type Item =
    | { kind: 'cube';   pos: Position; depth: number }
    | { kind: 'entity'; entity: Entity; depth: number }

  const items: Item[] = []

  for (const row of grid) {
    for (const cell of row) {
      if (cell.obstacle === 'cube') {
        items.push({ kind: 'cube', pos: cell.position, depth: cell.position.x + cell.position.y })
      }
    }
  }

  for (const entity of entities) {
    if (entity.hp <= 0) continue
    items.push({ kind: 'entity', entity, depth: entity.position.x + entity.position.y })
  }

  items.sort((a, b) => a.depth - b.depth)

  for (const item of items) {
    if (item.kind === 'cube') {
      const { screenX, screenY } = gridToScreen(item.pos, origin)
      drawCube(ctx, screenX, screenY)
    } else {
      drawEntity(ctx, item.entity, origin, directions, flashingEntities)
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
  if (cell.obstacle === 'hole') { drawHole(ctx, screenX, screenY); return }
  const halfW = TILE_WIDTH  / 2
  const halfH = TILE_HEIGHT / 2
  const alt   = (cell.position.x + cell.position.y) % 2 === 1

  if (cell.obstacle === 'cube') {
    // Dalle sombre sous le cube
    ctx.beginPath()
    ctx.moveTo(screenX,         screenY - halfH)
    ctx.lineTo(screenX + halfW, screenY)
    ctx.lineTo(screenX,         screenY + halfH)
    ctx.lineTo(screenX - halfW, screenY)
    ctx.closePath()
    ctx.fillStyle   = '#0a0f1f'
    ctx.strokeStyle = CUBE_STROKE
    ctx.lineWidth   = 1
    ctx.fill()
    ctx.stroke()
    return
  }
  // Case normale (damier subtil)
  ctx.beginPath()
  ctx.moveTo(screenX,         screenY - halfH)
  ctx.lineTo(screenX + halfW, screenY)
  ctx.lineTo(screenX,         screenY + halfH)
  ctx.lineTo(screenX - halfW, screenY)
  ctx.closePath()
  ctx.fillStyle   = alt ? COLOR_CELL_ALT : COLOR_CELL
  ctx.strokeStyle = COLOR_GRID
  ctx.lineWidth   = 1
  ctx.fill()
  ctx.stroke()
}

/** Trou : case entièrement noire, sans bordure visible. */
function drawHole(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const halfW = TILE_WIDTH  / 2
  const halfH = TILE_HEIGHT / 2

  ctx.beginPath()
  ctx.moveTo(sx,         sy - halfH)
  ctx.lineTo(sx + halfW, sy)
  ctx.lineTo(sx,         sy + halfH)
  ctx.lineTo(sx - halfW, sy)
  ctx.closePath()
  ctx.fillStyle   = '#000000'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth   = 1
  ctx.fill()
  ctx.stroke()
}

/** Cube isométrique 3 faces avec rune décorative sur la face du dessus. */
function drawCube(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const halfW = TILE_WIDTH  / 2
  const halfH = TILE_HEIGHT / 2
  const ch    = CUBE_H  // hauteur visible des faces latérales

  // ── Face gauche ───────────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.moveTo(sx - halfW, sy - ch)
  ctx.lineTo(sx - halfW, sy)
  ctx.lineTo(sx,         sy + halfH)
  ctx.lineTo(sx,         sy + halfH - ch)
  ctx.closePath()
  ctx.fillStyle   = CUBE_LEFT
  ctx.strokeStyle = CUBE_STROKE
  ctx.lineWidth   = 1.2
  ctx.fill()
  ctx.stroke()

  // ── Face droite ───────────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.moveTo(sx + halfW, sy - ch)
  ctx.lineTo(sx + halfW, sy)
  ctx.lineTo(sx,         sy + halfH)
  ctx.lineTo(sx,         sy + halfH - ch)
  ctx.closePath()
  ctx.fillStyle   = CUBE_RIGHT
  ctx.strokeStyle = CUBE_STROKE
  ctx.fill()
  ctx.stroke()

  // ── Face du dessus ────────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.moveTo(sx,         sy - halfH - ch)
  ctx.lineTo(sx + halfW, sy - ch)
  ctx.lineTo(sx,         sy + halfH - ch)
  ctx.lineTo(sx - halfW, sy - ch)
  ctx.closePath()
  ctx.fillStyle   = CUBE_TOP
  ctx.strokeStyle = CUBE_STROKE
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

/**
 * Renvoie true si le point (clickX, clickY) en espace logique canvas tombe dans le
 * bounding box du sprite de l'entité. Utilisé pour le hit-test clic en exploration.
 * Fallback : cercle de rayon spriteW/4 si aucun sprite n'est chargé.
 */
export function hitTestEntitySprite(
  entity: { position: Position; team: 'player' | 'enemy'; creatureType?: string },
  origin: ScreenPos,
  clickX: number,
  clickY: number,
): boolean {
  const { screenX, screenY } = gridToScreen(entity.position, origin)
  const spriteW = entity.team === 'player' ? PLAYER_SPRITE_W   : ENEMY_SPRITE_W
  const yOffset = entity.team === 'player' ? PLAYER_SPRITE_Y_OFFSET : ENEMY_SPRITE_Y_OFFSET
  const prefix  = entity.team === 'player' ? 'player' : (entity.creatureType ?? null)

  if (prefix !== null) {
    let sprite: HTMLImageElement | null = null
    for (const dir of DIRECTIONS) {
      const s = getSprite(prefix, dir)
      if (s) { sprite = s; break }
    }
    if (sprite) {
      const spriteH = spriteW * sprite.naturalHeight / sprite.naturalWidth
      return (
        clickX >= screenX - spriteW / 2 &&
        clickX <= screenX + spriteW / 2 &&
        clickY >= screenY - spriteH + yOffset &&
        clickY <= screenY + yOffset
      )
    }
  }
  // Fallback cercle (sprite absent ou type inconnu)
  return Math.hypot(clickX - screenX, clickY - (screenY + yOffset)) <= spriteW / 4
}
