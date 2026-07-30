import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { completeDaySchema, exerciseEntrySchema } from '@coachlab/core/validators/session'
import { assertOwnedDay, ensureSessionLog } from '../../access/playerDay'
import { dayClosingsFor, playerWeekFor } from '../../access/playerWeek'
import type { AuthVariables } from '../../middleware/auth'
import { assertRow } from '../coach/_scope'
import { ErrorResponse } from '../schemas'

const DayIdParam = z.object({
  dayId: z.string().uuid().openapi({ param: { name: 'dayId', in: 'path' } }),
})

const EntryParams = DayIdParam.extend({
  blockExerciseId: z.string().uuid().openapi({ param: { name: 'blockExerciseId', in: 'path' } }),
})

const LoadResult = z
  .object({
    kind: z.enum(['weight', 'percentage', 'missing-1rm', 'label', 'none']),
    label: z.string(),
    kg: z.number().optional(),
    percentage: z.number().optional(),
  })
  .openapi('LoadResult')

const PlayerExercise = z
  .object({
    id: z.string(),
    exerciseName: z.string(),
    sets: z.number().nullable(),
    reps: z.string().nullable(),
    targetRpe: z.number().nullable(),
    load: LoadResult,
    lastPerfLabel: z.string().nullable(),
    entry: z
      .object({
        blockExerciseId: z.string(),
        weight: z.number().nullable(),
        reps: z.number().nullable(),
        rpe: z.number().nullable(),
      })
      .nullable(),
  })
  .openapi('PlayerExercise')

const PlayerBlock = z
  .object({
    id: z.string(),
    type: z.enum(['SINGLE', 'CIRCUIT']),
    name: z.string().nullable(),
    rounds: z.number().nullable(),
    exercises: z.array(PlayerExercise),
  })
  .openapi('PlayerBlock')

const PlayerDay = z
  .object({
    id: z.string(),
    name: z.string(),
    weekName: z.string(),
    blocks: z.array(PlayerBlock),
    missingOneRms: z.array(z.string()),
    loggedCount: z.number(),
    totalCount: z.number(),
    note: z.string().nullable(),
    perceivedRpe: z.number().nullable(),
    completed: z.boolean(),
  })
  .openapi('PlayerDay')

const WeekResponse = z
  .object({
    ok: z.literal(true),
    /** null cuando el jugador todavía no tiene programa asignado. */
    week: z
      .object({
        programName: z.string(),
        weekName: z.string(),
        days: z.array(PlayerDay),
      })
      .nullable(),
  })
  .openapi('PlayerWeekResponse')

const OkResponse = z.object({ ok: z.literal(true) }).openapi('PlayerWeekOkResponse')

const errors = {
  401: {
    description: 'Sin sesión o rol equivocado',
    content: { 'application/json': { schema: ErrorResponse } },
  },
  404: {
    description: 'No existe o no es tuyo',
    content: { 'application/json': { schema: ErrorResponse } },
  },
}

const CLOSED_DAY = 'Este día ya está cerrado. Reabrilo si querés cambiar algo.'

export const playerWeek = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- ver la semana -----------------------------------------------------------

playerWeek.openapi(
  createRoute({
    method: 'get',
    path: '/player/week',
    summary: 'La semana vigente del jugador con las cargas ya calculadas',
    responses: {
      200: { description: 'La semana', content: { 'application/json': { schema: WeekResponse } } },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const db = c.get('db')

    const week = await playerWeekFor(db, { id: actor.id, positionId: actor.positionId })
    if (!week) return c.json({ ok: true as const, week: null }, 200)

    const closings = await dayClosingsFor(
      db,
      actor.id,
      week.days.map((day) => day.id),
    )
    const completed = new Set(week.completedDayIds)

    return c.json(
      {
        ok: true as const,
        week: {
          programName: week.programName,
          weekName: week.weekName,
          days: week.days.map((day) => ({
            ...day,
            note: closings.get(day.id)?.note ?? null,
            perceivedRpe: closings.get(day.id)?.perceivedRpe ?? null,
            completed: completed.has(day.id),
          })),
        },
      },
      200,
    )
  },
)

// --- registrar un ejercicio --------------------------------------------------

playerWeek.openapi(
  createRoute({
    method: 'put',
    path: '/player/days/{dayId}/entries/{blockExerciseId}',
    summary: 'Registrar peso, reps y RPE de un ejercicio',
    request: {
      params: EntryParams,
      body: { content: { 'application/json': { schema: exerciseEntrySchema } } },
    },
    responses: {
      200: { description: 'Guardado', content: { 'application/json': { schema: OkResponse } } },
      409: {
        description: 'El día está cerrado',
        content: { 'application/json': { schema: ErrorResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { dayId, blockExerciseId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    await assertOwnedDay(db, { id: actor.id, positionId: actor.positionId }, dayId, blockExerciseId)

    const log = await ensureSessionLog(db, actor.id, dayId)
    if (log.completed_at !== null) {
      return c.json({ ok: false as const, error: CLOSED_DAY }, 409)
    }

    const weight = input.weight ?? null
    const reps = input.reps ?? null
    const rpe = input.rpe ?? null

    // Los tres en null significa "no registré nada": se borra la fila en vez de
    // dejar una entry vacía, que sería indistinguible de un registro a medias y
    // rompería el contador de progreso.
    if (weight === null && reps === null && rpe === null) {
      const { error } = await db
        .from('exercise_entries')
        .delete()
        .eq('session_log_id', log.id)
        .eq('block_exercise_id', blockExerciseId)
      if (error) throw new Error(error.message)
      return c.json({ ok: true as const }, 200)
    }

    const { data, error } = await db
      .from('exercise_entries')
      .upsert(
        { session_log_id: log.id, block_exercise_id: blockExerciseId, weight, reps, rpe },
        { onConflict: 'session_log_id,block_exercise_id' },
      )
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

// --- cerrar y reabrir el día -------------------------------------------------

playerWeek.openapi(
  createRoute({
    method: 'post',
    path: '/player/days/{dayId}/complete',
    summary: 'Completar el día con una nota',
    request: {
      params: DayIdParam,
      body: { content: { 'application/json': { schema: completeDaySchema } } },
    },
    responses: {
      200: { description: 'Completado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { dayId } = c.req.valid('param')
    const { note, perceivedRpe } = c.req.valid('json')
    const db = c.get('db')

    await assertOwnedDay(db, { id: actor.id, positionId: actor.positionId }, dayId)
    const log = await ensureSessionLog(db, actor.id, dayId)

    const { data, error } = await db
      .from('session_logs')
      .update({
        note: note ?? null,
        perceived_rpe: perceivedRpe ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', log.id)
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

playerWeek.openapi(
  createRoute({
    method: 'post',
    path: '/player/days/{dayId}/reopen',
    summary: 'Reabrir un día cerrado',
    request: { params: DayIdParam },
    responses: {
      200: { description: 'Reabierto', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { dayId } = c.req.valid('param')
    const db = c.get('db')

    await assertOwnedDay(db, { id: actor.id, positionId: actor.positionId }, dayId)

    const { data, error } = await db
      .from('session_logs')
      .update({ completed_at: null })
      .eq('player_id', actor.id)
      .eq('day_id', dayId)
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)
