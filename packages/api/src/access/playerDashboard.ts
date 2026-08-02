import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import { weekProgress, type WeekProgress } from '@coachlab/core/domain/weekProgress'
import { activeProgramIdFor } from './assignments'
import { evaluationsFor, trendsFrom, type ExerciseTrend } from './evaluations'

export type PlayerDashboard = {
  programName: string | null
  weekName: string | null
  progress: WeekProgress
  trends: ExerciseTrend[]
}

/**
 * Lo que el jugador ve al entrar: cuánto de la semana hizo y cómo viene en sus
 * tests.
 *
 * **No usa `playerWeekFor`** a propósito: esa función arma el árbol entero de la
 * semana con cargas calculadas e historial, y el dashboard solo necesita CONTAR
 * los días. Tres queries chicas en vez de la construcción completa.
 */
export async function playerDashboardFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null; selectedProgramId?: string | null },
): Promise<PlayerDashboard> {
  const trends = trendsFrom(await evaluationsFor(db, player.id))
  const empty: PlayerDashboard = {
    programName: null,
    weekName: null,
    progress: weekProgress([], 0),
    trends,
  }

  const programId = await activeProgramIdFor(db, player)
  if (!programId) return empty

  // `weeks!weeks_program_id_fkey` NO es opcional: hay dos caminos FK entre
  // programs y weeks (weeks.program_id y programs.current_week_id) y PostgREST
  // devuelve 500 "more than one relationship was found" si no se desambigua. Es
  // el bug de IMPLEMENTATION-F2.md §4.3, y solo lo agarra un request real.
  const { data: program, error: programError } = await db
    .from('programs')
    .select('id, name, current_week_id, weeks!weeks_program_id_fkey(id, name, order_index)')
    .eq('id', programId)
    .maybeSingle()
  if (programError) throw new Error(programError.message)
  if (!program) return empty

  const weeks = sortByOrderIndex(program.weeks ?? [])
  const week = weeks.find((w) => w.id === program.current_week_id) ?? weeks[0]
  if (!week) return { ...empty, programName: program.name }

  const { data: days, error: daysError } = await db.from('days').select('id').eq('week_id', week.id)
  if (daysError) throw new Error(daysError.message)
  const dayIds = (days ?? []).map((day) => day.id)

  if (dayIds.length === 0) {
    return { programName: program.name, weekName: week.name, progress: weekProgress([], 0), trends }
  }

  const { data: logs, error: logsError } = await db
    .from('session_logs')
    .select('day_id')
    .eq('player_id', player.id)
    .not('completed_at', 'is', null)
    .in('day_id', dayIds)
  if (logsError) throw new Error(logsError.message)

  return {
    programName: program.name,
    weekName: week.name,
    progress: weekProgress(
      (logs ?? []).map((log) => log.day_id),
      dayIds.length,
    ),
    trends,
  }
}
