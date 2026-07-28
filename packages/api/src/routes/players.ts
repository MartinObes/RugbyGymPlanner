import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { AuthVariables } from '../middleware/auth'
import { ErrorResponse } from './schemas'

const CoachPlayer = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    positionId: z.string().nullable(),
  })
  .openapi('CoachPlayer')

const CoachPlayersResponse = z
  .object({ ok: z.literal(true), players: z.array(CoachPlayer) })
  .openapi('CoachPlayersResponse')

const playersRoute = createRoute({
  method: 'get',
  path: '/coach/players',
  summary: 'El plantel del coach de la sesión',
  responses: {
    200: {
      description: 'Plantel',
      content: { 'application/json': { schema: CoachPlayersResponse } },
    },
    401: {
      description: 'Sin sesión o rol equivocado',
      content: { 'application/json': { schema: ErrorResponse } },
    },
  },
})

export const players = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  playersRoute,
  async (c) => {
    // El guard del prefijo /coach/* (app.ts) ya corrió: actor no es null acá.
    const actor = c.get('actor')!

    // Capa 4: scoping explícito por coach_id del actor. RLS (capa 1) filtra
    // igual aunque este .eq() no estuviera — por eso un ADMIN acá ve [] y no
    // el plantel de otro: no ES coach de nadie.
    const { data, error } = await c
      .get('db')
      .from('profiles')
      .select('id, name, email, position_id')
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .order('name')

    if (error) throw new Error(error.message)

    return c.json(
      {
        ok: true as const,
        players: (data ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          email: p.email as string,
          positionId: (p.position_id as string | null) ?? null,
        })),
      },
      200,
    )
  },
)
