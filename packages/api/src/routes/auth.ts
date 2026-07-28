import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { UnauthorizedError } from '@coachlab/core/access/rbac'
import { sessionUserSchema } from '@coachlab/core/validators/auth'
import type { AuthVariables } from '../middleware/auth'
import { ErrorResponse } from './schemas'

const MeResponse = z
  .object({ ok: z.literal(true), user: sessionUserSchema })
  .openapi('MeResponse')

const meRoute = createRoute({
  method: 'get',
  path: '/auth/me',
  summary: 'El usuario de la sesión actual, con el rol leído de profiles',
  responses: {
    200: { description: 'Sesión válida', content: { 'application/json': { schema: MeResponse } } },
    401: { description: 'Sin sesión', content: { 'application/json': { schema: ErrorResponse } } },
  },
})

/**
 * Única ruta de auth en la API: registro, login y logout van directo del
 * frontend a Supabase Auth vía @supabase/ssr, que ya resuelve cookies y
 * refresh. Esto es lo que Nuxt y los tests usan para preguntar "¿quién soy
 * para la API?".
 */
export const auth = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(meRoute, (c) => {
  const actor = c.get('actor')
  if (!actor) throw new UnauthorizedError()
  return c.json({ ok: true as const, user: actor }, 200)
})
