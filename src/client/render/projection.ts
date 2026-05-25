import type { Position } from '../../shared/types'

// Dimensions d'une tuile isométrique en pixels.
export const TILE_WIDTH  = 64  // largeur totale du losange (horizontale)
export const TILE_HEIGHT = 32  // hauteur totale du losange (verticale)

/** Coordonnées pixel à l'écran. */
export type ScreenPos = { screenX: number; screenY: number }

/**
 * Convertit une position de grille (x, y) en coordonnées pixel.
 *
 * Formule isométrique (projection axonométrique 2D) :
 *   screenX = originX + (x - y) * TILE_HALF_W
 *   screenY = originY + (x + y) * TILE_HALF_H
 *
 * Le point retourné est le CENTRE du losange.
 * @param origin  Point écran qui correspond à la case (0, 0) de la grille.
 */
export function gridToScreen(pos: Position, origin: ScreenPos): ScreenPos {
  const halfW = TILE_WIDTH  / 2
  const halfH = TILE_HEIGHT / 2
  return {
    screenX: origin.screenX + (pos.x - pos.y) * halfW,
    screenY: origin.screenY + (pos.x + pos.y) * halfH,
  }
}

/**
 * Convertit des coordonnées pixel en position de grille.
 * C'est l'inverse exact de gridToScreen — résolution du système :
 *   dx = (screenX - originX) / halfW  →  dx = x - y
 *   dy = (screenY - originY) / halfH  →  dy = x + y
 *   ⟹  x = (dx + dy) / 2,  y = (dy - dx) / 2
 * Math.round arrondit au losange le plus proche du pointeur.
 */
export function screenToGrid(screen: ScreenPos, origin: ScreenPos): Position {
  const halfW = TILE_WIDTH  / 2
  const halfH = TILE_HEIGHT / 2
  const dx = (screen.screenX - origin.screenX) / halfW
  const dy = (screen.screenY - origin.screenY) / halfH
  return {
    x: Math.round((dx + dy) / 2),
    y: Math.round((dy - dx) / 2),
  }
}

/**
 * Calcule l'origine (case 0,0 → pixel) pour centrer une grille dans un espace de rendu.
 * L'origine est le sommet du losange (0,0), pas le centre de la grille.
 * Prend les dimensions CSS (pas les dimensions internes DPR-scalées).
 */
export function computeOrigin(gridW: number, gridH: number, width: number, height: number): ScreenPos {
  const halfH = TILE_HEIGHT / 2
  return {
    screenX: width / 2,
    // Centre vertical : la grille mesure (W+H-2)*halfH du centre (0,0) au centre (W-1,H-1).
    screenY: (height - (gridW + gridH - 2) * halfH) / 2,
  }
}
