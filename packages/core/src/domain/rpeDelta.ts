export type RpeSeverity = 'ok' | 'heavy' | 'light' | 'unknown'

export type RpeComparison = {
  /** percibido - objetivo. Positivo = costó más de lo pedido. */
  delta: number | null
  severity: RpeSeverity
  label: string
}

/** ±1 punto es ruido de percepción; a partir de 2 el coach debería mirar la carga. */
const TOLERANCE = 1

/** Un decimal alcanza: "7.3" se lee, "7.333333" no. */
const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * El objetivo del día: el promedio de los target_rpe no nulos de sus ejercicios.
 *
 * Desde F3.5 el jugador da UN RPE percibido por día, no uno por ejercicio
 * (CLAUDE.md §1: doce preguntas por sesión garantizan que nadie las conteste),
 * así que hay que reducir los N objetivos del día a uno solo para poder
 * comparar.
 *
 * El promedio es la lectura natural de "el RPE del día contra los target_rpe del
 * día" (CLAUDE.md §6) y degrada bien cuando sólo algunos ejercicios tienen
 * target. Las alternativas descartadas —el máximo del día, que compara contra el
 * pico y pierde la señal; y el rango min–max, que no ordena una tabla de
 * plantel— están en el spec §3.
 */
export function dayTargetRpe(targets: readonly (number | null)[]): number | null {
  const known = targets.filter((t): t is number => t != null)
  if (known.length === 0) return null
  return round1(known.reduce((sum, t) => sum + t, 0) / known.length)
}

export function rpeDelta(targetRpe: number | null, perceivedRpe: number | null): RpeComparison {
  if (targetRpe == null) return { delta: null, severity: 'unknown', label: 'Sin objetivo' }
  if (perceivedRpe == null) return { delta: null, severity: 'unknown', label: 'Sin registrar' }

  // round1 antes de comparar: el objetivo viene promediado y 9 - 7.3 da
  // 1.7000000000000002 en punto flotante.
  const delta = round1(perceivedRpe - targetRpe)
  if (Math.abs(delta) <= TOLERANCE) return { delta, severity: 'ok', label: 'En el objetivo' }

  const magnitude = round1(Math.abs(delta))
  const direction = delta > 0 ? 'pesado' : 'liviano'
  return {
    delta,
    severity: delta > 0 ? 'heavy' : 'light',
    label: `${magnitude} puntos más ${direction} de lo pedido`,
  }
}

export type RpePair = { targetRpe: number | null; perceivedRpe: number | null }

export type RpeSummary = {
  comparable: number
  averageDelta: number | null
  ok: number
  heavy: number
  light: number
}

/**
 * Agrega DÍAS, no ejercicios: un par comparable por día cerrado.
 *
 * El plan viejo de F4 agregaba pares por ejercicio, de cuando el RPE percibido
 * se pedía una vez por ejercicio. F3.5 lo movió a una pregunta por día, así que
 * esta función cambió de unidad, no de forma.
 */
export function summarizeRpe(pairs: readonly RpePair[]): RpeSummary {
  const summary: RpeSummary = { comparable: 0, averageDelta: null, ok: 0, heavy: 0, light: 0 }
  let total = 0

  for (const pair of pairs) {
    const comparison = rpeDelta(pair.targetRpe, pair.perceivedRpe)
    if (comparison.delta === null) continue

    summary.comparable += 1
    total += comparison.delta
    if (comparison.severity === 'heavy') summary.heavy += 1
    else if (comparison.severity === 'light') summary.light += 1
    else summary.ok += 1
  }

  if (summary.comparable > 0) summary.averageDelta = round1(total / summary.comparable)

  return summary
}
