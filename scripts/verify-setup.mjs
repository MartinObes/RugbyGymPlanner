/**
 * Verificación del setup contra un proyecto de Supabase real.
 *
 * Cubre lo que ningún unit test puede: el trigger de alta, la generación del
 * invite code, el guard anti-escalación y el scoping de RLS por rol. Son la
 * capa 1 de CLAUDE.md §4, y una política mal escrita no la agarra ningún test
 * de código — hace falta una base y usuarios de verdad.
 *
 * Crea tres usuarios de prueba y los borra al terminar, incluso si algo falla.
 * NO corre contra producción sin pensarlo: usa la secret key.
 *
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
 *   $env:SUPABASE_ANON_KEY="sb_publishable_..."
 *   pnpm verify:setup
 *
 * Asume que el seed ya corrió (espera 24 ejercicios y el admin).
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_ANON_KEY

const admin = createClient(URL, SECRET, { auth: { persistSession: false } })

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '  OK  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const created = []
async function makeUser(email, meta) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'TestPassw0rd!x9',
    email_confirm: true,
    user_metadata: meta,
  })
  if (error) throw new Error(`${email}: ${error.message}`)
  created.push(data.user.id)
  return data.user.id
}

try {
  // --- catálogo -----------------------------------------------------------
  const { count } = await admin.from('exercises').select('*', { count: 'exact', head: true })
  check('catálogo tiene 24 ejercicios', count === 24, `count=${count}`)

  const { data: sb } = await admin
    .from('exercises')
    .select('name, normalized_name')
    .eq('normalized_name', 'sentadilla bulgara')
    .single()
  check('normName se aplicó al seed', sb?.name === 'Sentadilla Búlgara', `"${sb?.name}" -> "${sb?.normalized_name}"`)

  // --- admin --------------------------------------------------------------
  const { data: adminProfile } = await admin
    .from('profiles')
    .select('role, name, coach_id, invite_code')
    .eq('email', 'admin@coachlab.local')
    .single()
  check('el trigger creó el perfil del admin', !!adminProfile)
  check('el seed lo promovió a ADMIN', adminProfile?.role === 'ADMIN', `role=${adminProfile?.role}`)

  // --- trigger de alta: COACH --------------------------------------------
  const coachId = await makeUser('coach.test@coachlab.local', { name: 'Coach Test', role: 'COACH' })
  const { data: coach } = await admin
    .from('profiles')
    .select('role, name, invite_code, coach_id')
    .eq('id', coachId)
    .single()
  check('COACH se crea con rol COACH', coach?.role === 'COACH', `role=${coach?.role}`)
  check('COACH recibe invite_code de 6 chars', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(coach?.invite_code ?? ''), `code=${coach?.invite_code}`)
  check('COACH no tiene coach_id', coach?.coach_id === null)

  // --- trigger de alta: PLAYER con invite code ---------------------------
  const playerId = await makeUser('player.test@coachlab.local', {
    name: 'Player Test',
    role: 'PLAYER',
    invite_code: coach.invite_code,
  })
  const { data: player } = await admin.from('profiles').select('role, coach_id, invite_code').eq('id', playerId).single()
  check('PLAYER se vinculó al coach por invite code', player?.coach_id === coachId, `coach_id=${player?.coach_id}`)
  check('PLAYER no recibe invite_code', player?.invite_code === null)

  // --- ADMIN no se autoregistra ------------------------------------------
  const sneakyId = await makeUser('sneaky.test@coachlab.local', { name: 'Sneaky', role: 'ADMIN' })
  const { data: sneaky } = await admin.from('profiles').select('role').eq('id', sneakyId).single()
  check('signup con role=ADMIN cae a PLAYER', sneaky?.role === 'PLAYER', `role=${sneaky?.role}`)

  // --- guard: escalación de privilegios con sesión real ------------------
  const asPlayer = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: signInError } = await asPlayer.auth.signInWithPassword({
    email: 'player.test@coachlab.local',
    password: 'TestPassw0rd!x9',
  })
  check('el jugador puede iniciar sesión', !signInError, signInError?.message ?? '')

  const { error: escalate } = await asPlayer.from('profiles').update({ role: 'ADMIN' }).eq('id', playerId)
  check('el guard frena role=ADMIN', !!escalate, escalate?.message?.slice(0, 60) ?? 'NO FRENÓ — agujero de seguridad')

  const { error: nameOk } = await asPlayer.from('profiles').update({ name: 'Nuevo Nombre' }).eq('id', playerId)
  check('pero sí puede cambiar su nombre', !nameOk, nameOk?.message ?? '')

  // --- RLS: el jugador no ve al resto del mundo --------------------------
  const { data: visible } = await asPlayer.from('profiles').select('email')
  const emails = (visible ?? []).map((r) => r.email).sort()
  check(
    'RLS: el jugador solo se ve a sí mismo y a su coach',
    emails.length === 2 && emails.includes('player.test@coachlab.local') && emails.includes('coach.test@coachlab.local'),
    `ve: ${emails.join(', ')}`,
  )

  const { data: exercisesSeen } = await asPlayer.from('exercises').select('id')
  check('RLS: un usuario autenticado sí ve el catálogo', (exercisesSeen ?? []).length === 24, `ve ${exercisesSeen?.length} ejercicios`)
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id)
  console.log(`\nlimpieza: ${created.length} usuarios de prueba borrados`)
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks OK`)
  process.exit(failed.length ? 1 : 0)
}
