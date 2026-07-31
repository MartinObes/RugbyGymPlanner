import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { evaluationSchema } from '@coachlab/core/validators/evaluation'
import { evaluationsFor } from '../../access/evaluations'
import type { AuthVariables } from '../../middleware/auth'
import { assertRow } from '../coach/_scope'
import { ErrorResponse } from '../schemas'

const EvaluationIdParam = z.object({
  evaluationId: z.string().uuid().openapi({ param: { name: 'evaluationId', in: 'path' } }),
})

export const Evaluation = z
  .object({
    id: z.string(),
    exerciseId: z.string(),
    exerciseName: z.string(),
    kg: z.number(),
    testedOn: z.string(),
  })
  .openapi('Evaluation')

const EvaluationsResponse = z
  .object({ ok: z.literal(true), evaluations: z.array(Evaluation) })
  .openapi('PlayerEvaluationsResponse')

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

export const playerEvaluations = new OpenAPIHono<{ Variables: AuthVariables }>()

playerEvaluations.openapi(
  createRoute({
    method: 'get',
    path: '/player/evaluations',
    summary: 'Mis tests de fuerza',
    responses: {
      200: {
        description: 'Mis evaluaciones',
        content: { 'application/json': { schema: EvaluationsResponse } },
      },
      401: errors[401],
    },
  }),
  async (c) => {
    const evaluations = await evaluationsFor(c.get('db'), c.get('actor')!.id)
    return c.json({ ok: true as const, evaluations }, 200)
  },
)

playerEvaluations.openapi(
  createRoute({
    method: 'post',
    path: '/player/evaluations',
    summary: 'Cargar un test de fuerza propio',
    request: { body: { content: { 'application/json': { schema: evaluationSchema } } } },
    responses: {
      200: {
        description: 'Cargada, con el 1RM ya sincronizado',
        content: { 'application/json': { schema: EvaluationsResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')
    const db = c.get('db')

    // El 1RM NO se toca acá: lo sincroniza el trigger de la migración 0018. Es a
    // propósito — las evaluaciones entran por esta ruta y por la del coach, y una
    // regla duplicada en dos rutas es una regla que la tercera se va a olvidar.
    const { data, error } = await db
      .from('evaluations')
      .insert({
        player_id: actor.id,
        exercise_id: input.exerciseId,
        kg: input.kg,
        // Sin fecha, la base pone current_date.
        ...(input.testedOn ? { tested_on: input.testedOn } : {}),
      })
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const, evaluations: await evaluationsFor(db, actor.id) }, 200)
  },
)

playerEvaluations.openapi(
  createRoute({
    method: 'delete',
    path: '/player/evaluations/{evaluationId}',
    summary: 'Borrar uno de mis tests',
    request: { params: EvaluationIdParam },
    responses: {
      200: {
        description: 'Borrada',
        content: { 'application/json': { schema: EvaluationsResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { evaluationId } = c.req.valid('param')
    const db = c.get('db')

    const { data, error } = await db
      .from('evaluations')
      .delete()
      .eq('id', evaluationId)
      .eq('player_id', actor.id)
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    // Ojo: borrar la evaluación NO revierte el 1RM. El trigger 0018 corre en
    // insert y update, no en delete, así que el 1RM queda con el último valor
    // sincronizado. Es aceptable —el 1RM es editable a mano— y está anotado como
    // deuda en docs/IMPLEMENTATION-F3.5.md.
    return c.json({ ok: true as const, evaluations: await evaluationsFor(db, actor.id) }, 200)
  },
)
