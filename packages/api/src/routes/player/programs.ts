import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { candidateAssignmentsFor } from '../../access/assignments'
import type { AuthVariables } from '../../middleware/auth'
import { assertRow } from '../coach/_scope'
import { ErrorResponse } from '../schemas'

const PlayerProgram = z
  .object({
    programId: z.string().uuid(),
    name: z.string(),
    assignedAt: z.string(),
    /** La que el jugador está viendo: su elección, o la última asignada. */
    current: z.boolean(),
  })
  .openapi('PlayerProgram')

const ProgramsResponse = z
  .object({ ok: z.literal(true), programs: z.array(PlayerProgram) })
  .openapi('PlayerProgramsResponse')

const errors = {
  401: {
    description: 'Sin sesión o rol equivocado',
    content: { 'application/json': { schema: ErrorResponse } },
  },
  404: {
    description: 'Esa rutina no te fue asignada',
    content: { 'application/json': { schema: ErrorResponse } },
  },
}

export const playerPrograms = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- listar las mías ---------------------------------------------------------

playerPrograms.openapi(
  createRoute({
    method: 'get',
    path: '/player/programs',
    summary: 'Las rutinas asignadas al jugador',
    responses: {
      200: { description: 'Rutinas', content: { 'application/json': { schema: ProgramsResponse } } },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const db = c.get('db')

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('position_id, selected_program_id')
      .eq('id', actor.id)
      .maybeSingle()
    if (profileError) throw new Error(profileError.message)

    const candidates = await candidateAssignmentsFor(db, {
      id: actor.id,
      positionId: profile?.position_id ?? null,
    })
    if (candidates.length === 0) return c.json({ ok: true as const, programs: [] }, 200)

    const { data: programs, error } = await db
      .from('programs')
      .select('id, name')
      .in('id', [...new Set(candidates.map((a) => a.programId))])
    if (error) throw new Error(error.message)

    const nameById = new Map((programs ?? []).map((p) => [p.id, p.name]))

    // Un programa puede tener más de un assignment al mismo jugador (uno directo
    // y otro por grupo). Se muestra una vez, con la fecha de la asignación más
    // reciente, que es la que decide en resolveProgram.
    const latestByProgram = new Map<string, Date>()
    for (const candidate of candidates) {
      const seen = latestByProgram.get(candidate.programId)
      if (!seen || candidate.createdAt > seen) {
        latestByProgram.set(candidate.programId, candidate.createdAt)
      }
    }

    const rows = [...latestByProgram.entries()]
      .map(([programId, assignedAt]) => ({
        programId,
        name: nameById.get(programId) ?? 'Rutina',
        assignedAt: assignedAt.toISOString(),
      }))
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))

    // Misma regla que resolveProgram: la elección si sigue entre las candidatas,
    // si no la última asignada — que es la primera de la lista ya ordenada.
    const selectedProgramId = profile?.selected_program_id ?? null
    const currentId =
      selectedProgramId && latestByProgram.has(selectedProgramId)
        ? selectedProgramId
        : (rows[0]?.programId ?? null)

    return c.json(
      {
        ok: true as const,
        programs: rows.map((r) => ({ ...r, current: r.programId === currentId })),
      },
      200,
    )
  },
)

// --- elegir cuál mirar -------------------------------------------------------

playerPrograms.openapi(
  createRoute({
    method: 'put',
    path: '/player/programs/selected',
    summary: 'Elegir cuál de mis rutinas quiero mirar',
    request: {
      body: {
        content: {
          // null = volver al default, que es "la última asignada".
          'application/json': { schema: z.object({ programId: z.string().uuid().nullable() }) },
        },
      },
    },
    responses: {
      200: {
        description: 'Elegida',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { programId } = c.req.valid('json')
    const db = c.get('db')

    if (programId) {
      // No se puede elegir una rutina que no te fue asignada. RLS ya negaría la
      // lectura del árbol, pero sin esto la fila quedaría apuntando a algo que el
      // jugador no puede leer y "Mi semana" degradaría en silencio en vez de
      // decirle que esa rutina no es suya.
      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('position_id')
        .eq('id', actor.id)
        .maybeSingle()
      if (profileError) throw new Error(profileError.message)

      const candidates = await candidateAssignmentsFor(db, {
        id: actor.id,
        positionId: profile?.position_id ?? null,
      })
      if (!candidates.some((a) => a.programId === programId)) {
        return c.json({ ok: false as const, error: 'Esa rutina no te fue asignada' }, 404)
      }
    }

    const { data, error } = await db
      .from('profiles')
      .update({ selected_program_id: programId })
      .eq('id', actor.id)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)
