import { describe, it, expect } from 'vitest'
import { getAIAction } from './ai'
import type { Cell, Entity, GameState } from '../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(w: number, h: number, blocked: string[] = []): Cell[][] {
  const blockedSet = new Set(blocked)
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      position: { x, y },
      walkable: !blockedSet.has(`${x},${y}`),
    })),
  )
}

function makeEntity(
  id: string, x: number, y: number,
  team: 'player' | 'enemy' = 'player',
  ap = 6, mp = 3,
): Entity {
  return {
    id, name: id, team,
    position: { x, y },
    hp: 50, maxHp: 50,
    ap, maxAp: 6,
    mp, maxMp: 3,
  }
}

function makeState(entities: Entity[], grid?: Cell[][]): GameState {
  return {
    grid: grid ?? makeGrid(10, 10),
    entities,
    currentEntityId: entities[0]!.id,
    turn: 1,
    status: 'ongoing',
  }
}

// ---------------------------------------------------------------------------
// Attaque
// ---------------------------------------------------------------------------

describe('getAIAction — attaque', () => {
  it('attaque le joueur adjacent si assez de PA', () => {
    // ennemi en (2,2), joueur en (2,3) — dist=1, portée [1,1] → USE_SPELL
    const enemy  = makeEntity('e', 2, 2, 'enemy', 6, 3)
    const player = makeEntity('p', 2, 3, 'player')
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.spellId).toBe('coup-epee')
    expect(action.target).toEqual({ x: 2, y: 3 })
  })

  it('n\'attaque pas si les PA sont insuffisants pour tout sort (ap=1)', () => {
    // 1 PA disponible < 2 requis par la charge (le sort le moins cher)
    const enemy  = makeEntity('e', 2, 2, 'enemy', 1, 3)
    const player = makeEntity('p', 2, 3)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).not.toBe('USE_SPELL')
  })

  it('utilise la charge si le joueur est hors portée du coup d\'épée mais sur une ligne cardinale (dist=2)', () => {
    // dist=2 → hors portée du coup-epee [1,1], mais dans la portée de la charge [1,3]
    // la charge doit être utilisée à la place du coup d'épée
    const enemy  = makeEntity('e', 0, 0, 'enemy', 6, 0)
    const player = makeEntity('p', 2, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.spellId).toBe('charge')
    expect(action.target).toEqual({ x: 2, y: 0 })
  })

  it('attaque le joueur adjacent parmi plusieurs, pas le lointain', () => {
    // joueur1 adjacent (dist=1), joueur2 loin (dist=5)
    const enemy   = makeEntity('e', 3, 3, 'enemy', 6, 3)
    const close   = makeEntity('p1', 3, 4)
    const distant = makeEntity('p2', 8, 3)
    const action  = getAIAction(makeState([enemy, close, distant]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.target).toEqual({ x: 3, y: 4 })
  })
})

// ---------------------------------------------------------------------------
// Déplacement
// ---------------------------------------------------------------------------

describe('getAIAction — déplacement', () => {
  it('se déplace vers le joueur le plus proche quand hors portée', () => {
    // ennemi en (0,0), joueur en (5,0), mp=3
    const enemy  = makeEntity('e', 0, 0, 'enemy', 0, 3)  // ap=0 → ne peut pas attaquer
    const player = makeEntity('p', 5, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('MOVE')
    if (action.type !== 'MOVE') return
    // La case cible doit être plus proche du joueur qu'(0,0)
    const distBefore = Math.abs(0 - 5)  // 5
    const distAfter  = Math.abs(action.to.x - 5) + Math.abs(action.to.y - 0)
    expect(distAfter).toBeLessThan(distBefore)
  })

  it('se rapproche du joueur le plus proche parmi plusieurs', () => {
    // ennemi en (0,0), joueur1 en (0,8), joueur2 en (0,3) — le plus proche est joueur2
    const enemy   = makeEntity('e', 0, 0, 'enemy', 0, 2)
    const far     = makeEntity('p1', 0, 8)
    const near    = makeEntity('p2', 0, 3)
    const action  = getAIAction(makeState([enemy, far, near]), 'e')
    expect(action.type).toBe('MOVE')
    if (action.type !== 'MOVE') return
    // Doit avancer vers (0,3), donc y doit croître
    expect(action.to.y).toBeGreaterThan(0)
    expect(action.to.x).toBe(0)
  })

  it('ne se déplace pas si toutes les cases accessibles s\'éloignent du joueur', () => {
    // ennemi en (1,0), joueur en (0,0) — adjacent (dist=1)
    // Les cases accessibles seront à dist≥1 du joueur (joueur bloque (0,0))
    const enemy  = makeEntity('e', 1, 0, 'enemy', 0, 2)
    const player = makeEntity('p', 0, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    // Pas d'attaque (ap=0), pas de case plus proche → END_TURN
    expect(action.type).toBe('END_TURN')
  })

  it('ne se déplace pas si les PM sont épuisés', () => {
    const enemy  = makeEntity('e', 0, 0, 'enemy', 0, 0)  // ap=0, mp=0
    const player = makeEntity('p', 5, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('END_TURN')
  })
})

// ---------------------------------------------------------------------------
// Fin de tour
// ---------------------------------------------------------------------------

describe('getAIAction — fin de tour', () => {
  it('retourne END_TURN si aucun joueur vivant', () => {
    const enemy  = makeEntity('e', 0, 0, 'enemy')
    const action = getAIAction(makeState([enemy]), 'e')
    expect(action.type).toBe('END_TURN')
  })

  it('retourne END_TURN si l\'entité est introuvable', () => {
    const player = makeEntity('p', 0, 0)
    const action = getAIAction(makeState([player]), 'inconnu')
    expect(action.type).toBe('END_TURN')
  })

  it('END_TURN porte l\'entityId correct', () => {
    const enemy  = makeEntity('e', 0, 0, 'enemy', 0, 0)
    const player = makeEntity('p', 5, 0)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('END_TURN')
    if (action.type !== 'END_TURN') return
    expect(action.entityId).toBe('e')
  })
})

// ---------------------------------------------------------------------------
// Priorité : attaque avant déplacement
// ---------------------------------------------------------------------------

describe('getAIAction — priorité attaque > déplacement', () => {
  it('attaque plutôt que de se déplacer quand les deux sont possibles', () => {
    // ennemi adjacent au joueur, assez de PA ET de PM
    const enemy  = makeEntity('e', 2, 2, 'enemy', 6, 3)
    const player = makeEntity('p', 2, 3)
    const action = getAIAction(makeState([enemy, player]), 'e')
    // Doit attaquer, pas se déplacer
    expect(action.type).toBe('USE_SPELL')
  })
})

// ---------------------------------------------------------------------------
// Sélection de cible (pickTarget)
// ---------------------------------------------------------------------------

describe('getAIAction — sélection de cible', () => {
  // coup-epee : 12 dégâts, portée [1,1].

  it('priorise un joueur achevable même s\'il n\'est pas le plus faible ni le premier en portée', () => {
    // pC : hp=50, adjacent — non achevable (50 > 12), premier dans le tableau
    //      → l'ancien code (find) l'aurait ciblé en premier
    // pB : hp=12, adjacent — achevable (12 ≤ 12), second dans le tableau
    // pA : hp=5,  loin (hors portée) — le plus faible du jeu mais inaccessible
    // Attendu : pB ciblé (achevable), ni pC (premier trouvé) ni pA (le plus faible global)
    const enemy   = makeEntity('e', 5, 5, 'enemy', 6, 0)
    const playerC = { ...makeEntity('pC', 5, 4), hp: 50 }
    const playerB = { ...makeEntity('pB', 5, 6), hp: 12 }
    const playerA = { ...makeEntity('pA', 9, 9), hp: 5  }
    const action  = getAIAction(makeState([enemy, playerC, playerB, playerA]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.target).toEqual({ x: 5, y: 6 })  // pB achevable
  })

  it('à défaut d\'achèvement possible, vise le joueur avec le moins de PV parmi ceux à portée', () => {
    // pA : hp=40, premier dans le tableau (l'ancien code l'aurait ciblé)
    // pB : hp=25, moins de PV mais second dans le tableau
    // Aucun n'est achevable (40 > 12, 25 > 12) → priorité 2 : le moins bien portant
    const enemy   = makeEntity('e', 5, 5, 'enemy', 6, 0)
    const playerA = { ...makeEntity('pA', 5, 4), hp: 40 }
    const playerB = { ...makeEntity('pB', 5, 6), hp: 25 }
    const action  = getAIAction(makeState([enemy, playerA, playerB]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.target).toEqual({ x: 5, y: 6 })  // pB, moins de PV
  })

  it('cible unique à portée : elle est toujours visée quelle que soit sa santé', () => {
    // Un seul joueur accessible — doit être ciblé qu'il soit achevable ou non
    const enemy  = makeEntity('e', 5, 5, 'enemy', 6, 0)
    const player = { ...makeEntity('p', 5, 4), hp: 30 }
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.target).toEqual({ x: 5, y: 4 })
  })
})

// ---------------------------------------------------------------------------
// Entités mortes ignorées
// ---------------------------------------------------------------------------

describe('getAIAction — entités mortes ignorées', () => {

  it('n\'attaque pas un joueur mort (hp=0)', () => {
    // Joueur mort adjacent — ne doit pas être ciblé (END_TURN faute de cible vivante)
    const enemy      = makeEntity('e', 5, 5, 'enemy', 6, 0)
    const deadPlayer = { ...makeEntity('p', 5, 4), hp: 0 }
    const action     = getAIAction(makeState([enemy, deadPlayer]), 'e')
    expect(action.type).toBe('END_TURN')  // aucune cible vivante
  })

  it('cible le joueur vivant et ignore le joueur mort même s\'il est plus proche', () => {
    // Joueur mort adjacent (dist=1), joueur vivant plus loin (dist=2, hors portée sort)
    // → pas d'attaque possible, l'IA se déplace vers le vivant
    const enemy      = makeEntity('e', 5, 5, 'enemy', 0, 3)
    const deadPlayer = { ...makeEntity('pDead', 5, 4), hp: 0 }
    const livePlayer = makeEntity('pLive', 5, 7)
    const action     = getAIAction(makeState([enemy, deadPlayer, livePlayer]), 'e')
    // L'IA doit avancer vers pLive (seul vivant), pas rester sur place
    expect(action.type).toBe('MOVE')
    if (action.type !== 'MOVE') return
    expect(action.to.y).toBeGreaterThan(5)  // avance vers y=7
  })

  it('END_TURN si tous les joueurs sont morts', () => {
    const enemy  = makeEntity('e', 5, 5, 'enemy', 6, 3)
    const dead1  = { ...makeEntity('p1', 5, 4), hp: 0 }
    const dead2  = { ...makeEntity('p2', 5, 6), hp: 0 }
    const action = getAIAction(makeState([enemy, dead1, dead2]), 'e')
    expect(action.type).toBe('END_TURN')
  })

})

// ---------------------------------------------------------------------------
// Contournement des obstacles (bug Manhattan vs BFS réel)
// ---------------------------------------------------------------------------

describe('getAIAction — contournement des obstacles', () => {
  it('contourne un mur plutôt que de rester bloqué (régression bug Manhattan)', () => {
    // Grille 5×4, murs en (1,1) et (1,2) :
    //   . . . . .
    //   E X . . P
    //   . X . . .
    //   . . . . .
    //
    // Avec Manhattan : aucune case accessible (0,0),(0,2),(1,0),(0,3)
    //   n'est "plus proche" par Manhattan de P=(4,1) que E=(0,1)
    //   → ancien code faisait END_TURN (bug : ennemi bloqué)
    //
    // Avec BFS réel : (1,0) est à distance 4 du joueur < 6 (position actuelle)
    //   → l'ennemi doit avancer vers (1,0)
    const grid   = makeGrid(5, 4, ['1,1', '1,2'])
    const enemy  = makeEntity('e', 0, 1, 'enemy', 0, 2)  // ap=0, mp=2
    const player = makeEntity('p', 4, 1)
    const action = getAIAction(makeState([enemy, player], grid), 'e')
    expect(action.type).toBe('MOVE')
    if (action.type !== 'MOVE') return
    expect(action.to).toEqual({ x: 1, y: 0 })
  })

  it('contourne un allié bloquant plutôt que de rester immobile (régression entités ignorées)', () => {
    // Grille 5×3, ennemi A en (0,1), ennemi B en (1,1) bloque le chemin direct, joueur en (4,1) :
    //   . . . . .
    //   A B . . P
    //   . . . . .
    //
    // Sans fix : BFS ignorait B → distance A→P = 4 ; cases accessibles (0,0),(0,2),(1,0),(1,2)
    //   ont toutes dist ≥ 4 par BFS sans entités → END_TURN (bug)
    //
    // Avec fix : BFS bloque B → distance A→P = 6 (détour par (0,0) ou (0,2)) ;
    //   (1,0) dist = 4 < 6 → l'ennemi A doit avancer en contournant B
    const grid    = makeGrid(5, 3)
    const enemyA  = makeEntity('eA', 0, 1, 'enemy', 0, 2)  // ap=0, mp=2
    const enemyB  = makeEntity('eB', 1, 1, 'enemy', 0, 0)
    const player  = makeEntity('p', 4, 1)
    const action  = getAIAction(makeState([enemyA, enemyB, player], grid), 'eA')
    expect(action.type).toBe('MOVE')
  })
})

// ---------------------------------------------------------------------------
// Sort Charge — stratégie "engager"
// ---------------------------------------------------------------------------

describe('getAIAction — charge', () => {
  it('joueur adjacent (dist=1) → coup d\'épée en priorité, pas la charge', () => {
    // Les deux sorts couvrent dist=1, mais coup-epee est prioritaire (ordre 1 > 2).
    const enemy  = makeEntity('e', 5, 5, 'enemy', 6, 3)
    const player = makeEntity('p', 5, 6)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.spellId).toBe('coup-epee')
  })

  it('joueur chargeable à 3 cases sur une ligne cardinale → charge', () => {
    // dist=3, ligne cardinale (même colonne), chemin libre → charge valide et utile.
    // Coup-epee : dist=3 hors portée [1,1] → ignoré.
    const enemy  = makeEntity('e', 5, 5, 'enemy', 6, 3)
    const player = makeEntity('p', 5, 8)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.spellId).toBe('charge')
    expect(action.target).toEqual({ x: 5, y: 8 })
  })

  it('joueur en diagonale (non chargeable) → déplacement à pied', () => {
    // dist=4, dx=2 dy=2 → diagonal → charge refusée (exige une ligne cardinale pure).
    // Coup-epee : dist=4 hors portée. → MOVE.
    const enemy  = makeEntity('e', 5, 5, 'enemy', 6, 3)
    const player = makeEntity('p', 7, 7)
    const action = getAIAction(makeState([enemy, player]), 'e')
    expect(action.type).toBe('MOVE')
  })

  it('charge en cooldown → pas de charge, déplacement vers le joueur', () => {
    // Joueur à dist=3 sur ligne cardinale mais charge cooldown=1 → invalide.
    // Coup-epee : dist=3 hors portée. → MOVE.
    const entityWithCooldown: Entity = { ...makeEntity('e', 5, 5, 'enemy', 6, 3), cooldowns: { charge: 1 } }
    const player = makeEntity('p', 5, 8)
    const action = getAIAction(makeState([entityWithCooldown, player]), 'e')
    expect(action.type).toBe('MOVE')
  })

  it('mur entre l\'entité et le joueur → la charge est bloquée, pas d\'attaque', () => {
    // Mur en (5,6) empêche le déplacement : la charge n'atteint pas le joueur → pas de dégâts.
    // mp=0 pour garantir un END_TURN propre (pas de déplacement possible non plus).
    const grid   = makeGrid(10, 10, ['5,6'])
    const enemy  = { ...makeEntity('e', 5, 5, 'enemy', 6, 0), mp: 0 }
    const player = makeEntity('p', 5, 8)
    const action = getAIAction(makeState([enemy, player], grid), 'e')
    expect(action.type).toBe('END_TURN')
  })

  it('impactDamage pris en compte : priorise un joueur achevable par la charge', () => {
    // Deux joueurs chargeables sur la même ligne (x), dist=3.
    // pA : hp=40, non achevable (40 > 10 impactDamage).
    // pB : hp=10, achevable (10 ≤ 10 impactDamage) → doit être ciblé en priorité.
    const enemy   = makeEntity('e', 5, 5, 'enemy', 6, 3)
    const playerA = { ...makeEntity('pA', 8, 5), hp: 40 }  // à droite, dist=3
    const playerB = { ...makeEntity('pB', 2, 5), hp: 10 }  // à gauche, dist=3, achevable
    const action  = getAIAction(makeState([enemy, playerA, playerB]), 'e')
    expect(action.type).toBe('USE_SPELL')
    if (action.type !== 'USE_SPELL') return
    expect(action.spellId).toBe('charge')
    expect(action.target).toEqual({ x: 2, y: 5 })  // pB achevable → priorité
  })
})
