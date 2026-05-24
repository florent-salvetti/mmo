/** Durée totale du chiffre flottant (ms). */
const DAMAGE_DURATION = 700
/** Durée du flash blanc sur la cible touchée (ms). */
const FLASH_DURATION = 200
/** Montée totale du chiffre en pixels. */
const DAMAGE_RISE = 30

type DamageEffect = { entityId: string; value: number; startTime: number }
type FlashEffect  = { entityId: string; startTime: number }

const damages: DamageEffect[] = []
const flashes: FlashEffect[]  = []

/** Enregistre un chiffre de dégâts flottant pour une entité. */
export function startDamageNumber(entityId: string, value: number, startTime: number): void {
  damages.push({ entityId, value, startTime })
}

/** Enregistre un flash visuel sur une entité touchée. */
export function startFlash(entityId: string, startTime: number): void {
  flashes.push({ entityId, startTime })
}

/**
 * Supprime les effets expirés.
 * Retourne true si au moins un effet est encore actif.
 */
export function tickEffects(now: number): boolean {
  for (let i = damages.length - 1; i >= 0; i--) {
    if (now - damages[i]!.startTime >= DAMAGE_DURATION) damages.splice(i, 1)
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    if (now - flashes[i]!.startTime >= FLASH_DURATION) flashes.splice(i, 1)
  }
  return damages.length > 0 || flashes.length > 0
}

export type ActiveDamageNumber = {
  entityId: string
  value: number
  /** Opacité : 1 (apparition) → 0 (disparition). */
  alpha: number
  /** Décalage vertical courant en pixels (0 → -DAMAGE_RISE). */
  dy: number
}

/** Retourne les chiffres actifs avec leur état interpolé au timestamp `now`. */
export function getActiveDamageNumbers(now: number): ActiveDamageNumber[] {
  return damages.map(d => {
    const t = Math.min((now - d.startTime) / DAMAGE_DURATION, 1)
    return { entityId: d.entityId, value: d.value, alpha: 1 - t, dy: -t * DAMAGE_RISE }
  })
}

/**
 * Retourne la Map entityId → alpha pour les entités en cours de flash.
 * Si une entité a plusieurs flashes actifs simultanés, le plus fort alpha est retenu.
 */
export function getFlashingEntities(now: number): Map<string, number> {
  const result = new Map<string, number>()
  for (const f of flashes) {
    const t = (now - f.startTime) / FLASH_DURATION
    if (t >= 1) continue
    const alpha    = (1 - t) * 0.65
    const existing = result.get(f.entityId) ?? 0
    if (alpha > existing) result.set(f.entityId, alpha)
  }
  return result
}
