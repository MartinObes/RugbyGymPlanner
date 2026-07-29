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
 *   $env:VERIFY_SIGNUP_EMAIL="tumail+coachlab@gmail.com"   # opcional: cubre el signUp anónimo real
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
const createdPrograms = []
const createdGroups = []
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

  // --- RPC de validación del invite code (anon, para el form de registro) ---
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: coachName } = await anonClient.rpc('coach_name_for_invite', {
    code: coach.invite_code.toLowerCase(),
  })
  check('coach_name_for_invite resuelve el código (case-insensitive)', coachName === 'Coach Test', `-> ${coachName}`)

  const { data: noCoach } = await anonClient.rpc('coach_name_for_invite', { code: 'ZZZZZZ' })
  check('coach_name_for_invite devuelve null con código inexistente', noCoach === null, `-> ${noCoach}`)

  // --- signUp real (el camino que usa la app, no el admin API) ----------------
  // Supabase Auth (hosted) valida el dominio del email en el signUp anónimo y
  // rechaza TLDs reservados como .local — el admin API no. Por eso este check
  // necesita un buzón real: VERIFY_SIGNUP_EMAIL (ideal con plus-addressing,
  // ej. tumail+coachlab@gmail.com, así cualquier mail de confirmación te llega
  // a vos). El usuario se borra al final igual que los demás.
  const signupEmail = process.env.VERIFY_SIGNUP_EMAIL
  if (!signupEmail) {
    check(
      'signUp real: SALTEADO — seteá VERIFY_SIGNUP_EMAIL para cubrirlo',
      true,
      'ej: $env:VERIFY_SIGNUP_EMAIL="tumail+coachlab@gmail.com"',
    )
  } else {
    const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
      email: signupEmail,
      password: 'TestPassw0rd!x9',
      options: { data: { name: 'SignUp Test', role: 'PLAYER', invite_code: coach.invite_code } },
    })
    if (signUpData?.user) created.push(signUpData.user.id)
    check('signUp anónimo funciona', !signUpError, signUpError?.message ?? '')

    if (!signUpError) {
      check(
        'signUp devuelve sesión (confirmación de email apagada)',
        !!signUpData.session,
        signUpData.session ? '' : 'ENCENDIDA: apagar en Authentication → Sign In / Providers → Email',
      )
      const { data: signedUpProfile } = await admin
        .from('profiles')
        .select('coach_id')
        .eq('id', signUpData.user?.id ?? '')
        .single()
      check('el signUp real vinculó al coach por invite code', signedUpProfile?.coach_id === coachId)
    }
  }

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

  // --- 0005/0009: oráculos y RPCs revocados de anon ------------------------
  //
  // OJO con la forma del revoke: `revoke ... from anon` NO alcanza, porque el
  // grant implícito de PUBLIC sobrevive y el chequeo de privilegios cae ahí.
  // Hace falta `from public, anon`. Se detecta porque el error es P0001 ("No
  // autenticado", o sea que la función corrió) en vez de 42501.
  // OJO: cliente NUEVO, no `anonClient`. Ese hizo signUp más arriba y, con la
  // confirmación de email apagada, signUp DEVUELVE SESIÓN: supabase-js la guarda
  // en la instancia y el cliente deja de ser anónimo. Reutilizarlo hacía que
  // estos checks midieran a un usuario autenticado y dieran falsos negativos.
  const trulyAnon = createClient(URL, ANON, { auth: { persistSession: false } })

  const revokedFromAnon = async (label, fn, args = {}) => {
    const { error } = await trulyAnon.rpc(fn, args)
    const denied = /permission denied/i.test(error?.message ?? '')
    check(label, denied, denied ? '' : `ALCANZABLE -> ${error?.code}: ${error?.message ?? 'sin error'}`)
  }

  await revokedFromAnon('anon no puede invocar generate_invite_code', 'generate_invite_code')
  await revokedFromAnon('anon no puede invocar redeem_invite_code', 'redeem_invite_code', { code: 'ZZZZZZ' })
  await revokedFromAnon('anon no puede invocar release_player', 'release_player', {
    player_id: '00000000-0000-0000-0000-000000000000',
  })
  await revokedFromAnon('anon no puede invocar ensure_exercise', 'ensure_exercise', {
    p_name: 'Test Anon',
    p_normalized: 'test anon',
  })

  // ...pero coach_name_for_invite SÍ tiene que seguir alcanzable: la usa el
  // formulario de registro antes de que exista la sesión.
  const { error: nameStillOpen } = await trulyAnon.rpc('coach_name_for_invite', { code: 'ZZZZZZ' })
  check('coach_name_for_invite sigue disponible para anon (registro)', !nameStillOpen, nameStillOpen?.message ?? '')

  const { error: oracleErr } = await asPlayer.rpc('program_reaches_me', {
    target: '00000000-0000-0000-0000-000000000000',
  })
  check('authenticated no usa program_reaches_me como oráculo', !!oracleErr, oracleErr ? '' : 'PUDO — falta el revoke')

  // --- 0005: autovínculo bloqueado y canje por RPC (M-1) ------------------
  const looseId = await makeUser('loose.test@coachlab.local', { name: 'Loose Test', role: 'PLAYER' })
  const asLoose = createClient(URL, ANON, { auth: { persistSession: false } })
  await asLoose.auth.signInWithPassword({
    email: 'loose.test@coachlab.local',
    password: 'TestPassw0rd!x9',
  })

  const { error: selfLink } = await asLoose.from('profiles').update({ coach_id: coachId }).eq('id', looseId)
  check('un jugador sin coach NO se autovincula por PATCH', !!selfLink, selfLink?.message?.slice(0, 60) ?? 'PUDO — agujero M-1')

  const { error: badRedeem } = await asLoose.rpc('redeem_invite_code', { code: 'ZZZZZZ' })
  check('redeem_invite_code rechaza un código inexistente', !!badRedeem)

  const { error: redeemErr } = await asLoose.rpc('redeem_invite_code', { code: coach.invite_code })
  check('redeem_invite_code vincula con un código válido', !redeemErr, redeemErr?.message ?? '')

  const { data: loose } = await admin.from('profiles').select('coach_id').eq('id', looseId).single()
  check('el canje dejó el coach_id correcto', loose?.coach_id === coachId)

  const { error: reRedeem } = await asLoose.rpc('redeem_invite_code', { code: coach.invite_code })
  check('un jugador ya vinculado no puede volver a canjear', !!reRedeem)

  // --- 0005: email inmutable desde la tabla (L-2) -------------------------
  const { error: mailErr } = await asPlayer.from('profiles').update({ email: 'otro@x.com' }).eq('id', playerId)
  check('el guard frena el cambio de email', !!mailErr, mailErr?.message?.slice(0, 60) ?? 'PUDO — divergencia con auth.users')

  // --- 0005: sin lectura cross-tenant de programas (H-1) ------------------
  const coach2Id = await makeUser('coach2.test@coachlab.local', { name: 'Coach Dos', role: 'COACH' })

  const { data: foreignProgram } = await admin
    .from('programs')
    .insert({ coach_id: coach2Id, name: 'Programa ajeno' })
    .select('id')
    .single()
  createdPrograms.push(foreignProgram.id)
  await admin.from('program_assignments').insert({ program_id: foreignProgram.id, system_group_id: 'backs' })
  await admin.from('profiles').update({ position_id: 'wing' }).eq('id', playerId)

  const { data: crossRead } = await asPlayer.from('programs').select('id').eq('id', foreignProgram.id)
  check(
    'H-1: un jugador NO ve programas de un coach ajeno aunque el assignment matchee',
    (crossRead ?? []).length === 0,
    `ve ${crossRead?.length ?? 0}`,
  )

  const { data: ownProgram } = await admin
    .from('programs')
    .insert({ coach_id: coachId, name: 'Programa propio' })
    .select('id')
    .single()
  createdPrograms.push(ownProgram.id)
  await admin.from('program_assignments').insert({ program_id: ownProgram.id, system_group_id: 'backs' })

  const { data: ownRead } = await asPlayer.from('programs').select('id').eq('id', ownProgram.id)
  check('...pero sí ve el de SU coach cuando el assignment lo alcanza', (ownRead ?? []).length === 1)

  // --- 0005: los otros revokes de helpers (L-1) ---------------------------
  for (const fn of ['my_position_id', 'my_system_group_id']) {
    const { error } = await asPlayer.rpc(fn)
    check(`authenticated no puede invocar ${fn}`, !!error, error ? '' : 'PUDO — falta el revoke')
  }
  const { error: ownsErr } = await asPlayer.rpc('owns_program', { target: ownProgram.id })
  check('authenticated no puede invocar owns_program', !!ownsErr, ownsErr ? '' : 'PUDO — falta el revoke')

  // --- 0006: destinos de assignment acotados al coach del programa (L-1) --
  const { error: foreignPlayerTarget } = await admin
    .from('program_assignments')
    .insert({ program_id: foreignProgram.id, player_id: playerId })
  check(
    'un assignment no puede apuntar a un jugador de otro coach',
    !!foreignPlayerTarget,
    foreignPlayerTarget?.message?.slice(0, 60) ?? 'PUDO — falta el trigger de 0006',
  )

  const { data: foreignGroup } = await admin
    .from('position_groups')
    .insert({ coach_id: coach2Id, name: 'Grupo ajeno' })
    .select('id')
    .single()
  createdGroups.push(foreignGroup.id)
  const { error: foreignGroupTarget } = await admin
    .from('program_assignments')
    .insert({ program_id: ownProgram.id, position_group_id: foreignGroup.id })
  check(
    'un assignment no puede apuntar a un grupo de otro coach',
    !!foreignGroupTarget,
    foreignGroupTarget?.message?.slice(0, 60) ?? 'PUDO — falta el trigger de 0006',
  )

  const { data: ownAssignment, error: ownPlayerTarget } = await admin
    .from('program_assignments')
    .insert({ program_id: ownProgram.id, player_id: playerId })
    .select('id')
    .single()
  check('...pero sí a un jugador del plantel propio', !ownPlayerTarget, ownPlayerTarget?.message ?? '')

  // 0009: el trigger no se evade con UPDATE (declara insert OR update). sneakyId
  // es un jugador sin coach, así que no está en el plantel de nadie.
  const { error: repointErr } = await admin
    .from('program_assignments')
    .update({ player_id: sneakyId })
    .eq('id', ownAssignment.id)
  check(
    'el trigger tampoco deja repuntar un assignment existente a un destino ajeno',
    !!repointErr,
    repointErr?.message?.slice(0, 45) ?? 'PUDO — el UPDATE evade el trigger',
  )

  // 0009: editar SOLO la prioridad de un assignment no dispara la validación de
  // destinos. Antes quedaba inmodificable si el destino se había vuelto inválido.
  const { error: priorityErr } = await admin
    .from('program_assignments')
    .update({ priority: 5 })
    .eq('id', ownAssignment.id)
  check('se puede editar la prioridad sin revalidar destinos', !priorityErr, priorityErr?.message ?? '')

  // 0009: el trigger también corta desde una sesión de COACH real, no solo con
  // service_role (que es el camino de las migraciones, no el de producción).
  const asCoachEarly = createClient(URL, ANON, { auth: { persistSession: false } })
  await asCoachEarly.auth.signInWithPassword({
    email: 'coach.test@coachlab.local',
    password: 'TestPassw0rd!x9',
  })
  const { error: coachForeignTarget } = await asCoachEarly
    .from('program_assignments')
    .insert({ program_id: ownProgram.id, player_id: sneakyId })
  check(
    'con sesión de coach real, un destino fuera del plantel también falla',
    !!coachForeignTarget,
    coachForeignTarget?.message?.slice(0, 45) ?? 'PUDO — agujero',
  )

  // 0009: un PLAYER no puede desvincular a nadie, ni a sí mismo ni a un compañero.
  const { error: playerRelease } = await asPlayer.rpc('release_player', { player_id: playerId })
  check('un jugador no puede invocar release_player sobre sí mismo', !!playerRelease)
  const { error: playerReleaseOther } = await asPlayer.rpc('release_player', { player_id: sneakyId })
  check('un jugador no puede desvincular a un compañero', !!playerReleaseOther)

  // --- 0006: desvinculación (M-1 de la re-auditoría) ----------------------
  // Va AL FINAL: deja al jugador sin coach y eso cambia lo que ve por RLS.
  const { error: selfUnlink } = await asPlayer.from('profiles').update({ coach_id: null }).eq('id', playerId)
  check(
    'un jugador NO puede auto-desvincularse',
    !!selfUnlink,
    selfUnlink?.message?.slice(0, 60) ?? 'PUDO — el trigger tiene que frenarlo',
  )

  const asCoach = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: coachSignIn } = await asCoach.auth.signInWithPassword({
    email: 'coach.test@coachlab.local',
    password: 'TestPassw0rd!x9',
  })
  check('el coach puede iniciar sesión', !coachSignIn, coachSignIn?.message ?? '')

  // Un PATCH directo NO alcanza, ni siquiera para el coach dueño; por eso la
  // operación va por RPC (migración 0007). Lo frenan dos cosas a la vez: el
  // WITH CHECK de profiles_update (la fila nueva ya no cumple ninguna rama) y,
  // si se ampliara esa política, la regla de que la fila resultante tiene que
  // seguir visible bajo profiles_select (CLAUDE.md §3). Este check falla si se
  // cae cualquiera de las dos.
  const { error: patchUnlink } = await asCoach.from('profiles').update({ coach_id: null }).eq('id', playerId)
  check(
    'ni el coach puede desvincular con un PATCH directo (va por RPC)',
    !!patchUnlink,
    patchUnlink?.message?.slice(0, 45) ?? 'PUDO — 0007 dejó el WITH CHECK abierto',
  )

  const asCoach2 = createClient(URL, ANON, { auth: { persistSession: false } })
  await asCoach2.auth.signInWithPassword({
    email: 'coach2.test@coachlab.local',
    password: 'TestPassw0rd!x9',
  })
  const { error: foreignRelease } = await asCoach2.rpc('release_player', { player_id: playerId })
  check(
    'un coach no puede liberar al jugador de otro coach',
    !!foreignRelease,
    foreignRelease?.message?.slice(0, 45) ?? 'PUDO — agujero',
  )

  // Regalar un jugador propio a otro coach: falla por WITH CHECK + trigger.
  const { error: giveAway } = await asCoach.from('profiles').update({ coach_id: coach2Id }).eq('id', playerId)
  const { data: afterGive } = await admin.from('profiles').select('coach_id').eq('id', playerId).single()
  check(
    'un coach no puede regalar su jugador a otro coach',
    !!giveAway && afterGive?.coach_id === coachId,
    giveAway?.message?.slice(0, 45) ?? 'PUDO — agujero',
  )

  const { error: releaseErr } = await asCoach.rpc('release_player', { player_id: playerId })
  check('release_player: el coach SÍ saca a un jugador de su plantel', !releaseErr, releaseErr?.message ?? '')

  const { data: unlinked } = await admin.from('profiles').select('coach_id').eq('id', playerId).single()
  check('la desvinculación dejó coach_id en null', unlinked?.coach_id === null, `coach_id=${unlinked?.coach_id}`)

  // 0009: la desvinculación se lleva los assignments directos. Sin esto quedaban
  // filas apuntando a un jugador que en cuanto canjea otro código pasa a ser de
  // otro coach — y encima inmodificables por el trigger de destinos.
  const { data: orphanAssignments } = await admin
    .from('program_assignments')
    .select('id')
    .eq('player_id', playerId)
  check(
    'la desvinculación limpió los assignments directos del jugador',
    (orphanAssignments ?? []).length === 0,
    `quedaron ${orphanAssignments?.length ?? 0}`,
  )

  const { error: reRelease } = await asCoach.rpc('release_player', { player_id: playerId })
  check('release_player falla si el jugador ya no es del plantel', !!reRelease)

  // Reclamar a un jugador sin coach con un PATCH. OJO: acá RLS filtra la fila
  // por USING, y un UPDATE que no matchea filas devuelve ÉXITO con 0 filas
  // afectadas. Por eso el check mira el DATO, no el error: "sin error" no
  // significa "funcionó".
  await asCoach.from('profiles').update({ coach_id: coachId }).eq('id', playerId)
  const { data: afterClaim } = await admin.from('profiles').select('coach_id').eq('id', playerId).single()
  check(
    'un coach no puede reclamar a un jugador sin coach con un PATCH',
    afterClaim?.coach_id === null,
    `coach_id=${afterClaim?.coach_id}`,
  )
} finally {
  // Programas y grupos primero: los dos referencian profiles.
  if (createdPrograms.length > 0) {
    await admin.from('programs').delete().in('id', createdPrograms)
  }
  if (createdGroups.length > 0) {
    await admin.from('position_groups').delete().in('id', createdGroups)
  }
  for (const id of created) await admin.auth.admin.deleteUser(id)
  console.log(
    `\nlimpieza: ${createdPrograms.length} programas, ${createdGroups.length} grupos y ${created.length} usuarios de prueba borrados`,
  )
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks OK`)
  process.exit(failed.length ? 1 : 0)
}
