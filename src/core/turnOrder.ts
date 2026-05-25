import type { Entity, GameState } from '../shared/types'

/**
 * Retourne les `count` prochains passages à jouer, en partant de l'entité
 * courante, dans l'ordre du tableau des entités (les entités mortes sont sautées).
 *
 * Le premier élément est toujours l'entité courante (si elle est vivante).
 * La liste est cyclique : après le dernier combattant, on repart du premier.
 *
 * Point d'extension : quand un système d'initiative sera introduit, seule
 * cette fonction devra changer — tout ce qui l'utilise en bénéficiera
 * automatiquement (timeline, IA, prévisualisation…).
 *
 * @param state  Snapshot courant du jeu.
 * @param count  Nombre de passages à retourner (défaut : 8).
 * @returns      Tableau ordonné des entités vivantes, pouvant contenir des
 *               doublons si le cycle est plus court que `count`.
 */
export function getUpcomingTurns(state: GameState, count = 8): Entity[] {
  const alive = state.entities.filter(e => e.hp > 0)
  if (alive.length === 0 || count <= 0) return []

  // Index de l'entité courante parmi les vivants.
  // Fallback à 0 si elle est absente (cas théorique : entité morte en début de tour).
  const startIdx = Math.max(0, alive.findIndex(e => e.id === state.currentEntityId))

  const result: Entity[] = []
  for (let i = 0; i < count; i++) {
    result.push(alive[(startIdx + i) % alive.length]!)
  }
  return result
}
