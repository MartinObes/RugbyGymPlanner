import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import {
  dayTargetRpe,
  rpeDelta,
  summarizeRpe,
  type RpeComparison,
  type RpeSummary,
} from '@coachlab/core/domain/rpeDelta'
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import { weekProgress } from '@coachlab/core/domain/weekProgress'
import { activeProgramIdFor } from './assignments'

export type FeedbackExercise = {
  blockExerciseId: string
  exerciseName: string
  sets: number | null
  /** Lo planificado: es texto porque las planillas escriben "8-10" o "máx". */
  reps: string | null
  targetRpe: number | null
  weight: number | null
  loggedReps: number | null
}

export type FeedbackDay = {
  dayId: string
  dayName: string
  completedAt: string | null
  /** El promedio de los target_rpe del día. null si ninguno lo tiene. */
  targetRpe: number | null
  perceivedRpe: number | null
  comparison: RpeComparison
  note: string | null
  exercises: FeedbackExercise[]
}

export type PlayerFeedback = {
  playerId: string
  playerName: string
  positionId: string | null
  programName: string | null
  weekName: string | null
  daysDone: number
  daysTotal: number
  rpe: RpeSummary
  lastNote: { dayName: string; note: string } | null
}

export type PlayerFeedbackDetail = PlayerFeedback & { days: FeedbackDay[] }

export type FeedbackPlayerRow = {
  id: string
  name: string
  position_id: string | null
  selected_program_id: string | null
}

export const FEEDBACK_PLAYER_COLUMNS = 'id, name, position_id, selected_program_id'

/**
 * El plantel del coach con su progreso de la semana vigente.
 *
 * Todas las queries van con el cliente creado a partir de la sesión del coach
 * (CLAUDE.md §4): RLS es la que garantiza que no vea plantel ajeno. NUNCA
 * service_role.
 *
 * Resolver el programa por jugador en un loop es aceptable a 40–60 jugadores:
 * son queries por índice, no scans (CLAUDE.md §2, no optimizar prematuramente).
 * Si un plantel pasa de 100, lo primero es cachear el árbol de la semana por
 * programId dentro del request —los jugadores de un mismo grupo comparten
 * programa— ANTES de tocar cualquier otra cosa.
 */
export async function coachFeedbackFor(
  db: SupabaseClient<Database>,
  coachId: string,
): Promise<PlayerFeedback[]> {
  const { data, error } = await db
    .from('profiles')
    .select(FEEDBACK_PLAYER_COLUMNS)
    .eq('coach_id', coachId)
    .eq('role', 'PLAYER')
    .order('name')
  if (error) throw new Error(error.message)

  return Promise.all(
    (data ?? []).map(async (player) => {
      const detail = await feedbackForPlayer(db, player)
      // El listado no manda los días por la red: son N jugadores × M días × sus
      // ejercicios, y esta pantalla sólo muestra el resumen.
      const { days: _days, ...summary } = detail
      return summary
    }),
  )
}

/**
 * El detalle de un jugador, día por día.
 *
 * El scoping (404 si no es del coach) lo resuelve la ruta antes de llamar acá:
 * este helper recibe una fila que ya se leyó con el filtro de coach puesto.
 */
export async function playerFeedbackFor(
  db: SupabaseClient<Database>,
  player: FeedbackPlayerRow,
): Promise<PlayerFeedbackDetail> {
  return feedbackForPlayer(db, player)
}

async function feedbackForPlayer(
  db: SupabaseClient<Database>,
  player: FeedbackPlayerRow,
): Promise<PlayerFeedbackDetail> {
  const empty: PlayerFeedbackDetail = {
    playerId: player.id,
    playerName: player.name,
    positionId: player.position_id,
    programName: null,
    weekName: null,
    daysDone: 0,
    daysTotal: 0,
    rpe: summarizeRpe([]),
    lastNote: null,
    days: [],
  }

  // La elección del jugador cuenta (F4-B §2.4): el coach tiene que ver el
  // programa que el jugador está mirando de verdad, no el que le tocaría.
  const programId = await activeProgramIdFor(db, {
    id: player.id,
    positionId: player.position_id,
    selectedProgramId: player.selected_program_id,
  })
  // Un jugador sin programa aparece igual, con 0/0: no desaparece del listado ni
  // tira 500. El coach necesita ver justamente a ese.
  if (!programId) return empty

  // `weeks!weeks_program_id_fkey` NO es opcional: hay dos caminos FK entre
  // programs y weeks (weeks.program_id y programs.current_week_id) y PostgREST
  // devuelve 500 "more than one relationship was found" si no se desambigua.
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

  const { data: dayRows, error: daysError } = await db
    .from('days')
    .select(
      `id, name, order_index,
       blocks (
         order_index,
         block_exercises (
           id, sets, reps, target_rpe, order_index,
           exercises ( name )
         )
       )`,
    )
    .eq('week_id', week.id)
  if (daysError) throw new Error(daysError.message)

  // CLAUDE.md §3: el orden NUNCA sale del orden en que vuelven las filas.
  const days = sortByOrderIndex(dayRows ?? [])
  if (days.length === 0) {
    return { ...empty, programName: program.name, weekName: week.name }
  }

  const { data: logRows, error: logsError } = await db
    .from('session_logs')
    .select('id, day_id, note, perceived_rpe, completed_at')
    .eq('player_id', player.id)
    .in(
      'day_id',
      days.map((d) => d.id),
    )
  if (logsError) throw new Error(logsError.message)

  const logs = logRows ?? []
  const logByDay = new Map(logs.map((l) => [l.day_id, l]))

  const entries = logs.length > 0 ? await loadEntries(db, logs.map((l) => l.id)) : new Map()

  const feedbackDays: FeedbackDay[] = days.map((day) => {
    const log = logByDay.get(day.id) ?? null

    const exercises: FeedbackExercise[] = sortByOrderIndex(day.blocks ?? []).flatMap((block) =>
      sortByOrderIndex(block.block_exercises ?? []).map((be) => {
        const entry = log ? entries.get(`${log.id}:${be.id}`) : undefined
        return {
          blockExerciseId: be.id,
          exerciseName: be.exercises?.name ?? 'Ejercicio',
          sets: be.sets,
          reps: be.reps,
          targetRpe: be.target_rpe,
          weight: entry?.weight ?? null,
          loggedReps: entry?.reps ?? null,
        }
      }),
    )

    const targetRpe = dayTargetRpe(exercises.map((e) => e.targetRpe))
    const perceivedRpe = log?.perceived_rpe ?? null

    return {
      dayId: day.id,
      dayName: day.name,
      completedAt: log?.completed_at ?? null,
      targetRpe,
      perceivedRpe,
      comparison: rpeDelta(targetRpe, perceivedRpe),
      note: log?.note ?? null,
      exercises,
    }
  })

  const progress = weekProgress(
    logs.filter((l) => l.completed_at !== null).map((l) => l.day_id),
    days.length,
  )

  // Sólo los días CERRADOS entran al resumen: uno a medio registrar todavía no
  // afirma nada sobre cuánto costó.
  const closed = feedbackDays.filter((d) => d.completedAt !== null)

  const lastNoted = closed
    .filter((d) => d.note !== null && d.note.trim() !== '')
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
    .pop()

  return {
    playerId: player.id,
    playerName: player.name,
    positionId: player.position_id,
    programName: program.name,
    weekName: week.name,
    daysDone: progress.completed,
    daysTotal: progress.total,
    rpe: summarizeRpe(closed.map((d) => ({ targetRpe: d.targetRpe, perceivedRpe: d.perceivedRpe }))),
    lastNote: lastNoted?.note ? { dayName: lastNoted.dayName, note: lastNoted.note } : null,
    days: feedbackDays,
  }
}

/** Lo registrado, indexado por `sessionLogId:blockExerciseId`. */
async function loadEntries(
  db: SupabaseClient<Database>,
  sessionLogIds: string[],
): Promise<Map<string, { weight: number | null; reps: number | null }>> {
  const { data, error } = await db
    .from('exercise_entries')
    .select('session_log_id, block_exercise_id, weight, reps')
    .in('session_log_id', sessionLogIds)
  if (error) throw new Error(error.message)

  return new Map(
    (data ?? []).map((e) => [
      `${e.session_log_id}:${e.block_exercise_id}`,
      { weight: e.weight, reps: e.reps },
    ]),
  )
}
