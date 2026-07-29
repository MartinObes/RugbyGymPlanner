import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { oneRmSchema, playerProfileSchema } from '@coachlab/core/validators/player'
import { firstOf } from '../../access/embedded'
import type { AuthVariables } from '../../middleware/auth'
import { assertRow, assertRpcOk } from '../coach/_scope'
import { ErrorResponse } from '../schemas'

const ExerciseIdParam = z.object({
  exerciseId: z.string().uuid().openapi({ param: { name: 'exerciseId', in: 'path' } }),
})

const OneRm = z
  .object({
    exerciseId: z.string(),
    exerciseName: z.string(),
    kg: z.number(),
    updatedAt: z.string(),
  })
  .openapi('PlayerOneRm')

const Profile = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    positionId: z.string().nullable(),
    heightCm: z.number().nullable(),
    weightKg: z.number().nullable(),
    coachName: z.string().nullable(),
  })
  .openapi('PlayerProfile')

const ProfileResponse = z
  .object({ ok: z.literal(true), profile: Profile, oneRms: z.array(OneRm) })
  .openapi('PlayerProfileResponse')

const OkResponse = z.object({ ok: z.literal(true) }).openapi('PlayerProfileOkResponse')

const redeemSchema = z.object({ code: z.string().trim().min(1, 'Ingresá el código') })

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

type ProfileRow = {
  id: string
  email: string
  name: string
  position_id: string | null
  height_cm: number | null
  weight_kg: number | null
  coach_id: string | null
}

export const playerProfile = new OpenAPIHono<{ Variables: AuthVariables }>()

/**
 * El perfil y los 1RM, que devuelven las cuatro rutas de abajo.
 *
 * Recibe `db` y `playerId` en vez del contexto de Hono: así no depende de los
 * genéricos de OpenAPIHono, que son incómodos de nombrar y no aportan nada acá.
 */
async function readProfile(db: SupabaseClient, playerId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('id, email, name, position_id, height_cm, weight_kg, coach_id')
    .eq('id', playerId)
    .maybeSingle()
  const profile = assertRow(data as ProfileRow | null, error)

  // RLS (profiles_select) deja al jugador leer la fila de SU coach: id = my_coach_id().
  let coachName: string | null = null
  if (profile.coach_id) {
    const { data: coach } = await db
      .from('profiles')
      .select('name')
      .eq('id', profile.coach_id)
      .maybeSingle()
    coachName = (coach?.name as string | undefined) ?? null
  }

  const { data: rms, error: rmsError } = await db
    .from('one_rms')
    .select('exercise_id, kg, updated_at, exercises(name)')
    .eq('player_id', playerId)
  if (rmsError) throw new Error(rmsError.message)

  const oneRms = (rms ?? []).map((r) => ({
    exerciseId: r.exercise_id as string,
    exerciseName: firstOf(r.exercises as { name: string } | { name: string }[] | null)?.name ?? '—',
    kg: r.kg as number,
    updatedAt: r.updated_at as string,
  }))
  oneRms.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))

  return {
    profile: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      positionId: profile.position_id,
      heightCm: profile.height_cm,
      weightKg: profile.weight_kg,
      coachName,
    },
    oneRms,
  }
}

// --- ver y editar el perfil --------------------------------------------------

playerProfile.openapi(
  createRoute({
    method: 'get',
    path: '/player/profile',
    summary: 'Mi perfil y mis 1RM',
    responses: {
      200: { description: 'Perfil', content: { 'application/json': { schema: ProfileResponse } } },
      ...errors,
    },
  }),
  async (c) =>
    c.json({ ok: true as const, ...(await readProfile(c.get('db'), c.get('actor')!.id)) }, 200),
)

playerProfile.openapi(
  createRoute({
    method: 'patch',
    path: '/player/profile',
    summary: 'Editar mi nombre, puesto y medidas',
    request: { body: { content: { 'application/json': { schema: playerProfileSchema } } } },
    responses: {
      200: {
        description: 'Actualizado',
        content: { 'application/json': { schema: ProfileResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')
    const db = c.get('db')

    // Campo por campo desde el objeto ya validado, nunca un spread del body:
    // profiles vive en la misma tabla que el rol. Zod ya descartó lo que no es
    // del schema y guard_profile_changes lo frena en la base (tres capas, §4).
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.positionId !== undefined) patch.position_id = input.positionId ?? null
    if (input.heightCm !== undefined) patch.height_cm = input.heightCm ?? null
    if (input.weightKg !== undefined) patch.weight_kg = input.weightKg ?? null

    if (Object.keys(patch).length > 0) {
      const { data, error } = await db
        .from('profiles')
        .update(patch)
        .eq('id', actor.id)
        .select('id')
        .maybeSingle()
      assertRow(data, error)
    }

    return c.json({ ok: true as const, ...(await readProfile(db, actor.id)) }, 200)
  },
)

// --- 1RM ---------------------------------------------------------------------

playerProfile.openapi(
  createRoute({
    method: 'put',
    path: '/player/one-rms',
    summary: 'Cargar o actualizar uno de mis 1RM',
    request: { body: { content: { 'application/json': { schema: oneRmSchema } } } },
    responses: {
      200: { description: 'Guardado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')

    // El jugador ELIGE del catálogo; no lo escribe. ensure_exercise (0012/0014)
    // rechaza a PLAYER a propósito: "un jugador no tiene por qué tocar el
    // catálogo global". El exerciseId viene del typeahead de /catalog/exercises,
    // y si no existe la FK lo rechaza y assertRow lo traduce a 404.
    const { data, error } = await c
      .get('db')
      .from('one_rms')
      .upsert(
        { player_id: actor.id, exercise_id: input.exerciseId, kg: input.kg },
        { onConflict: 'player_id,exercise_id' },
      )
      .select('exercise_id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

playerProfile.openapi(
  createRoute({
    method: 'delete',
    path: '/player/one-rms/{exerciseId}',
    summary: 'Borrar uno de mis 1RM',
    request: { params: ExerciseIdParam },
    responses: {
      200: { description: 'Borrado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { exerciseId } = c.req.valid('param')

    const { data, error } = await c
      .get('db')
      .from('one_rms')
      .delete()
      .eq('player_id', actor.id)
      .eq('exercise_id', exerciseId)
      .select('exercise_id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

// --- canjear el código del entrenador ----------------------------------------

playerProfile.openapi(
  createRoute({
    method: 'post',
    path: '/player/redeem-invite',
    summary: 'Vincularme a un entrenador con su código',
    request: { body: { content: { 'application/json': { schema: redeemSchema } } } },
    responses: {
      200: {
        description: 'Vinculado',
        content: { 'application/json': { schema: ProfileResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const { code } = c.req.valid('json')
    const db = c.get('db')

    // El coach_id NUNCA llega por un PATCH: guard_profile_changes solo lo acepta
    // con el flag transaction-local que setea esta RPC (migración 0005, escrita
    // para esta pantalla).
    const { error } = await db.rpc('redeem_invite_code', { code })
    assertRpcOk(error)

    return c.json({ ok: true as const, ...(await readProfile(db, c.get('actor')!.id)) }, 200)
  },
)
