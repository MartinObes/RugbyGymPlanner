import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { normName } from '@coachlab/core/domain/normName'

/**
 * Seed del catálogo de ejercicios y del admin.
 *
 * Este es el ÚNICO lugar del repo donde aparece la service_role key, y está
 * permitido porque corre a mano, fuera de cualquier request (CLAUDE.md §4).
 * Necesita saltear RLS: crea el catálogo global y promueve a ADMIN, dos cosas
 * que ninguna política le deja hacer a un usuario.
 */

// ⚠ NECESITA PROTOTIPO: CLAUDE.md §1 menciona ~48 ejercicios que salen de
// NEXTJS_APP_CONTEXT.md, todavía ausente del repo. Esta es una base de 24 que
// cubre los patrones de fuerza usados en rugby. Cuando aparezca el archivo,
// reemplazar la lista entera: el resto del seed no cambia porque es idempotente
// por normalized_name.
const EXERCISES = [
  { name: 'Sentadilla', category: 'Tren inferior' },
  { name: 'Sentadilla Frontal', category: 'Tren inferior' },
  { name: 'Sentadilla Búlgara', category: 'Tren inferior' },
  { name: 'Peso Muerto', category: 'Tren inferior' },
  { name: 'Peso Muerto Rumano', category: 'Tren inferior' },
  { name: 'Hip Thrust', category: 'Tren inferior' },
  { name: 'Prensa', category: 'Tren inferior' },
  { name: 'Zancadas', category: 'Tren inferior' },
  { name: 'Curl Femoral', category: 'Tren inferior' },
  { name: 'Extensión de Cuádriceps', category: 'Tren inferior' },
  { name: 'Press Banca', category: 'Tren superior' },
  { name: 'Press Banca Inclinado', category: 'Tren superior' },
  { name: 'Press Militar', category: 'Tren superior' },
  { name: 'Remo con Barra', category: 'Tren superior' },
  { name: 'Remo con Mancuerna', category: 'Tren superior' },
  { name: 'Dominadas', category: 'Tren superior' },
  { name: 'Fondos', category: 'Tren superior' },
  { name: 'Curl de Bíceps', category: 'Tren superior' },
  { name: 'Extensión de Tríceps', category: 'Tren superior' },
  { name: 'Cargada de Potencia', category: 'Potencia' },
  { name: 'Arranque', category: 'Potencia' },
  { name: 'Salto al Cajón', category: 'Potencia' },
  { name: 'Plancha', category: 'Core' },
  { name: 'Rueda Abdominal', category: 'Core' },
]

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

async function main() {
  if (process.env.SEED_TARGET === 'production') {
    throw new Error('Seed bloqueado: no se corre contra production.')
  }

  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Idempotente: normalized_name es UNIQUE, así que reejecutar actualiza en vez
  // de duplicar. Es la misma clave que usa el matching de 1RM.
  const rows = EXERCISES.map((exercise) => ({
    name: exercise.name,
    normalized_name: normName(exercise.name),
    category: exercise.category,
  }))

  const { error: exercisesError } = await supabase
    .from('exercises')
    .upsert(rows, { onConflict: 'normalized_name' })

  if (exercisesError) throw exercisesError
  console.log(`✓ ${rows.length} ejercicios`)

  const email = requireEnv('SEED_ADMIN_EMAIL')
  const password = requireEnv('SEED_ADMIN_PASSWORD')

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: 'Admin' },
  })

  if (createError) {
    // Ya existía: el seed tiene que poder correrse dos veces.
    if (!/already|exists|registered/i.test(createError.message)) throw createError
    console.log(`✓ admin ${email} ya existía`)
  } else {
    console.log(`✓ admin ${email} creado`)
  }

  // El trigger handle_new_user lo dio de alta como PLAYER a propósito: ADMIN no
  // se autoregistra (CLAUDE.md §4). Promoverlo es justamente lo que solo puede
  // hacer este script.
  const userId = created?.user?.id ?? (await findUserIdByEmail(supabase, email))
  if (!userId) throw new Error(`No se encontró el usuario ${email} después de crearlo`)

  const { error: promoteError } = await supabase
    .from('profiles')
    .update({ role: 'ADMIN' })
    .eq('id', userId)

  if (promoteError) throw promoteError
  console.log(`✓ admin ${email} con rol ADMIN`)
}

async function findUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string | undefined> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
