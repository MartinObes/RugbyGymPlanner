import { calcLoad, type LoadResult, type LoadType } from './calcLoad'
import { formatLastPerf, hasData, lastPerf, type PerfRecord } from './lastPerf'
import { normName } from './normName'
import { rmFor, type OneRmRecord } from './rmFor'

/**
 * Un ejercicio del programa, como lo planificó el coach.
 *
 * No lleva `note`: `block_exercises` no tiene esa columna. Tampoco hay nombre de
 * bloque: `blocks` es (id, day_id, type, rounds, order_index).
 */
export type PlannedExercise = {
  id: string
  exerciseName: string
  sets: number | null
  reps: string | null
  loadType: LoadType
  weight: number | null
  percentage: number | null
  loadLabel: string | null
  targetRpe: number | null
}

export type PlannedBlock = {
  id: string
  type: 'SINGLE' | 'CIRCUIT'
  rounds: number | null
  exercises: PlannedExercise[]
}

/**
 * Lo que el jugador ya registró. Sin flag `done`: no hay checkbox por ejercicio
 * (decisión del spec §3.1). "Registrado" se deriva con `hasData`.
 */
export type LoggedEntry = {
  blockExerciseId: string
  weight: number | null
  reps: number | null
  rpe: number | null
}

export type PlayerDayInput = {
  day: { id: string; name: string; blocks: PlannedBlock[] }
  weekName: string
  oneRms: OneRmRecord[]
  history: PerfRecord[]
  entries: LoggedEntry[]
}

export type PlayerExerciseRow = PlannedExercise & {
  load: LoadResult
  lastPerfLabel: string | null
  entry: LoggedEntry | null
}

export type PlayerBlock = Omit<PlannedBlock, 'exercises'> & { exercises: PlayerExerciseRow[] }

export type PlayerDay = {
  id: string
  name: string
  weekName: string
  blocks: PlayerBlock[]
  /** Nombres de ejercicio en % sin 1RM cargado. Alimenta el banner ámbar. */
  missingOneRms: string[]
  loggedCount: number
  totalCount: number
}

/**
 * Compone lo que el jugador ve para un día: carga calculada, última vez y lo ya
 * registrado. Pura — los datos los carga packages/api/src/access/playerWeek.ts.
 */
export function buildPlayerDay(input: PlayerDayInput): PlayerDay {
  const entriesById = new Map(input.entries.map((entry) => [entry.blockExerciseId, entry]))
  // Map y no Set para deduplicar por normName pero mostrar el nombre lindo.
  const missing = new Map<string, string>()
  let loggedCount = 0
  let totalCount = 0

  const blocks = input.day.blocks.map(
    (block): PlayerBlock => ({
      ...block,
      exercises: block.exercises.map((planned): PlayerExerciseRow => {
        totalCount += 1

        const load = calcLoad(planned, {
          exerciseName: planned.exerciseName,
          oneRmKg: rmFor(input.oneRms, planned.exerciseName),
        })
        if (load.kind === 'missing-1rm') {
          missing.set(normName(planned.exerciseName), planned.exerciseName)
        }

        const entry = entriesById.get(planned.id) ?? null
        if (entry && hasData(entry)) loggedCount += 1

        return {
          ...planned,
          load,
          lastPerfLabel: formatLastPerf(lastPerf(input.history, planned.exerciseName, input.day.id)),
          entry,
        }
      }),
    }),
  )

  return {
    id: input.day.id,
    name: input.day.name,
    weekName: input.weekName,
    blocks,
    missingOneRms: [...missing.values()],
    loggedCount,
    totalCount,
  }
}
