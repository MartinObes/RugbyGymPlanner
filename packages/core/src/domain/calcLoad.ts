export type LoadType = 'WEIGHT' | 'PERCENTAGE' | 'NONE'

export type LoadSpec = {
  loadType: LoadType
  weight?: number | null
  percentage?: number | null
}

export type LoadContext = {
  exerciseName: string
  oneRmKg?: number | null
}

export type LoadResult =
  | { kind: 'weight'; kg: number; label: string }
  | { kind: 'percentage'; kg: number; percentage: number; label: string }
  | { kind: 'missing-1rm'; percentage: number; exerciseName: string; label: string }
  | { kind: 'none'; label: string }

/** Redondeo a 0.5 kg, igual que el prototipo. */
export function roundToHalf(kg: number): number {
  return Math.round(kg * 2) / 2
}

export function formatKg(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`
}

/**
 * Resuelve la carga que el jugador ve para un ejercicio del programa.
 * Pura: el 1RM ya viene resuelto en el contexto (ver rmFor).
 */
export function calcLoad(spec: LoadSpec, ctx: LoadContext): LoadResult {
  if (spec.loadType === 'WEIGHT' && spec.weight != null) {
    return { kind: 'weight', kg: spec.weight, label: formatKg(spec.weight) }
  }

  if (spec.loadType === 'PERCENTAGE' && spec.percentage != null) {
    if (ctx.oneRmKg == null) {
      return {
        kind: 'missing-1rm',
        percentage: spec.percentage,
        exerciseName: ctx.exerciseName,
        label: `${spec.percentage}% — falta tu 1RM de ${ctx.exerciseName}`,
      }
    }
    const kg = roundToHalf((spec.percentage / 100) * ctx.oneRmKg)
    return {
      kind: 'percentage',
      kg,
      percentage: spec.percentage,
      label: `${spec.percentage}% → ${formatKg(kg)}`,
    }
  }

  return { kind: 'none', label: 'Sin peso' }
}
