import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { SYSTEM_GROUPS } from '@coachlab/core/domain/positions'
import { positionGroupSchema } from '@coachlab/core/validators/group'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from './_scope'

const GroupIdParam = z.object({
  groupId: z.string().uuid().openapi({ param: { name: 'groupId', in: 'path' } }),
})

const Group = z
  .object({
    id: z.string(),
    name: z.string(),
    positionIds: z.array(z.string()),
    /** Los system son constantes de código, no filas: no se editan ni se borran. */
    isSystem: z.boolean(),
  })
  .openapi('Group')

const GroupsResponse = z
  .object({ ok: z.literal(true), groups: z.array(Group) })
  .openapi('GroupsResponse')

const GroupResponse = z.object({ ok: z.literal(true), group: Group }).openapi('GroupResponse')

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

type GroupRow = {
  id: string
  name: string
  position_group_positions: { position_id: string }[] | null
}

export const groups = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- listar: los 2 system (constantes) + los custom del coach ----------------

groups.openapi(
  createRoute({
    method: 'get',
    path: '/coach/groups',
    summary: 'Grupos del sistema y grupos custom del coach',
    responses: {
      200: { description: 'Grupos', content: { 'application/json': { schema: GroupsResponse } } },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!

    // Forwards y Backs NO son filas (CLAUDE.md §2): salen de las constantes.
    const systemGroups = SYSTEM_GROUPS.map((g) => ({
      id: g.id,
      name: g.name,
      positionIds: [...g.positionIds],
      isSystem: true,
    }))

    const { data, error } = await c
      .get('db')
      .from('position_groups')
      .select('id, name, position_group_positions(position_id)')
      .eq('coach_id', actor.id)
      .order('name')
    if (error) throw new Error(error.message)

    const customGroups = ((data ?? []) as GroupRow[]).map((g) => ({
      id: g.id,
      name: g.name,
      positionIds: (g.position_group_positions ?? []).map((p) => p.position_id),
      isSystem: false,
    }))

    return c.json({ ok: true as const, groups: [...systemGroups, ...customGroups] }, 200)
  },
)

// --- crear -------------------------------------------------------------------

groups.openapi(
  createRoute({
    method: 'post',
    path: '/coach/groups',
    summary: 'Crear un grupo custom',
    request: { body: { content: { 'application/json': { schema: positionGroupSchema } } } },
    responses: {
      200: { description: 'Creado', content: { 'application/json': { schema: GroupResponse } } },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')
    const db = c.get('db')

    const { data, error } = await db
      .from('position_groups')
      .insert({ coach_id: actor.id, name: input.name })
      .select('id, name')
      .maybeSingle()

    const group = assertRow(data, error)

    const { error: positionsError } = await db
      .from('position_group_positions')
      .insert(input.positionIds.map((positionId) => ({ group_id: group.id, position_id: positionId })))
    if (positionsError) throw new Error(positionsError.message)

    return c.json(
      {
        ok: true as const,
        group: { id: group.id as string, name: group.name as string, positionIds: input.positionIds, isSystem: false },
      },
      200,
    )
  },
)

// --- editar ------------------------------------------------------------------

groups.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/groups/{groupId}',
    summary: 'Renombrar un grupo custom y reemplazar sus puestos',
    request: {
      params: GroupIdParam,
      body: { content: { 'application/json': { schema: positionGroupSchema } } },
    },
    responses: {
      200: { description: 'Actualizado', content: { 'application/json': { schema: GroupResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { groupId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    const { data, error } = await db
      .from('position_groups')
      .update({ name: input.name })
      .eq('id', groupId)
      .eq('coach_id', actor.id)
      .select('id, name')
      .maybeSingle()

    const group = assertRow(data, error)

    // Reemplazar los puestos: primero AGREGAR los nuevos, después borrar los que
    // sobran. El orden importa y no es cosmético — con delete-y-después-insert,
    // si el insert falla el grupo queda SIN PUESTOS, y entonces todo assignment
    // que lo apunte deja de alcanzar a nadie sin ningún error visible: un cambio
    // silencioso de a quién le llega un programa.
    //
    // `ignoreDuplicates` porque la PK es (group_id, position_id) y los que ya
    // estaban vuelven a venir en la lista.
    const { error: insertError } = await db
      .from('position_group_positions')
      .upsert(
        input.positionIds.map((positionId) => ({ group_id: groupId, position_id: positionId })),
        { onConflict: 'group_id,position_id', ignoreDuplicates: true },
      )
    if (insertError) throw new Error(insertError.message)

    const { error: deleteError } = await db
      .from('position_group_positions')
      .delete()
      .eq('group_id', groupId)
      .not('position_id', 'in', `(${input.positionIds.join(',')})`)
    if (deleteError) throw new Error(deleteError.message)

    return c.json(
      {
        ok: true as const,
        group: { id: group.id as string, name: group.name as string, positionIds: input.positionIds, isSystem: false },
      },
      200,
    )
  },
)

// --- borrar ------------------------------------------------------------------

groups.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/groups/{groupId}',
    summary: 'Borrar un grupo custom',
    request: { params: GroupIdParam },
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
    const { groupId } = c.req.valid('param')

    // Los assignments que apuntaban a este grupo se van por CASCADE (0001).
    const { data, error } = await c
      .get('db')
      .from('position_groups')
      .delete()
      .eq('id', groupId)
      .eq('coach_id', actor.id)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)
