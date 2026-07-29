import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { positionById, SYSTEM_GROUPS } from '@coachlab/core/domain/positions'
import { BASE_PRIORITY } from '@coachlab/core/domain/resolveProgram'
import { assignmentSchema } from '@coachlab/core/validators/program'
import { ASSIGNMENT_COLUMNS, activeProgramIdFor, kindOf, type AssignmentRow } from '../../access/assignments'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from './_scope'

const ProgramIdParam = z.object({
  programId: z.string().uuid().openapi({ param: { name: 'programId', in: 'path' } }),
})

const Assignment = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['PLAYER', 'POSITION_GROUP', 'SYSTEM_GROUP', 'POSITION']),
    /** Nombre del destino resuelto, para no hacer que el frontend lo busque. */
    targetName: z.string(),
    basePriority: z.number(),
    priority: z.number(),
    totalPriority: z.number(),
    createdAt: z.string(),
  })
  .openapi('Assignment')

const AssignmentsResponse = z
  .object({ ok: z.literal(true), assignments: z.array(Assignment) })
  .openapi('AssignmentsResponse')

const PreviewRow = z
  .object({
    playerId: z.string().uuid(),
    name: z.string(),
    positionId: z.string().nullable(),
    programId: z.string().uuid().nullable(),
    programName: z.string().nullable(),
  })
  .openapi('AssignmentPreviewRow')

const PreviewResponse = z
  .object({ ok: z.literal(true), rows: z.array(PreviewRow) })
  .openapi('AssignmentPreviewResponse')

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

export const assignments = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- listar los del programa -------------------------------------------------

assignments.openapi(
  createRoute({
    method: 'get',
    path: '/coach/programs/{programId}/assignments',
    summary: 'Asignaciones del programa, con el destino resuelto',
    request: { params: ProgramIdParam },
    responses: {
      200: {
        description: 'Asignaciones',
        content: { 'application/json': { schema: AssignmentsResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const { programId } = c.req.valid('param')
    const db = c.get('db')

    const { data, error } = await db
      .from('program_assignments')
      .select(`${ASSIGNMENT_COLUMNS}, profiles(name), position_groups(name)`)
      .eq('program_id', programId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const nameOf = (value: unknown): string | null => {
      const one = Array.isArray(value) ? value[0] : value
      return (one as { name?: string | null } | null | undefined)?.name ?? null
    }

    const rows = (data ?? []).map((row) => {
      const assignment = row as unknown as AssignmentRow
      const kind = kindOf(assignment)

      const targetName =
        kind === 'PLAYER'
          ? (nameOf((row as Record<string, unknown>).profiles) ?? 'Jugador')
          : kind === 'POSITION_GROUP'
            ? (nameOf((row as Record<string, unknown>).position_groups) ?? 'Grupo')
            : kind === 'SYSTEM_GROUP'
              ? (SYSTEM_GROUPS.find((g) => g.id === assignment.system_group_id)?.name ?? 'Grupo')
              : (positionById(assignment.position_id ?? '')?.name ?? 'Puesto')

      const basePriority = BASE_PRIORITY[kind]

      return {
        id: assignment.id,
        kind,
        targetName,
        basePriority,
        priority: assignment.priority,
        totalPriority: basePriority + assignment.priority,
        createdAt: assignment.created_at,
      }
    })

    return c.json({ ok: true as const, assignments: rows }, 200)
  },
)

// --- crear -------------------------------------------------------------------

assignments.openapi(
  createRoute({
    method: 'post',
    path: '/coach/programs/{programId}/assignments',
    summary: 'Asignar el programa a un jugador, puesto o grupo',
    request: {
      params: ProgramIdParam,
      body: { content: { 'application/json': { schema: assignmentSchema } } },
    },
    responses: {
      200: {
        description: 'Creada',
        content: {
          'application/json': { schema: z.object({ ok: z.literal(true), id: z.string().uuid() }) },
        },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { programId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    // El destino tiene que ser del coach. Redundante con el trigger
    // guard_assignment_targets (0006/0009) a propósito: el trigger da la
    // garantía, esto da el 404 con mensaje en vez de un error de Postgres crudo.
    if (input.playerId) {
      const { data, error } = await db
        .from('profiles')
        .select('id')
        .eq('id', input.playerId)
        .eq('coach_id', actor.id)
        .eq('role', 'PLAYER')
        .maybeSingle()
      assertRow(data, error)
    }
    if (input.positionGroupId) {
      const { data, error } = await db
        .from('position_groups')
        .select('id')
        .eq('id', input.positionGroupId)
        .eq('coach_id', actor.id)
        .maybeSingle()
      assertRow(data, error)
    }

    const { data, error } = await db
      .from('program_assignments')
      .insert({
        program_id: programId,
        // Exactamente uno no-nulo: lo garantiza assignmentSchema y el CHECK
        // program_assignments_one_target (0001).
        player_id: input.playerId ?? null,
        position_group_id: input.positionGroupId ?? null,
        system_group_id: input.systemGroupId ?? null,
        position_id: input.positionId ?? null,
        priority: input.priority,
      })
      .select('id')
      .maybeSingle()

    const created = assertRow(data, error)
    return c.json({ ok: true as const, id: created.id as string }, 200)
  },
)

// --- borrar ------------------------------------------------------------------

assignments.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/assignments/{assignmentId}',
    summary: 'Quitar una asignación',
    request: {
      params: z.object({
        assignmentId: z.string().uuid().openapi({ param: { name: 'assignmentId', in: 'path' } }),
      }),
    },
    responses: {
      200: {
        description: 'Borrada',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const { assignmentId } = c.req.valid('param')

    const { data, error } = await c
      .get('db')
      .from('program_assignments')
      .delete()
      .eq('id', assignmentId)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

// --- vista previa de impacto -------------------------------------------------

assignments.openapi(
  createRoute({
    method: 'get',
    path: '/coach/assignments/preview',
    summary: 'Qué programa le queda vigente a cada jugador del plantel',
    responses: {
      200: { description: 'Impacto', content: { 'application/json': { schema: PreviewResponse } } },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const db = c.get('db')

    const { data: playersData, error } = await db
      .from('profiles')
      .select('id, name, position_id')
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .order('name')
    if (error) throw new Error(error.message)

    const { data: programsData, error: programsError } = await db
      .from('programs')
      .select('id, name')
      .eq('coach_id', actor.id)
    if (programsError) throw new Error(programsError.message)

    const programNames = new Map(
      (programsData ?? []).map((p) => [p.id as string, p.name as string]),
    )

    // Dos queries por jugador. A 40–60 jugadores, una vez que el coach abre la
    // pantalla, es gratis (CLAUDE.md §2: no optimizar prematuramente). Si algún
    // día molesta, el fix es traer todos los assignments del coach y resolver en
    // memoria con la misma función pura.
    const rows = await Promise.all(
      (playersData ?? []).map(async (p) => {
        const playerId = p.id as string
        const positionId = (p.position_id as string | null) ?? null
        const programId = await activeProgramIdFor(db, { id: playerId, positionId })

        return {
          playerId,
          name: p.name as string,
          positionId,
          programId,
          programName: programId ? (programNames.get(programId) ?? null) : null,
        }
      }),
    )

    return c.json({ ok: true as const, rows }, 200)
  },
)
