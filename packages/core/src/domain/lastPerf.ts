import { formatKg } from './calcLoad'
import { normName } from './normName'

/**
 * Un registro histórico del jugador, ya aplanado por la capa de acceso.
 *
 * `weekName` y `dayName` viajan acá porque la línea que se muestra los necesita
 * ("Semana 2 · Día 1: …"). No están desnormalizados en la tabla: los llena el
 * join, y así esta función se mantiene pura.
 */
export type PerfRecord = {
  normalizedName: string
  dayId: string
  weekName: string
  dayName: string
  weight: number | null
  reps: number | null
  rpe: number | null
  performedAt: Date
}

/**
 * Si una entry cuenta como registrada. Es la MISMA regla que usa el contador de
 * progreso del día (buildPlayerDay): una sola definición de "esto se registró".
 * Un 0 es un dato, no un vacío — por eso la comparación es contra null.
 */
export function hasData(entry: {
  weight: number | null
  reps: number | null
  rpe: number | null
}): boolean {
  return entry.weight != null || entry.reps != null || entry.rpe != null
}

/**
 * Última vez que el jugador hizo este ejercicio.
 * Portado de `lastPerf` del prototipo coach.html.
 *
 * El match es por `normalizedName` EXACTO, no por inclusión como `rmFor`: acá
 * los dos lados salen de la misma fila de `exercises`, así que no hay nada que
 * tolerar. `excludeDayId` saca el día que se está mostrando (es hoy, no historia).
 */
export function lastPerf(
  history: readonly PerfRecord[],
  exerciseName: string,
  excludeDayId?: string,
): PerfRecord | null {
  const target = normName(exerciseName)
  if (!target) return null

  let best: PerfRecord | null = null
  for (const record of history) {
    if (record.normalizedName !== target) continue
    if (excludeDayId !== undefined && record.dayId === excludeDayId) continue
    if (!hasData(record)) continue
    if (best === null || record.performedAt > best.performedAt) best = record
  }

  return best
}

/** "Semana 2 · Día 1: 105 kg · 5 reps · RPE 8" */
export function formatLastPerf(record: PerfRecord | null): string | null {
  if (!record) return null

  const parts: string[] = []
  if (record.weight != null) parts.push(formatKg(record.weight))
  if (record.reps != null) parts.push(`${record.reps} reps`)
  if (record.rpe != null) parts.push(`RPE ${record.rpe}`)

  return `${record.weekName} · ${record.dayName}: ${parts.join(' · ')}`
}
