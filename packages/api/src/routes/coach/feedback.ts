import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import {
  coachFeedbackFor,
  playerFeedbackFor,
  FEEDBACK_PLAYER_COLUMNS,
} from '../../access/coachFeedback'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from './_scope'

const RpeSummary = z.object({
  comparable: z.number(),
  averageDelta: z.number().nullable(),
  ok: z.number(),
  heavy: z.number(),
  light: z.number(),
})

const RpeComparison = z.object({
  delta: z.number().nullable(),
  severity: z.enum(['ok', 'heavy', 'light', 'unknown']),
  label: z.string(),
})

const PlayerFeedback = z
  .object({
    playerId: z.string().uuid(),
    playerName: z.string(),
    positionId: z.string().nullable(),
    programName: z.string().nullable(),
    weekName: z.string().nullable(),
    daysDone: z.number(),
    daysTotal: z.number(),
    rpe: RpeSummary,
    lastNote: z.object({ dayName: z.string(), note: z.string() }).nullable(),
  })
  .openapi('PlayerFeedback')

/**
 * Se registran como componentes con nombre (y no anónimos dentro del detalle)
 * para que hey-api les genere un tipo propio en el cliente, en vez de un objeto
 * inline anidado que el frontend no puede nombrar.
 */
const FeedbackExercise = z
  .object({
    blockExerciseId: z.string().uuid(),
    exerciseName: z.string(),
    sets: z.number().nullable(),
    reps: z.string().nullable(),
    targetRpe: z.number().nullable(),
    weight: z.number().nullable(),
    loggedReps: z.number().nullable(),
  })
  .openapi('FeedbackExercise')

const FeedbackDay = z
  .object({
    dayId: z.string().uuid(),
    dayName: z.string(),
    completedAt: z.string().nullable(),
    targetRpe: z.number().nullable(),
    perceivedRpe: z.number().nullable(),
    comparison: RpeComparison,
    note: z.string().nullable(),
    exercises: z.array(FeedbackExercise),
  })
  .openapi('FeedbackDay')

const PlayerFeedbackDetail = PlayerFeedback.extend({
  days: z.array(FeedbackDay),
}).openapi('PlayerFeedbackDetail')

const FeedbackListResponse = z
  .object({ ok: z.literal(true), players: z.array(PlayerFeedback) })
  .openapi('FeedbackListResponse')

const FeedbackDetailResponse = z
  .object({ ok: z.literal(true), player: PlayerFeedbackDetail })
  .openapi('FeedbackDetailResponse')

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

export const feedback = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- el plantel --------------------------------------------------------------

feedback.openapi(
  createRoute({
    method: 'get',
    path: '/coach/feedback',
    summary: 'Cómo viene el plantel esta semana',
    responses: {
      200: {
        description: 'El plantel con su progreso',
        content: { 'application/json': { schema: FeedbackListResponse } },
      },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const players = await coachFeedbackFor(c.get('db'), actor.id)
    return c.json({ ok: true as const, players }, 200)
  },
)

// --- el detalle de un jugador ------------------------------------------------

feedback.openapi(
  createRoute({
    method: 'get',
    path: '/coach/feedback/{playerId}',
    summary: 'El detalle de un jugador, día por día',
    request: {
      params: z.object({
        playerId: z.string().uuid().openapi({ param: { name: 'playerId', in: 'path' } }),
      }),
    },
    responses: {
      200: {
        description: 'El detalle',
        content: { 'application/json': { schema: FeedbackDetailResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId } = c.req.valid('param')
    const db = c.get('db')

    // El scoping va acá y no en el helper: un jugador de otro coach tiene que
    // dar 404 y no una lista vacía confusa (CLAUDE.md §4, capa 4 — no revelar
    // existencia). RLS ya lo bloquearía; esto le da el status correcto, y con el
    // MISMO body que un id inexistente.
    const { data, error } = await db
      .from('profiles')
      .select(FEEDBACK_PLAYER_COLUMNS)
      .eq('id', playerId)
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .maybeSingle()

    const player = assertRow(data, error)
    const detail = await playerFeedbackFor(db, player)

    return c.json({ ok: true as const, player: detail }, 200)
  },
)
