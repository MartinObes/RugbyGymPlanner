import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import {
  evaluationTrend,
  type Evaluation,
  type TrendDirection,
} from '@coachlab/core/domain/evaluationTrend'
import { NotFoundError } from '@coachlab/core/access/rbac'

/** Una evaluación como la ve la pantalla. */
export type EvaluationRecord = {
  id: string
  exerciseId: string
  exerciseName: string
  kg: number
  testedOn: string
}

/** Un ejercicio con su tendencia, que es la tarjeta del dashboard. */
export type ExerciseTrend = {
  exerciseId: string
  exerciseName: string
  latestKg: number | null
  latestTestedOn: string | null
  previousKg: number | null
  deltaKg: number | null
  direction: TrendDirection
}

/**
 * Las evaluaciones de un jugador, más recientes primero.
 *
 * El scoping lo hace RLS: `evaluations_select` deja al jugador ver las suyas y al
 * coach las de su plantel. Este helper no agrega un `coach_id` a mano porque la
 * política ya lo cubre y duplicarlo acá daría dos fuentes de verdad.
 */
export async function evaluationsFor(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<EvaluationRecord[]> {
  const { data, error } = await db
    .from('evaluations')
    .select('id, exercise_id, kg, tested_on, exercises!inner(name)')
    .eq('player_id', playerId)
    .order('tested_on', { ascending: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises?.name ?? '—',
    kg: row.kg,
    testedOn: row.tested_on,
  }))
}

/**
 * Las evaluaciones agrupadas por ejercicio, con su tendencia resuelta.
 *
 * La decisión de qué se compara vive en `evaluationTrend` (función pura), no acá:
 * esta función solo agrupa. Ordena los ejercicios por su test más reciente, así
 * que el dashboard muestra primero lo que el jugador acaba de medir.
 */
export function trendsFrom(records: readonly EvaluationRecord[]): ExerciseTrend[] {
  const byExercise = new Map<string, { name: string; evaluations: Evaluation[] }>()

  for (const record of records) {
    const group = byExercise.get(record.exerciseId)
    const evaluation: Evaluation = { kg: record.kg, testedOn: record.testedOn }
    if (group) group.evaluations.push(evaluation)
    else byExercise.set(record.exerciseId, { name: record.exerciseName, evaluations: [evaluation] })
  }

  const trends: ExerciseTrend[] = []
  for (const [exerciseId, group] of byExercise) {
    const trend = evaluationTrend(group.evaluations)
    trends.push({
      exerciseId,
      exerciseName: group.name,
      latestKg: trend.latest?.kg ?? null,
      latestTestedOn: trend.latest?.testedOn ?? null,
      previousKg: trend.previous?.kg ?? null,
      deltaKg: trend.deltaKg,
      direction: trend.direction,
    })
  }

  trends.sort((a, b) => (b.latestTestedOn ?? '').localeCompare(a.latestTestedOn ?? ''))
  return trends
}

/**
 * Que el jugador sea del plantel del coach. Recurso ajeno → 404, nunca 403
 * (CLAUDE.md §4 capa 4: no revelar existencia).
 *
 * Mismo pre-chequeo que ya hacen las rutas del 1RM del coach: RLS alcanzaría sola
 * —`evaluations_write` incluye `is_my_player`—, pero sin esto un jugador ajeno
 * devolvería un error de RLS como 500 poco informativo en vez de un 404.
 */
export async function assertMyPlayer(
  db: SupabaseClient<Database>,
  coachId: string,
  playerId: string,
): Promise<void> {
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .eq('id', playerId)
    .eq('coach_id', coachId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NotFoundError()
}
