import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { AuthVariables } from '../middleware/auth'
import { ErrorResponse } from './schemas'

const AdminStatsResponse = z
  .object({
    ok: z.literal(true),
    stats: z.object({
      coaches: z.number(),
      players: z.number(),
      admins: z.number(),
      exercises: z.number(),
    }),
  })
  .openapi('AdminStatsResponse')

const statsRoute = createRoute({
  method: 'get',
  path: '/admin/stats',
  summary: 'Contadores globales (solo ADMIN, que por RLS ve todas las filas)',
  responses: {
    200: {
      description: 'Contadores',
      content: { 'application/json': { schema: AdminStatsResponse } },
    },
    401: {
      description: 'Sin sesión o rol equivocado',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
})

export const admin = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  statsRoute,
  async (c) => {
    const db = c.get('db')

    const countProfiles = async (role: string) => {
      const { count, error } = await db
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', role)
      if (error) throw new Error(error.message)
      return count ?? 0
    }

    const [coaches, playersCount, admins, exercisesResult] = await Promise.all([
      countProfiles('COACH'),
      countProfiles('PLAYER'),
      countProfiles('ADMIN'),
      db.from('exercises').select('*', { count: 'exact', head: true }),
    ])
    if (exercisesResult.error) throw new Error(exercisesResult.error.message)

    return c.json(
      {
        ok: true as const,
        stats: {
          coaches,
          players: playersCount,
          admins,
          exercises: exercisesResult.count ?? 0,
        },
      },
      200,
    )
  },
)
