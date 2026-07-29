import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { oneRmSchema, playerProfileSchema } from '@coachlab/core/validators/player'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow, assertRpcOk } from './_scope'

const PlayerIdParam = z.object({
  playerId: z.string().uuid().openapi({ param: { name: 'playerId', in: 'path' } }),
})

const CoachPlayer = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    positionId: z.string().nullable(),
    heightCm: z.number().nullable(),
    weightKg: z.number().nullable(),
  })
  .openapi('CoachPlayer')

const OneRm = z
  .object({
    exerciseId: z.string().uuid(),
    exerciseName: z.string(),
    kg: z.number(),
    updatedAt: z.string(),
  })
  .openapi('OneRm')

const CoachPlayersResponse = z
  .object({ ok: z.literal(true), players: z.array(CoachPlayer) })
  .openapi('CoachPlayersResponse')

const CoachPlayerResponse = z
  .object({ ok: z.literal(true), player: CoachPlayer, oneRms: z.array(OneRm) })
  .openapi('CoachPlayerResponse')

const OkResponse = z.object({ ok: z.literal(true) }).openapi('OkResponse')

const errors = {
  401: {
    description: 'Sin sesión o rol equivocado',
    content: { 'application/json': { schema: ErrorResponse } },
  },
  404: {
    description: 'No existe o no es de tu plantel',
    content: { 'application/json': { schema: ErrorResponse } },
  },
}

const PLAYER_COLUMNS = 'id, name, email, position_id, height_cm, weight_kg'

type PlayerRow = {
  id: string
  name: string
  email: string
  position_id: string | null
  height_cm: number | null
  weight_kg: number | null
}

function toPlayer(row: PlayerRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    positionId: row.position_id,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
  }
}

export const players = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- listar el plantel -------------------------------------------------------

players.openapi(
  createRoute({
    method: 'get',
    path: '/coach/players',
    summary: 'El plantel del coach de la sesión',
    responses: {
      200: {
        description: 'Plantel',
        content: { 'application/json': { schema: CoachPlayersResponse } },
      },
      401: errors[401],
    },
  }),
  async (c) => {
    // El guard del prefijo /coach/* (app.ts) ya corrió: actor no es null acá.
    const actor = c.get('actor')!

    // Capa 4: scoping explícito por coach_id del actor. RLS (capa 1) filtra
    // igual aunque este .eq() no estuviera — por eso un ADMIN acá ve [] y no el
    // plantel de otro: no ES coach de nadie.
    const { data, error } = await c
      .get('db')
      .from('profiles')
      .select(PLAYER_COLUMNS)
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .order('name')

    if (error) throw new Error(error.message)

    return c.json({ ok: true as const, players: (data as PlayerRow[]).map(toPlayer) }, 200)
  },
)

// --- ficha del jugador -------------------------------------------------------

players.openapi(
  createRoute({
    method: 'get',
    path: '/coach/players/{playerId}',
    summary: 'Ficha de un jugador del plantel, con sus 1RM',
    request: { params: PlayerIdParam },
    responses: {
      200: {
        description: 'Ficha',
        content: { 'application/json': { schema: CoachPlayerResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId } = c.req.valid('param')
    const db = c.get('db')

    const { data, error } = await db
      .from('profiles')
      .select(PLAYER_COLUMNS)
      .eq('id', playerId)
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .maybeSingle()

    const player = assertRow(data as PlayerRow | null, error)

    // Select anidado: los 1RM con el nombre del ejercicio en un solo request.
    const { data: rms, error: rmsError } = await db
      .from('one_rms')
      .select('exercise_id, kg, updated_at, exercises(name)')
      .eq('player_id', playerId)
    if (rmsError) throw new Error(rmsError.message)

    // `exercises` viene como objeto en runtime (es una relación many-to-one),
    // pero el cliente de este paquete no está tipado con Database —los tipos
    // generados viven en packages/web— así que TS lo infiere como array. Se
    // normalizan las dos formas en vez de castear: un cast acá mentiría.
    type Named = { name?: string | null } | null | undefined
    const nameOf = (value: Named | Named[]): string => {
      const one = Array.isArray(value) ? value[0] : value
      return one?.name ?? '—'
    }

    const oneRms = (rms ?? []).map((r) => ({
      exerciseId: r.exercise_id as string,
      exerciseName: nameOf(r.exercises as Named | Named[]),
      kg: r.kg as number,
      updatedAt: r.updated_at as string,
    }))
    oneRms.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))

    return c.json({ ok: true as const, player: toPlayer(player), oneRms }, 200)
  },
)

// --- editar puesto y medidas -------------------------------------------------

players.openapi(
  createRoute({
    method: 'patch',
    path: '/coach/players/{playerId}',
    summary: 'Puesto, altura y peso de un jugador',
    request: {
      params: PlayerIdParam,
      body: { content: { 'application/json': { schema: playerProfileSchema } } },
    },
    responses: {
      200: {
        description: 'Actualizado',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true), player: CoachPlayer }) } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId } = c.req.valid('param')
    const input = c.req.valid('json')

    const { data, error } = await c
      .get('db')
      .from('profiles')
      .update({
        // Campo por campo desde el objeto validado. NUNCA `...input`: el perfil
        // vive en la misma tabla que el rol (CLAUDE.md §4).
        //
        // `?? null` a propósito: la ficha es autoritativa, así que un campo que
        // no vino se limpia. Mandar undefined omitiría la columna.
        position_id: input.positionId ?? null,
        height_cm: input.heightCm ?? null,
        weight_kg: input.weightKg ?? null,
      })
      .eq('id', playerId)
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .select(PLAYER_COLUMNS)
      .maybeSingle()

    return c.json({ ok: true as const, player: toPlayer(assertRow(data as PlayerRow | null, error)) }, 200)
  },
)

// --- 1RM ---------------------------------------------------------------------

players.openapi(
  createRoute({
    method: 'put',
    path: '/coach/players/{playerId}/one-rm',
    summary: 'Cargar o actualizar el 1RM de un ejercicio',
    request: {
      params: PlayerIdParam,
      body: { content: { 'application/json': { schema: oneRmSchema } } },
    },
    responses: {
      200: { description: 'Guardado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    // El coach puede escribir el 1RM de su jugador desde la migración 0011
    // (one_rms_write incluye is_my_player). Esta comprobación previa existe para
    // dar un 404 con mensaje en vez del error de RLS, que a esta altura sería
    // un 500 poco informativo.
    const { data: owned, error: ownedError } = await db
      .from('profiles')
      .select('id')
      .eq('id', playerId)
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .maybeSingle()
    assertRow(owned, ownedError)

    const { data, error } = await db
      .from('one_rms')
      .upsert(
        { player_id: playerId, exercise_id: input.exerciseId, kg: input.kg, updated_at: new Date().toISOString() },
        { onConflict: 'player_id,exercise_id' },
      )
      .select('player_id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

players.openapi(
  createRoute({
    method: 'delete',
    path: '/coach/players/{playerId}/one-rm/{exerciseId}',
    summary: 'Borrar el 1RM de un ejercicio',
    request: {
      params: PlayerIdParam.extend({
        exerciseId: z.string().uuid().openapi({ param: { name: 'exerciseId', in: 'path' } }),
      }),
    },
    responses: {
      200: { description: 'Borrado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId, exerciseId } = c.req.valid('param')
    const db = c.get('db')

    // Mismo pre-chequeo que el PUT: hoy RLS ya alcanzaría (one_rms_write incluye
    // is_my_player desde 0011), pero esa política fue `player_id = auth.uid()`
    // hasta hace dos migraciones. Si alguien la vuelve a angostar, sin esto la
    // ruta se convierte en un delete cross-tenant silencioso.
    const { data: owned, error: ownedError } = await db
      .from('profiles')
      .select('id')
      .eq('id', playerId)
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .maybeSingle()
    assertRow(owned, ownedError)

    const { data, error } = await db
      .from('one_rms')
      .delete()
      .eq('player_id', playerId)
      .eq('exercise_id', exerciseId)
      .select('player_id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)

// --- sacar del plantel -------------------------------------------------------

players.openapi(
  createRoute({
    method: 'post',
    path: '/coach/players/{playerId}/release',
    summary: 'Sacar un jugador del plantel (no borra su cuenta)',
    request: { params: PlayerIdParam },
    responses: {
      200: { description: 'Desvinculado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const { playerId } = c.req.valid('param')

    // Un PATCH a profiles.coach_id no sirve: la fila resultante deja de estar
    // visible bajo profiles_select y Postgres tira 42501 (CLAUDE.md §3). La RPC
    // release_player (0007/0009/0010) corre como definer, valida que el jugador
    // sea del coach y limpia sus assignments directos.
    const { error } = await c.get('db').rpc('release_player', { player_id: playerId })
    assertRpcOk(error)

    return c.json({ ok: true as const }, 200)
  },
)
