// Point d'entrée du client : récupère le canvas et dessine un rectangle de test.

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

ctx.fillStyle = '#16213e'
ctx.fillRect(0, 0, canvas.width, canvas.height)

// Rectangle de test — preuve que la chaîne Vite → TypeScript → Canvas fonctionne.
ctx.fillStyle = '#e94560'
ctx.fillRect(300, 225, 200, 150)

ctx.fillStyle = '#ffffff'
ctx.font = '16px monospace'
ctx.textAlign = 'center'
ctx.fillText('Hello Canvas — Phase 1', canvas.width / 2, canvas.height / 2 + 100)
