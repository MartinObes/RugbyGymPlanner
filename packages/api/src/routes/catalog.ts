import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { AuthVariables } from '../middleware/auth'
import { ErrorResponse } from './schemas'

const Exercise = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    normalizedName: z.string(),
    category: z.string().nullable(),
  })
  .openapi('Exercise')

const ExercisesResponse = z
  .object({ ok: z.literal(true), exercises: z.array(Exercise) })
  .openapi('ExercisesResponse')

/**
 * El catálogo de ejercicios: global y de lectura para cualquier usuario
 * autenticado (política exercises_select de 0003).
 *
 * Vive bajo /catalog/* y no bajo /coach/* porque lo consumen las dos partes: el
 * typeahead del editor de programas (F2) y el de 1RM del perfil del jugador
 * (F3). El prefijo tiene su propio requireRole en app.ts, así que sigue valiendo
 * la regla de CLAUDE.md §4: ninguna ruta nace sin guard.
 */
export const catalog = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  createRoute({
    method: 'get',
    path: '/catalog/exercises',
    summary: 'Catálogo de ejercicios',
    responses: {
      200: {
        description: 'Catálogo',
        content: { 'application/json': { schema: ExercisesResponse } },
      },
      401: { description: 'Sin sesión', content: { 'application/json': { schema: ErrorResponse } } },
    },
  }),
  async (c) => {
    const { data, error } = await c
      .get('db')
      .from('exercises')
      .select('id, name, normalized_name, category')
      .order('name')
    if (error) throw new Error(error.message)

    return c.json(
      {
        ok: true as const,
        exercises: (data ?? []).map((e) => ({
          id: e.id as string,
          name: e.name as string,
          normalizedName: e.normalized_name as string,
          category: (e.category as string | null) ?? null,
        })),
      },
      200,
    )
  },
)
