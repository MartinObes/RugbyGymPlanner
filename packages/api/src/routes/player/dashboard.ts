import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { playerDashboardFor } from '../../access/playerDashboard'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'

const ExerciseTrend = z
  .object({
    exerciseId: z.string(),
    exerciseName: z.string(),
    latestKg: z.number().nullable(),
    latestTestedOn: z.string().nullable(),
    previousKg: z.number().nullable(),
    deltaKg: z.number().nullable(),
    direction: z.enum(['up', 'down', 'flat', 'first', 'none']),
  })
  .openapi('ExerciseTrend')

const DashboardResponse = z
  .object({
    ok: z.literal(true),
    programName: z.string().nullable(),
    weekName: z.string().nullable(),
    progress: z.object({
      completed: z.number(),
      total: z.number(),
      ratio: z.number(),
    }),
    trends: z.array(ExerciseTrend),
  })
  .openapi('PlayerDashboardResponse')

export const playerDashboard = new OpenAPIHono<{ Variables: AuthVariables }>()

playerDashboard.openapi(
  createRoute({
    method: 'get',
    path: '/player/dashboard',
    summary: 'Mi progreso de la semana y la tendencia de mis tests',
    responses: {
      200: {
        description: 'El dashboard',
        content: { 'application/json': { schema: DashboardResponse } },
      },
      401: {
        description: 'Sin sesión o rol equivocado',
        content: { 'application/json': { schema: ErrorResponse } },
      },
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const dashboard = await playerDashboardFor(c.get('db'), actor)
    return c.json({ ok: true as const, ...dashboard }, 200)
  },
)
