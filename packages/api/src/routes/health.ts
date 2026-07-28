import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { createAnonClient } from '../db/client'

const HealthResponse = z
  .object({
    ok: z.boolean(),
    service: z.string(),
    db: z.enum(['ok', 'error', 'unconfigured']),
  })
  .openapi('HealthResponse')

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Estado del servicio y de la base',
  responses: {
    200: {
      description: 'La API está viva',
      content: { 'application/json': { schema: HealthResponse } },
    },
  },
})

export const health = new OpenAPIHono().openapi(healthRoute, async (c) => {
  // Este endpoint TIENE que tocar la base de verdad, no solo responder desde
  // Nitro: es lo que UptimeRobot va a pegarle cada 5 minutos para que el
  // proyecto de Supabase no se pause por inactividad (CLAUDE.md §2).
  //
  // Sin sesión el rol es `anon` y RLS no le da ninguna fila. Da igual: lo que
  // importa es que la consulta llegó a Postgres y volvió sin error.
  let db: 'ok' | 'error' | 'unconfigured' = 'unconfigured'

  try {
    const { error } = await createAnonClient().from('exercises').select('id').limit(1)
    db = error ? 'error' : 'ok'
  } catch {
    // Falta configuración de entorno: la API igual está viva y hay que poder
    // verlo, así que no se propaga como 500.
    db = 'unconfigured'
  }

  return c.json({ ok: true, service: 'coachlab-api', db }, 200)
})
