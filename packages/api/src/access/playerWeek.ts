import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import {
  buildPlayerDay,
  type LoggedEntry,
  type PlannedBlock,
  type PlayerDay,
} from '@coachlab/core/domain/buildPlayerDay'
import type { LoadType } from '@coachlab/core/domain/calcLoad'
import type { PerfRecord } from '@coachlab/core/domain/lastPerf'
import type { OneRmRecord } from '@coachlab/core/domain/rmFor'
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import { activeProgramIdFor } from './assignments'
import { firstOf } from './embedded'

export type PlayerWeek = {
  programId: string
  programName: string
  weekId: string
  weekName: string
  days: PlayerDay[]
  completedDayIds: string[]
}

type Named = { name: string; normalized_name: string }

type ExerciseRow = {
  id: string
  load_type: LoadType
  weight: number | null
  percentage: number | null
  load_label: string | null
  sets: number | null
  reps: string | null
  target_rpe: number | null
  order_index: number | null
  exercises: Named | Named[] | null
}

type BlockRow = {
  id: string
  type: string
  rounds: number | null
  order_index: number | null
  block_exercises: ExerciseRow[] | null
}

type DayRow = {
  id: string
  name: string
  order_index: number | null
  blocks: BlockRow[] | null
}

type WeekNamed = { name: string }
type DayNamed = { name: string; weeks: WeekNamed | WeekNamed[] | null }

type LogRow = {
  id: string
  day_id: string
  note: string | null
  completed_at: string | null
  updated_at: string
  days: DayNamed | DayNamed[] | null
}

type Normalized = { normalized_name: string }

type EntryRow = {
  session_log_id: string
  block_exercise_id: string
  weight: number | null
  reps: number | null
  rpe: number | null
  block_exercises:
    | { exercises: Normalized | Normalized[] | null }
    | Array<{ exercises: Normalized | Normalized[] | null }>
    | null
}

/**
 * La semana vigente del jugador, lista para renderizar.
 *
 * Todas las queries van con el cliente creado a partir de la sesión del usuario
 * (CLAUDE.md §4): RLS es la que garantiza que no vea nada ajeno. NUNCA
 * service_role.
 */
export async function playerWeekFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null },
): Promise<PlayerWeek | null> {
  const programId = await activeProgramIdFor(db, player)
  if (!programId) return null

  // `weeks!weeks_program_id_fkey` NO es opcional: hay dos caminos FK entre
  // programs y weeks (weeks.program_id y programs.current_week_id) y PostgREST
  // devuelve 500 "more than one relationship was found" si no se desambigua.
  // Es el bug de IMPLEMENTATION-F2.md §4.3.
  const { data: program, error: programError } = await db
    .from('programs')
    .select('id, name, current_week_id, weeks!weeks_program_id_fkey(id, name, order_index)')
    .eq('id', programId)
    .maybeSingle()
  if (programError) throw new Error(programError.message)
  if (!program) return null

  const weeks = sortByOrderIndex(
    (program.weeks ?? []) as { id: string; name: string; order_index: number | null }[],
  )
  // La semana vigente es la del programa; si el coach no la fijó, la primera.
  const week = weeks.find((w) => w.id === program.current_week_id) ?? weeks[0]
  if (!week) return null

  const [tree, oneRms, history] = await Promise.all([
    loadTree(db, week.id),
    loadOneRms(db, player.id),
    loadHistory(db, player.id),
  ])

  const days = tree.map((day) =>
    buildPlayerDay({
      day: { id: day.id, name: day.name, blocks: day.blocks },
      weekName: week.name,
      oneRms,
      history: history.records,
      entries: history.entriesByDay.get(day.id) ?? [],
    }),
  )

  return {
    programId: program.id as string,
    programName: program.name as string,
    weekId: week.id,
    weekName: week.name,
    days,
    completedDayIds: history.completedDayIds,
  }
}

/** El árbol de la semana en un request. Ordenado por order_index explícito. */
async function loadTree(
  db: SupabaseClient<Database>,
  weekId: string,
): Promise<{ id: string; name: string; blocks: PlannedBlock[] }[]> {
  const { data, error } = await db
    .from('days')
    .select(
      `id, name, order_index,
       blocks (
         id, type, rounds, order_index,
         block_exercises (
           id, load_type, weight, percentage, load_label, sets, reps, target_rpe, order_index,
           exercises ( name, normalized_name )
         )
       )`,
    )
    .eq('week_id', weekId)
  if (error) throw new Error(error.message)

  // CLAUDE.md §3: el orden NUNCA sale del orden en que vuelven las filas.
  return sortByOrderIndex((data ?? []) as DayRow[]).map((day) => ({
    id: day.id,
    name: day.name,
    blocks: sortByOrderIndex(day.blocks ?? []).map((block) => ({
      id: block.id,
      type: block.type === 'CIRCUIT' ? ('CIRCUIT' as const) : ('SINGLE' as const),
      rounds: block.rounds,
      exercises: sortByOrderIndex(block.block_exercises ?? []).map((be) => ({
        id: be.id,
        exerciseName: firstOf(be.exercises)?.name ?? 'Ejercicio',
        sets: be.sets,
        reps: be.reps,
        loadType: be.load_type,
        weight: be.weight,
        percentage: be.percentage,
        loadLabel: be.load_label,
        targetRpe: be.target_rpe,
      })),
    })),
  }))
}

async function loadOneRms(db: SupabaseClient<Database>, playerId: string): Promise<OneRmRecord[]> {
  const { data, error } = await db
    .from('one_rms')
    .select('kg, exercises(normalized_name)')
    .eq('player_id', playerId)
  if (error) throw new Error(error.message)

  return (data ?? []).flatMap((row) => {
    const normalizedName = firstOf(row.exercises as Normalized | Normalized[] | null)
      ?.normalized_name
    return normalizedName ? [{ normalizedName, kg: row.kg as number }] : []
  })
}

/**
 * El historial completo del jugador, más lo que registró en cada día.
 *
 * DOS queries simples en vez de una anidada ingeniosa, a propósito: un string de
 * select no lo ve el typecheck y solo lo agarra un smoke con sesión real
 * (IMPLEMENTATION-F2.md §4.3). A 40–60 jugadores dos requests son gratis
 * (CLAUDE.md §2: no optimizar prematuramente).
 */
async function loadHistory(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<{
  records: PerfRecord[]
  entriesByDay: Map<string, LoggedEntry[]>
  completedDayIds: string[]
}> {
  const { data: logs, error: logsError } = await db
    .from('session_logs')
    .select('id, day_id, note, completed_at, updated_at, days!inner(name, weeks!inner(name))')
    .eq('player_id', playerId)
  if (logsError) throw new Error(logsError.message)

  const logRows = (logs ?? []) as LogRow[]
  if (logRows.length === 0) {
    return { records: [], entriesByDay: new Map(), completedDayIds: [] }
  }

  const { data: entries, error: entriesError } = await db
    .from('exercise_entries')
    .select(
      'session_log_id, block_exercise_id, weight, reps, rpe, block_exercises!inner(exercises!inner(normalized_name))',
    )
    .in(
      'session_log_id',
      logRows.map((log) => log.id),
    )
  if (entriesError) throw new Error(entriesError.message)

  const logById = new Map(logRows.map((log) => [log.id, log]))
  const records: PerfRecord[] = []
  const entriesByDay = new Map<string, LoggedEntry[]>()

  for (const row of (entries ?? []) as EntryRow[]) {
    const log = logById.get(row.session_log_id)
    if (!log) continue

    const entry: LoggedEntry = {
      blockExerciseId: row.block_exercise_id,
      weight: row.weight,
      reps: row.reps,
      rpe: row.rpe,
    }
    const forDay = entriesByDay.get(log.day_id)
    if (forDay) forDay.push(entry)
    else entriesByDay.set(log.day_id, [entry])

    const day = firstOf(log.days)
    const normalizedName = firstOf(firstOf(row.block_exercises)?.exercises)?.normalized_name
    if (!day || !normalizedName) continue

    records.push({
      normalizedName,
      dayId: log.day_id,
      weekName: firstOf(day.weeks)?.name ?? '',
      dayName: day.name,
      weight: row.weight,
      reps: row.reps,
      rpe: row.rpe,
      // Un día registrado y todavía no cerrado igual es "la última vez".
      performedAt: new Date(log.completed_at ?? log.updated_at),
    })
  }

  return {
    records,
    entriesByDay,
    completedDayIds: logRows.filter((log) => log.completed_at !== null).map((log) => log.day_id),
  }
}

/** La nota que el jugador dejó en un día, para prellenar el textarea. */
export async function dayNotesFor(
  db: SupabaseClient<Database>,
  playerId: string,
  dayIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (dayIds.length === 0) return new Map()

  const { data, error } = await db
    .from('session_logs')
    .select('day_id, note')
    .eq('player_id', playerId)
    .in('day_id', [...dayIds])
  if (error) throw new Error(error.message)

  return new Map((data ?? []).map((row) => [row.day_id as string, row.note as string | null]))
}
