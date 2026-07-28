import { normName } from './normName'

export type OneRmRecord = {
  normalizedName: string
  kg: number
}

/**
 * Busca el 1RM del jugador para un ejercicio.
 * Exacto primero; si no, inclusión en cualquier dirección, ganando la coincidencia más larga.
 * Portado de `rmFor` del prototipo coach.html.
 */
export function rmFor(oneRms: OneRmRecord[], exerciseName: string): number | null {
  const target = normName(exerciseName)
  if (!target) return null

  const exact = oneRms.find((r) => r.normalizedName === target)
  if (exact) return exact.kg

  let best: OneRmRecord | null = null
  for (const record of oneRms) {
    const matches = record.normalizedName.includes(target) || target.includes(record.normalizedName)
    if (!matches) continue
    if (best === null || record.normalizedName.length > best.normalizedName.length) {
      best = record
    }
  }

  return best?.kg ?? null
}
