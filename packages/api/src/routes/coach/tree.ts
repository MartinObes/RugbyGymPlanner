import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { nextOrderIndex } from '@coachlab/core/domain/tree'
import {
  blockExerciseSchema,
  blockSchema,
  daySchema,
  reorderSchema,
  weekSchema,
} from '@coachlab/core/validators/program'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from './_scope'

/**
 * CRUD de las filas del árbol del programa.
 *
 * Las rutas de hijos NO repiten el programId en el path: el id de cada fila es
 * un uuid y RLS resuelve el ownership subiendo el árbol hasta can_write_program
 * (migración 0003). Lo que sí hace CADA una es `assertRow`, porque un id ajeno
 * responde 200 con 0 filas afectadas si no se comprueba.
 *
 * No se permite cambiar el padre de una fila (re-parentar): mover un ejercicio
 * de bloque es borrarlo y crearlo. Un UPDATE que mueve la fila fuera del alcance
 * de su política de SELECT falla con 42501 (CLAUDE.md §3).
 */

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

const Created = z.object({ ok: z.literal(true), id: z.string().uuid() }).openapi('CreatedRow')
const Ok = z.object({ ok: z.literal(true) })

const okResponses = {
  200: { description: 'Listo', content: { 'application/json': { schema: Ok } } },
  ...errors,
}

const createdResponses = {
  200: { description: 'Creado', content: { 'application/json': { schema: Created } } },
  ...errors,
}

/**
 * Genérico sobre el nombre para que `c.req.valid('param')` conserve la clave
 * literal: con `Record<string, …>` el índice sale `string | undefined` y hay que
 * andar con `!` en cada handler.
 */
function pathParam<K extends string>(name: K) {
  return z.object({ [name]: z.string().uuid().openapi({ param: { name, in: 'path' } }) } as {
    [P in K]: z.ZodString
  })
}

export const tree = new OpenAPIHono<{ Variables: AuthVariables }>()

/**
 * Los cuatro niveles del árbol del programa: las únicas tablas que llevan
 * `order_index`. Con el cliente tipado (F3.5) el nombre de la tabla no puede ser
 * un `string` cualquiera —`db.from()` no resolvería ninguna columna—, y acotarlo
 * a esta unión es además lo que hace que `.select('order_index')` typecheckee de
 * verdad en vez de necesitar un `as`.
 */
type OrderedTable = 'weeks' | 'days' | 'blocks' | 'block_exercises'

/** El order_index del próximo hermano, leído de los que ya existen. */
async function nextIndexFor(
  db: AuthVariables['db'],
  table: OrderedTable,
  parentColumn: string,
  parentId: string,
): Promise<number> {
  const { data, error } = await db
    .from(table)
    .select('order_index')
    // El nombre de la columna padre cambia por tabla (program_id, week_id…), así
    // que TS no puede estrecharlo desde `table`. El `never` es el tipo que
    // PostgREST le da al filtro sobre una unión de tablas: acá lo elegimos a
    // mano y los cuatro call sites de abajo son la verificación.
    .eq(parentColumn as never, parentId)
  if (error) throw new Error(error.message)
  return nextOrderIndex(data ?? [])
}

// --- semanas -----------------------------------------------------------------

tree.openapi(
  createRoute({
    method: 'post',
    path: '/coach/programs/{programId}/weeks',
    summary: 'Agregar una semana',
    request: {
      params: pathParam('programId'),
      body: { content: { 'application/json': { schema: weekSchema } } },
    },
    responses: createdResponses,
  }),
  async (c) => {
    const { programId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    const { data, error } = await db
      .from('weeks')
      .insert({
        program_id: programId,
        name: input.name,
        order_index: await nextIndexFor(db, 'weeks', 'program_id', programId),
      })
      .select('id')
      .maybeSingle()

    const week = assertRow(data, error)
    return c.json({ ok: true as const, id: week.id as string }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/weeks/{weekId}',
    summary: 'Renombrar una semana',
    request: {
      params: pathParam('weekId'),
      body: { content: { 'application/json': { schema: weekSchema } } },
    },
    responses: okResponses,
  }),
  async (c) => {
    const { weekId } = c.req.valid('param')
    const input = c.req.valid('json')

    const { data, error } = await c
      .get('db')
      .from('weeks')
      .update({ name: input.name })
      .eq('id', weekId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/weeks/{weekId}',
    summary: 'Borrar una semana con sus días',
    request: { params: pathParam('weekId') },
    responses: okResponses,
  }),
  async (c) => {
    const { weekId } = c.req.valid('param')

    const { data, error } = await c
      .get('db')
      .from('weeks')
      .delete()
      .eq('id', weekId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

// --- días --------------------------------------------------------------------

tree.openapi(
  createRoute({
    method: 'post',
    path: '/coach/weeks/{weekId}/days',
    summary: 'Agregar un día',
    request: {
      params: pathParam('weekId'),
      body: { content: { 'application/json': { schema: daySchema } } },
    },
    responses: createdResponses,
  }),
  async (c) => {
    const { weekId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    const { data, error } = await db
      .from('days')
      .insert({
        week_id: weekId,
        name: input.name,
        order_index: await nextIndexFor(db, 'days', 'week_id', weekId),
      })
      .select('id')
      .maybeSingle()

    const day = assertRow(data, error)
    return c.json({ ok: true as const, id: day.id as string }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/days/{dayId}',
    summary: 'Renombrar un día',
    request: {
      params: pathParam('dayId'),
      body: { content: { 'application/json': { schema: daySchema } } },
    },
    responses: okResponses,
  }),
  async (c) => {
    const { dayId } = c.req.valid('param')
    const input = c.req.valid('json')

    const { data, error } = await c
      .get('db')
      .from('days')
      .update({ name: input.name })
      .eq('id', dayId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/days/{dayId}',
    summary: 'Borrar un día con sus bloques',
    request: { params: pathParam('dayId') },
    responses: okResponses,
  }),
  async (c) => {
    const { dayId } = c.req.valid('param')

    const { data, error } = await c
      .get('db')
      .from('days')
      .delete()
      .eq('id', dayId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

// --- bloques -----------------------------------------------------------------

tree.openapi(
  createRoute({
    method: 'post',
    path: '/coach/days/{dayId}/blocks',
    summary: 'Agregar un bloque simple o un circuito',
    request: {
      params: pathParam('dayId'),
      body: { content: { 'application/json': { schema: blockSchema } } },
    },
    responses: createdResponses,
  }),
  async (c) => {
    const { dayId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    const { data, error } = await db
      .from('blocks')
      .insert({
        day_id: dayId,
        type: input.type,
        // El CHECK blocks_type_shape (0008) exige vueltas solo en CIRCUIT.
        rounds: input.type === 'CIRCUIT' ? input.rounds : null,
        order_index: await nextIndexFor(db, 'blocks', 'day_id', dayId),
      })
      .select('id')
      .maybeSingle()

    const block = assertRow(data, error)
    return c.json({ ok: true as const, id: block.id as string }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/blocks/{blockId}',
    summary: 'Cambiar el tipo o las vueltas de un bloque',
    request: {
      params: pathParam('blockId'),
      body: { content: { 'application/json': { schema: blockSchema } } },
    },
    responses: okResponses,
  }),
  async (c) => {
    const { blockId } = c.req.valid('param')
    const input = c.req.valid('json')

    const { data, error } = await c
      .get('db')
      .from('blocks')
      .update({ type: input.type, rounds: input.type === 'CIRCUIT' ? input.rounds : null })
      .eq('id', blockId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/blocks/{blockId}',
    summary: 'Borrar un bloque con sus ejercicios',
    request: { params: pathParam('blockId') },
    responses: okResponses,
  }),
  async (c) => {
    const { blockId } = c.req.valid('param')

    const { data, error } = await c
      .get('db')
      .from('blocks')
      .delete()
      .eq('id', blockId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

// --- ejercicios del bloque ---------------------------------------------------

/**
 * Las columnas de carga: los cuatro modos son mutuamente excluyentes y el CHECK
 * block_exercises_load_shape (0013) lo garantiza. Se limpian las tres que no
 * corresponden, así el cliente no puede dejar residuo de un modo anterior.
 */
function loadColumns(input: {
  loadType: 'WEIGHT' | 'PERCENTAGE' | 'NONE' | 'LABEL'
  weight?: number | null
  percentage?: number | null
  loadLabel?: string | null
}) {
  return {
    load_type: input.loadType,
    weight: input.loadType === 'WEIGHT' ? input.weight : null,
    percentage: input.loadType === 'PERCENTAGE' ? input.percentage : null,
    load_label: input.loadType === 'LABEL' ? input.loadLabel : null,
  }
}

tree.openapi(
  createRoute({
    method: 'post',
    path: '/coach/blocks/{blockId}/exercises',
    summary: 'Agregar un ejercicio al bloque',
    request: {
      params: pathParam('blockId'),
      body: { content: { 'application/json': { schema: blockExerciseSchema } } },
    },
    responses: createdResponses,
  }),
  async (c) => {
    const { blockId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    const { data, error } = await db
      .from('block_exercises')
      .insert({
        block_id: blockId,
        exercise_id: input.exerciseId,
        ...loadColumns(input),
        sets: input.sets,
        reps: input.reps,
        target_rpe: input.targetRpe ?? null,
        order_index: await nextIndexFor(db, 'block_exercises', 'block_id', blockId),
      })
      .select('id')
      .maybeSingle()

    const exercise = assertRow(data, error)
    return c.json({ ok: true as const, id: exercise.id as string }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/block-exercises/{blockExerciseId}',
    summary: 'Guardar un ejercicio del bloque (la ruta del autosave)',
    request: {
      params: pathParam('blockExerciseId'),
      body: { content: { 'application/json': { schema: blockExerciseSchema } } },
    },
    responses: okResponses,
  }),
  async (c) => {
    const { blockExerciseId } = c.req.valid('param')
    const input = c.req.valid('json')

    // block_id NO se toca: re-parentar no es un caso de uso y sacaría la fila
    // del alcance de su política de SELECT.
    const { data, error } = await c
      .get('db')
      .from('block_exercises')
      .update({
        exercise_id: input.exerciseId,
        ...loadColumns(input),
        sets: input.sets,
        reps: input.reps,
        target_rpe: input.targetRpe ?? null,
      })
      .eq('id', blockExerciseId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

tree.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/block-exercises/{blockExerciseId}',
    summary: 'Borrar un ejercicio del bloque',
    request: { params: pathParam('blockExerciseId') },
    responses: okResponses,
  }),
  async (c) => {
    const { blockExerciseId } = c.req.valid('param')

    const { data, error } = await c
      .get('db')
      .from('block_exercises')
      .delete()
      .eq('id', blockExerciseId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

// --- reordenar ---------------------------------------------------------------

tree.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/blocks/{blockId}/exercises/reorder',
    summary: 'Renumerar los ejercicios de un bloque',
    request: {
      params: pathParam('blockId'),
      body: { content: { 'application/json': { schema: reorderSchema } } },
    },
    responses: okResponses,
  }),
  async (c) => {
    const { blockId } = c.req.valid('param')
    const { items } = c.req.valid('json')
    const db = c.get('db')

    // Un update por fila, acotado al bloque del path: así una fila de otro
    // bloque colada en el body no se mueve. A 10 ejercicios por bloque el costo
    // es irrelevante y evita una RPC solo para esto.
    for (const item of items) {
      const { data, error } = await db
        .from('block_exercises')
        .update({ order_index: item.order_index })
        .eq('id', item.id)
        .eq('block_id', blockId)
        .select('id')
        .maybeSingle()
      assertRow(data, error)
    }

    return c.json({ ok: true as const }, 200)
  },
)
