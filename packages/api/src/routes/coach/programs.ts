import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { NotFoundError } from '@coachlab/core/access/rbac'
import { programSchema } from '@coachlab/core/validators/program'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from './_scope'

const ProgramIdParam = z.object({
  programId: z.string().uuid().openapi({ param: { name: 'programId', in: 'path' } }),
})

const ProgramSummary = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    currentWeekId: z.string().uuid().nullable(),
    weekCount: z.number(),
    assignmentCount: z.number(),
    updatedAt: z.string(),
  })
  .openapi('ProgramSummary')

// El árbol completo, un nivel por tabla (CLAUDE.md §3: nada embebido).
const TreeExercise = z
  .object({
    id: z.string().uuid(),
    exerciseId: z.string().uuid(),
    exerciseName: z.string(),
    loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE']),
    weight: z.number().nullable(),
    percentage: z.number().nullable(),
    sets: z.number().nullable(),
    reps: z.string().nullable(),
    targetRpe: z.number().nullable(),
    orderIndex: z.number(),
  })
  .openapi('TreeExercise')

const TreeBlock = z
  .object({
    id: z.string().uuid(),
    type: z.enum(['SINGLE', 'CIRCUIT']),
    rounds: z.number().nullable(),
    orderIndex: z.number(),
    exercises: z.array(TreeExercise),
  })
  .openapi('TreeBlock')

const TreeDay = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    orderIndex: z.number(),
    blocks: z.array(TreeBlock),
  })
  .openapi('TreeDay')

const TreeWeek = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    orderIndex: z.number(),
    days: z.array(TreeDay),
  })
  .openapi('TreeWeek')

const ProgramTree = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    currentWeekId: z.string().uuid().nullable(),
    weeks: z.array(TreeWeek),
  })
  .openapi('ProgramTree')

const ProgramsResponse = z
  .object({ ok: z.literal(true), programs: z.array(ProgramSummary) })
  .openapi('ProgramsResponse')

const ProgramTreeResponse = z
  .object({ ok: z.literal(true), program: ProgramTree })
  .openapi('ProgramTreeResponse')

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

const num = (value: unknown): number => (typeof value === 'number' ? value : 0)
const nullableNum = (value: unknown): number | null => (typeof value === 'number' ? value : null)

/**
 * `exercises` viene como objeto en runtime (relación many-to-one) pero el cliente
 * de este paquete no está tipado con Database, así que TS lo infiere como array.
 * Se normalizan las dos formas en vez de castear.
 */
function nameOf(value: unknown): string {
  const one = Array.isArray(value) ? value[0] : value
  const named = one as { name?: string | null } | null | undefined
  return named?.name ?? '—'
}

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : []

export const programs = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- listar ------------------------------------------------------------------

programs.openapi(
  createRoute({
    method: 'get',
    path: '/coach/programs',
    summary: 'Programas del coach, con conteo de semanas y asignaciones',
    responses: {
      200: { description: 'Programas', content: { 'application/json': { schema: ProgramsResponse } } },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!

    const { data, error } = await c
      .get('db')
      .from('programs')
      // `weeks!weeks_program_id_fkey`: hay DOS relaciones entre programs y weeks
      // (weeks.program_id y programs.current_week_id), y sin desambiguar
      // PostgREST responde "more than one relationship was found".
      .select('id, name, current_week_id, updated_at, weeks!weeks_program_id_fkey(id), program_assignments(id)')
      .eq('coach_id', actor.id)
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)

    return c.json(
      {
        ok: true as const,
        programs: (data ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          currentWeekId: (p.current_week_id as string | null) ?? null,
          weekCount: asArray(p.weeks).length,
          assignmentCount: asArray(p.program_assignments).length,
          updatedAt: p.updated_at as string,
        })),
      },
      200,
    )
  },
)

// --- crear -------------------------------------------------------------------

programs.openapi(
  createRoute({
    method: 'post',
    path: '/coach/programs',
    summary: 'Crear un programa con Semana 1 / Día 1 ya listos',
    request: { body: { content: { 'application/json': { schema: programSchema } } } },
    responses: {
      200: {
        description: 'Creado',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true), programId: z.string().uuid() }),
          },
        },
      },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')
    const db = c.get('db')

    // Un programa vacío no se puede editar: nace con Semana 1 y Día 1.
    //
    // Son tres inserts sin transacción (PostgREST no las expone entre requests).
    // Si se corta en el medio queda un programa sin semana, que el editor
    // muestra igual y el coach puede completar con "+ Semana". Es preferible a
    // mover la construcción del árbol a SQL.
    const { data: program, error } = await db
      .from('programs')
      .insert({ coach_id: actor.id, name: input.name })
      .select('id')
      .maybeSingle()
    const created = assertRow(program, error)

    const { data: week, error: weekError } = await db
      .from('weeks')
      .insert({ program_id: created.id, name: 'Semana 1', order_index: 0 })
      .select('id')
      .maybeSingle()
    const firstWeek = assertRow(week, weekError)

    const { error: dayError } = await db
      .from('days')
      .insert({ week_id: firstWeek.id, name: 'Día 1', order_index: 0 })
    if (dayError) throw new Error(dayError.message)

    const { error: currentError } = await db
      .from('programs')
      .update({ current_week_id: firstWeek.id })
      .eq('id', created.id)
    if (currentError) throw new Error(currentError.message)

    return c.json({ ok: true as const, programId: created.id as string }, 200)
  },
)

// --- leer el árbol completo --------------------------------------------------

programs.openapi(
  createRoute({
    method: 'get',
    path: '/coach/programs/{programId}',
    summary: 'El árbol completo del programa en un request',
    request: { params: ProgramIdParam },
    responses: {
      200: { description: 'Árbol', content: { 'application/json': { schema: ProgramTreeResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const { programId } = c.req.valid('param')

    // Un solo request para todo el árbol: es lo que gana el modelo relacional
    // sobre el embebido (CLAUDE.md §3). RLS resuelve el ownership.
    const { data, error } = await c
      .get('db')
      .from('programs')
      // `weeks!weeks_program_id_fkey` desambigua: programs↔weeks tiene dos FK
      // (weeks.program_id y programs.current_week_id) y PostgREST no elige sola.
      .select(
        `id, name, current_week_id,
         weeks!weeks_program_id_fkey(id, name, order_index,
           days(id, name, order_index,
             blocks(id, type, rounds, order_index,
               block_exercises(id, exercise_id, load_type, weight, percentage,
                               sets, reps, target_rpe, order_index,
                               exercises(name)))))`,
      )
      .eq('id', programId)
      .maybeSingle()

    const program = assertRow(data, error)

    // El orden NO se confía al orden de llegada (CLAUDE.md §3). Se pide por
    // order_index acá y el frontend lo vuelve a garantizar con sortByOrderIndex.
    const byOrder = (rows: Record<string, unknown>[]) =>
      [...rows].sort((a, b) => num(a.order_index) - num(b.order_index))

    return c.json(
      {
        ok: true as const,
        program: {
          id: program.id as string,
          name: program.name as string,
          currentWeekId: (program.current_week_id as string | null) ?? null,
          weeks: byOrder(asArray(program.weeks)).map((w) => ({
            id: w.id as string,
            name: w.name as string,
            orderIndex: num(w.order_index),
            days: byOrder(asArray(w.days)).map((d) => ({
              id: d.id as string,
              name: d.name as string,
              orderIndex: num(d.order_index),
              blocks: byOrder(asArray(d.blocks)).map((b) => ({
                id: b.id as string,
                type: (b.type as 'SINGLE' | 'CIRCUIT') ?? 'SINGLE',
                rounds: nullableNum(b.rounds),
                orderIndex: num(b.order_index),
                exercises: byOrder(asArray(b.block_exercises)).map((e) => ({
                  id: e.id as string,
                  exerciseId: e.exercise_id as string,
                  exerciseName: nameOf(e.exercises),
                  loadType: e.load_type as 'WEIGHT' | 'PERCENTAGE' | 'NONE',
                  weight: nullableNum(e.weight),
                  percentage: nullableNum(e.percentage),
                  sets: nullableNum(e.sets),
                  reps: (e.reps as string | null) ?? null,
                  targetRpe: nullableNum(e.target_rpe),
                  orderIndex: num(e.order_index),
                })),
              })),
            })),
          })),
        },
      },
      200,
    )
  },
)

// --- renombrar / marcar la semana actual -------------------------------------

programs.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/programs/{programId}',
    summary: 'Renombrar el programa o marcar la semana actual',
    request: {
      params: ProgramIdParam,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: programSchema.shape.name.optional(),
              currentWeekId: z.string().uuid().nullish(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Actualizado',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { programId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    if (input.currentWeekId) {
      // La semana viene del cliente: hay que verificar que sea DE ESTE programa.
      // Sin esto, un coach podría apuntar current_week_id a una semana ajena
      // (el FK solo exige que exista).
      const { data: week, error: weekError } = await db
        .from('weeks')
        .select('id')
        .eq('id', input.currentWeekId)
        .eq('program_id', programId)
        .maybeSingle()
      assertRow(week, weekError)
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) patch.name = input.name
    if (input.currentWeekId !== undefined) patch.current_week_id = input.currentWeekId

    const { data, error } = await db
      .from('programs')
      .update(patch)
      .eq('id', programId)
      .eq('coach_id', actor.id)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

// --- borrar ------------------------------------------------------------------

programs.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/programs/{programId}',
    summary: 'Borrar el programa con todo su árbol y sus asignaciones',
    request: { params: ProgramIdParam },
    responses: {
      200: {
        description: 'Borrado',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { programId } = c.req.valid('param')

    // Una línea: el ON DELETE CASCADE de 0001 se lleva semanas, días, bloques,
    // ejercicios del bloque y assignments.
    const { data, error } = await c
      .get('db')
      .from('programs')
      .delete()
      .eq('id', programId)
      .eq('coach_id', actor.id)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

/** Lo usa tree.ts para el 404 cuando el padre no existe o no es del actor. */
export function notFound(): never {
  throw new NotFoundError()
}
