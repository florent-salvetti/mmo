import type { Cell } from '../shared/types'
import { renderGrid } from './render/gridRenderer'
import { computeOrigin } from './render/projection'

const GRID_W = 10
const GRID_H = 10

// Grille de démonstration : walkable partout sauf quelques obstacles.
const BLOCKED = new Set(['3,3', '3,4', '4,3', '7,1', '1,7'])

const grid: Cell[][] = Array.from({ length: GRID_H }, (_, y) =>
  Array.from({ length: GRID_W }, (_, x) => ({
    position: { x, y },
    walkable: !BLOCKED.has(`${x},${y}`),
  }))
)

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx    = canvas.getContext('2d')!

ctx.fillStyle = '#0f0f1a'
ctx.fillRect(0, 0, canvas.width, canvas.height)

const origin = computeOrigin(GRID_W, GRID_H, canvas)
renderGrid(ctx, grid, origin)
