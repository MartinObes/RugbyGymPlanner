/**
 * Tendencia de los tests de fuerza del jugador.
 *
 * Qué se compara lo decidió el spec de F3.5 §2.2: **la última medición contra la
 * anterior**. No contra la mejor histórica (eso es récord personal, no tendencia)
 * ni contra hace N semanas (obliga a elegir N sin datos para hacerlo).
 *
 * El riesgo de esa elección —"un mal día se lee como retroceso"— lo desactiva una
 * regla de color y no un cambio de algoritmo: **"bajó" nunca es rojo**, va en
 * muted (docs/DESIGN-SYSTEM.md §3.2). Por eso `direction` describe el hecho y no
 * lo juzga: la vista decide cómo pintarlo.
 */

/** Una evaluación, ya aplanada por la capa de acceso. `testedOn` es `YYYY-MM-DD`. */
export type Evaluation = {
  kg: number
  testedOn: string
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'first' | 'none'

export type Trend = {
  latest: Evaluation | null
  previous: Evaluation | null
  /** Positivo si subió, negativo si bajó. Null cuando no hay con qué comparar. */
  deltaKg: number | null
  direction: TrendDirection
}

/**
 * Ordena de más vieja a más reciente.
 *
 * `testedOn` es `YYYY-MM-DD`, así que comparar los strings ordena por fecha sin
 * construir un Date. El desempate del mismo día es el ORDEN DE LLEGADA, que
 * espeja el `created_at` del trigger 0018: `sort` de JS es estable, así que la
 * última del array gana.
 */
function chronological(evaluations: readonly Evaluation[]): Evaluation[] {
  return [...evaluations].sort((a, b) => (a.testedOn < b.testedOn ? -1 : a.testedOn > b.testedOn ? 1 : 0))
}

/** Redondea a un decimal: la columna es numeric(5,1) y el float arrastra ruido. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function evaluationTrend(evaluations: readonly Evaluation[]): Trend {
  const sorted = chronological(evaluations)
  const latest = sorted[sorted.length - 1] ?? null
  const previous = sorted.length >= 2 ? (sorted[sorted.length - 2] ?? null) : null

  if (!latest) return { latest: null, previous: null, deltaKg: null, direction: 'none' }
  if (!previous) return { latest, previous: null, deltaKg: null, direction: 'first' }

  const deltaKg = round1(latest.kg - previous.kg)
  return {
    latest,
    previous,
    deltaKg,
    direction: deltaKg > 0 ? 'up' : deltaKg < 0 ? 'down' : 'flat',
  }
}

/**
 * El 1RM vigente que sale de un historial de evaluaciones.
 *
 * Es la regla del trigger `sync_one_rm_from_evaluation` (migración 0018) escrita
 * como función pura. El trigger es la garantía —lo aplica sin importar por qué
 * ruta entró la evaluación—; esto es la especificación testeable, y lo que permite
 * verificar en milisegundos que cargar un test viejo NO pisa el 1RM vigente.
 */
export function nextOneRmFrom(evaluations: readonly Evaluation[]): number | null {
  return evaluationTrend(evaluations).latest?.kg ?? null
}
