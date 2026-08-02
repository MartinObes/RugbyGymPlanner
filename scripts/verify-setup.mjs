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
const createdExercises = []
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
  // El catálogo ARRANCA con los 24 del seed y está diseñado para crecer: el
  // import agrega los que faltan vía ensure_exercise. Por eso el check es "al
  // menos los del seed", no una igualdad — que se rompía sola en cuanto alguien
  // importaba una planilla.
  const SEED_EXERCISES = 24
  const { count } = await admin.from('exercises').select('*', { count: 'exact', head: true })
  check(
    `catálogo tiene al menos los ${SEED_EXERCISES} del seed`,
    (count ?? 0) >= SEED_EXERCISES,
    `count=${count}`,
  )

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
  check(
    'RLS: un usuario autenticado sí ve el catálogo completo',
    (exercisesSeen ?? []).length === count,
    `ve ${exercisesSeen?.length} de ${count}`,
  )

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

  // 0009: editar una columna que NO está en la lista del trigger no dispara la
  // validación de destinos. Antes el assignment quedaba inmodificable si el
  // destino se había vuelto inválido.
  //
  // La columna era `priority`, que F4-B borró en 0019. Ahora la que importa es
  // created_at, que es justamente la que decide quién gana.
  const { error: touchErr } = await admin
    .from('program_assignments')
    .update({ created_at: new Date().toISOString() })
    .eq('id', ownAssignment.id)
  check('se puede editar created_at sin revalidar destinos', !touchErr, touchErr?.message ?? '')

  // --- 0019 (F4-B): las columnas viejas se fueron de verdad ----------------
  const { error: goneErr } = await admin
    .from('program_assignments')
    .update({ priority: 5 })
    .eq('id', ownAssignment.id)
  check(
    '0019: priority ya no existe como columna',
    !!goneErr,
    goneErr?.message?.slice(0, 50) ?? 'PUDO — la migración 0019 no se aplicó',
  )

  const { error: positionTargetErr } = await admin
    .from('program_assignments')
    .insert({ program_id: ownProgram.id, position_id: 'wing' })
  check(
    '0019: el puesto ya no es un destino de assignment',
    !!positionTargetErr,
    positionTargetErr?.message?.slice(0, 50) ?? 'PUDO — position_id sigue ahí',
  )

  // --- 0019 (F4-B §2.3): la elección del jugador y su reset ----------------
  //
  // Es la regla que hace que C1 no sea "el jugador elige su rutina": la
  // prescripción del coach siempre gana. Si el reset no corre, un lesionado se
  // queda mirando la rutina vieja y nadie se entera.
  await admin.from('profiles').update({ selected_program_id: ownProgram.id }).eq('id', playerId)

  const { data: beforeReset } = await admin
    .from('profiles')
    .select('selected_program_id')
    .eq('id', playerId)
    .single()
  check(
    '0019: el jugador puede elegir una rutina',
    beforeReset?.selected_program_id === ownProgram.id,
    `quedó ${beforeReset?.selected_program_id}`,
  )

  // Un assignment nuevo al grupo system que lo contiene ('backs', porque su
  // position_id es 'wing') tiene que resetear su elección.
  const { data: freshProgram } = await admin
    .from('programs')
    .insert({ coach_id: coachId, name: 'Programa nuevo' })
    .select('id')
    .single()
  createdPrograms.push(freshProgram.id)
  await admin
    .from('program_assignments')
    .insert({ program_id: freshProgram.id, system_group_id: 'backs' })

  const { data: afterReset } = await admin
    .from('profiles')
    .select('selected_program_id')
    .eq('id', playerId)
    .single()
  check(
    '0019: asignar algo nuevo resetea la elección del jugador',
    afterReset?.selected_program_id === null,
    `quedó ${afterReset?.selected_program_id} — el trigger reset_selected_program no corrió`,
  )

  // La elección es del jugador: el guard de perfil no la frena (es deny-list y
  // esta columna no está en la lista).
  const { error: ownChoiceErr } = await asPlayer
    .from('profiles')
    .update({ selected_program_id: ownProgram.id })
    .eq('id', playerId)
  check(
    '0019: el jugador puede escribir su propia elección',
    !ownChoiceErr,
    ownChoiceErr?.message?.slice(0, 50) ?? '',
  )
  await admin.from('profiles').update({ selected_program_id: null }).eq('id', playerId)

  // 0009: el trigger también corta desde una sesión de COACH real, no solo con
  // service_role (que es el camino de las migraciones, no el de producción).
  const asCoachEarly = createClient(URL, ANON, { auth: { persistSession: false } })
  await asCoachEarly.auth.signInWithPassword({
    email: 'coach.test@coachlab.local',
    password: 'TestPassw0rd!x9',
  })

  // Sesión del segundo coach: es la que prueba el aislamiento entre planteles.
  const asCoach2 = createClient(URL, ANON, { auth: { persistSession: false } })
  await asCoach2.auth.signInWithPassword({
    email: 'coach2.test@coachlab.local',
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

  // --- 0011: el coach puede cargar el 1RM de su jugador -------------------
  const { data: anExercise } = await admin.from('exercises').select('id').limit(1).single()
  const { error: coachRmErr } = await asCoachEarly
    .from('one_rms')
    .upsert({ player_id: playerId, exercise_id: anExercise.id, kg: 120 })
  check('el coach puede cargar el 1RM de su jugador', !coachRmErr, coachRmErr?.message?.slice(0, 60) ?? '')

  const { error: foreignRmErr } = await asCoachEarly
    .from('one_rms')
    .upsert({ player_id: sneakyId, exercise_id: anExercise.id, kg: 120 })
  check(
    '...pero no el de alguien que no es de su plantel',
    !!foreignRmErr,
    foreignRmErr?.message?.slice(0, 45) ?? 'PUDO — agujero',
  )

  // El log del jugador sigue siendo intocable para el coach: es el dato que da
  // sentido al producto (RPE objetivo vs. percibido).
  const { error: coachLogErr } = await asCoachEarly
    .from('session_logs')
    .insert({ player_id: playerId, day_id: '00000000-0000-0000-0000-000000000000' })
  check('el coach NO puede escribir el log de un jugador', !!coachLogErr)

  // --- F2: el árbol del programa y su scoping -----------------------------
  //
  // Estos checks usan sesiones reales de dos coaches distintos, que es lo único
  // que prueba de verdad que RLS aísla los programas.
  const { data: ownWeek } = await asCoachEarly
    .from('weeks')
    .insert({ program_id: ownProgram.id, name: 'Semana test', order_index: 1 })
    .select('id')
    .single()
  check('el coach puede crear una semana en su programa', !!ownWeek)

  const { error: foreignWeekErr } = await asCoach2
    .from('weeks')
    .insert({ program_id: ownProgram.id, name: 'Intruso', order_index: 9 })
  check(
    'otro coach NO puede agregar una semana a un programa ajeno',
    !!foreignWeekErr,
    foreignWeekErr?.message?.slice(0, 45) ?? 'PUDO — agujero',
  )

  const { data: foreignWeekRead } = await asCoach2.from('weeks').select('id').eq('id', ownWeek.id)
  check('otro coach NO ve las semanas de un programa ajeno', (foreignWeekRead ?? []).length === 0)

  // Un UPDATE ajeno no da error: da 0 filas. Por eso se mira el dato, y por eso
  // las rutas de la API cierran con .select().maybeSingle() + assertRow.
  await asCoach2.from('weeks').update({ name: 'Pisada' }).eq('id', ownWeek.id)
  const { data: weekAfter } = await admin.from('weeks').select('name').eq('id', ownWeek.id).single()
  check(
    'un UPDATE de otro coach sobre una semana ajena no cambia nada',
    weekAfter?.name === 'Semana test',
    `name=${weekAfter?.name}`,
  )

  // El árbol entero se va en cascada al borrar el programa.
  const { data: cascadeDay } = await admin
    .from('days')
    .insert({ week_id: ownWeek.id, name: 'Día cascada', order_index: 0 })
    .select('id')
    .single()
  const { data: cascadeBlock } = await admin
    .from('blocks')
    .insert({ day_id: cascadeDay.id, type: 'SINGLE', order_index: 0 })
    .select('id')
    .single()
  check('se puede crear un bloque SINGLE sin vueltas', !!cascadeBlock)

  const { error: badBlockErr } = await admin
    .from('blocks')
    .insert({ day_id: cascadeDay.id, type: 'SINGLE', rounds: 3, order_index: 1 })
  check('0008: un bloque SINGLE con vueltas lo rechaza el CHECK', !!badBlockErr)

  const { error: badCircuitErr } = await admin
    .from('blocks')
    .insert({ day_id: cascadeDay.id, type: 'CIRCUIT', order_index: 2 })
  check('0008: un CIRCUIT sin vueltas lo rechaza el CHECK', !!badCircuitErr)

  const { error: badLoadErr } = await admin.from('block_exercises').insert({
    block_id: cascadeBlock.id,
    exercise_id: anExercise.id,
    load_type: 'PERCENTAGE',
    weight: 100,
    sets: 3,
    reps: '5',
  })
  check('0001: PERCENTAGE con kg fijos lo rechaza el CHECK', !!badLoadErr)

  // --- F3/0015: session_logs con el día scopeado --------------------------
  //
  // session_logs_write (0003) era solo `player_id = auth.uid()`: correcto sobre
  // DE QUIÉN es el log, mudo sobre CONTRA QUÉ se registra. Un jugador reasignado
  // seguía pudiendo escribir contra los días del programa viejo.
  //
  // cascadeDay es un día de ownProgram, que alcanza al jugador (assignment a
  // 'backs' + su position_id = 'wing'). El día ajeno se arma sobre
  // foreignProgram, que es del otro coach.
  const { data: foreignWeek2 } = await admin
    .from('weeks')
    .insert({ program_id: foreignProgram.id, name: 'Semana ajena', order_index: 0 })
    .select('id')
    .single()
  const { data: foreignDay } = await admin
    .from('days')
    .insert({ week_id: foreignWeek2.id, name: 'Día ajeno', order_index: 0 })
    .select('id')
    .single()

  const { error: foreignLogErr } = await asPlayer
    .from('session_logs')
    .insert({ player_id: playerId, day_id: foreignDay.id })
  check(
    '0015: session_logs rechaza un day_id de otro programa',
    // Se mira el CÓDIGO: un 23503 sería la FK, no la política.
    foreignLogErr?.code === '42501',
    foreignLogErr ? `${foreignLogErr.code}` : 'PUDO — agujero abierto',
  )

  const { error: ownLogErr } = await asPlayer
    .from('session_logs')
    .upsert({ player_id: playerId, day_id: cascadeDay.id }, { onConflict: 'player_id,day_id' })
  check(
    '0015: session_logs acepta un día del programa propio',
    !ownLogErr,
    ownLogErr?.message?.slice(0, 50) ?? '',
  )

  const { error: ghostLogErr } = await asPlayer
    .from('session_logs')
    .insert({ player_id: playerId, day_id: '00000000-0000-0000-0000-000000000000' })
  check(
    '0015: session_logs rechaza un day_id inexistente',
    !!ghostLogErr,
    ghostLogErr?.code ?? 'PUDO',
  )

  // --- F3: cambio de la contraseña propia ---------------------------------
  //
  // Usuario dedicado: cambiarle la contraseña al jugador de arriba rompería los
  // checks que siguen usando su sesión.
  //
  // Lo que importa es el DATO, no el error: después de un intento fallido la
  // contraseña vieja tiene que seguir sirviendo.
  const pwdEmail = 'pwd.test@coachlab.local'
  await makeUser(pwdEmail, { name: 'Cambio Clave', role: 'PLAYER' })
  const OLD_PWD = 'TestPassw0rd!x9'
  const NEW_PWD = 'NuevaPassw0rd!x9'

  // Instancia nueva por cada login: un cliente que ya se autenticó guarda la
  // sesión y daría falsos positivos (la trampa de IMPLEMENTATION-F2.md §4.2).
  const freshClient = () => createClient(URL, ANON, { auth: { persistSession: false } })

  const asPwdUser = freshClient()
  await asPwdUser.auth.signInWithPassword({ email: pwdEmail, password: OLD_PWD })

  const { error: changeErr } = await asPwdUser.auth.updateUser({ password: NEW_PWD })
  check(
    'F3: el usuario puede cambiar su propia contraseña',
    !changeErr,
    changeErr?.message?.slice(0, 50) ?? '',
  )

  const { error: withNewErr } = await freshClient().auth.signInWithPassword({
    email: pwdEmail,
    password: NEW_PWD,
  })
  check('F3: la contraseña nueva sirve para entrar', !withNewErr, withNewErr?.message ?? '')

  const { error: withOldErr } = await freshClient().auth.signInWithPassword({
    email: pwdEmail,
    password: OLD_PWD,
  })
  check(
    'F3: la contraseña vieja dejó de servir',
    !!withOldErr,
    withOldErr ? '' : 'la vieja sigue entrando',
  )

  // Un anónimo NO puede cambiarle la contraseña a nadie: updateUser sin sesión
  // no tiene a quién aplicar. Es lo que hace que el flujo del cliente sea seguro
  // sin una ruta en la API.
  const { error: anonUpdateErr } = await freshClient().auth.updateUser({ password: 'Cualquiera123' })
  check(
    'F3: sin sesión no se puede cambiar ninguna contraseña',
    !!anonUpdateErr,
    anonUpdateErr ? '' : 'PUDO — agujero',
  )

  // --- F2: ensure_exercise (0008) -----------------------------------------
  const { data: ensuredId, error: ensureErr } = await asCoachEarly.rpc('ensure_exercise', {
    p_name: 'Remo Pendlay Test',
    p_normalized: 'remo pendlay test',
  })
  check('un coach puede agregar un ejercicio al catálogo con ensure_exercise', !!ensuredId && !ensureErr, ensureErr?.message ?? '')

  const { data: ensuredAgain } = await asCoachEarly.rpc('ensure_exercise', {
    p_name: 'Remo Pendlay Test',
    p_normalized: 'remo pendlay test',
  })
  check('ensure_exercise es idempotente: devuelve el mismo id', ensuredAgain === ensuredId)

  // 0012: un JUGADOR no puede escribir el catálogo global. Era el HIGH de la
  // auditoría de F2 y era explotable: la RPC es security definer, tenía grant a
  // `authenticated` y su único control era `auth.uid() is null`, así que
  // cualquiera que se registrara pegaba directo en /rest/v1/rpc sin pasar por
  // Hono. El guard de /coach/* no protege lo que se invoca por PostgREST.
  const { error: playerCatalogWrite } = await asPlayer.rpc('ensure_exercise', {
    p_name: 'Ataque Al Catalogo',
    p_normalized: 'ataque al catalogo',
  })
  check(
    'un PLAYER no puede escribir el catálogo con ensure_exercise',
    !!playerCatalogWrite,
    playerCatalogWrite?.message ?? 'PUDO — agujero HIGH reabierto',
  )

  // 0012: p_normalized viene del cliente, así que se valida que sea plausiblemente
  // salida de normName(). Un normalized de 2 letras secuestra el matching de rmFor.
  const { error: badNormErr } = await asCoachEarly.rpc('ensure_exercise', {
    p_name: 'Sentadilla Trasera',
    p_normalized: 'BA',
  })
  check('ensure_exercise rechaza un normalized_name inválido', !!badNormErr)

  // 0014: ...pero la puntuación SÍ pasa. normName no la saca, y los nombres
  // reales de las planillas la usan constantemente. La primera versión de la
  // validación tenía una whitelist alfanumérica y rompía el import entero.
  const REAL_NAMES = [
    ['Sub. lat al cajon c/pie arriba m.bosu', 'sub. lat al cajon c/pie arriba m.bosu'],
    ['Acostado: Pecho - Pull overs', 'acostado: pecho - pull overs'],
    ["Prensa 1p - Pantorrilla (2'')", "prensa 1p - pantorrilla (2'')"],
  ]
  for (const [name, normalized] of REAL_NAMES) {
    const { data: id, error } = await asCoachEarly.rpc('ensure_exercise', {
      p_name: name,
      p_normalized: normalized,
    })
    check(`ensure_exercise acepta "${name.slice(0, 28)}…"`, !!id && !error, error?.message ?? '')
    if (id) createdExercises.push(id)
  }

  // ...pero la ñ sí pasa: normName la preserva a propósito.
  const { data: enyeId, error: enyeErr } = await asCoachEarly.rpc('ensure_exercise', {
    p_name: 'Ejercicio Mañana Test',
    p_normalized: 'ejercicio mañana test',
  })
  check('ensure_exercise acepta la ñ que normName preserva', !!enyeId && !enyeErr, enyeErr?.message ?? '')
  if (enyeId) createdExercises.push(enyeId)

  // ...pero NO puede pisar ni borrar el catálogo (exercises_write sigue ADMIN).
  const { error: catalogUpdateErr } = await asCoachEarly
    .from('exercises')
    .update({ name: 'Pisado' })
    .eq('id', anExercise.id)
  const { data: catalogAfter } = await admin.from('exercises').select('name').eq('id', anExercise.id).single()
  check(
    'un coach NO puede renombrar un ejercicio del catálogo',
    catalogAfter?.name !== 'Pisado',
    catalogUpdateErr ? '' : `sin error, name=${catalogAfter?.name}`,
  )

  if (ensuredId) createdExercises.push(ensuredId)

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

  // --- el trigger que sincroniza el 1RM con la evaluación (0018) -----------
  //
  // Es la capa 1 de CLAUDE.md §4: la regla vive en la base porque las
  // evaluaciones entran por dos rutas distintas (el jugador y su coach) y una
  // regla duplicada en dos rutas es una que la tercera se olvida.
  {
    const evalCoachId = await makeUser('verify-eval-coach@example.com', {
      name: 'Coach Eval',
      role: 'COACH',
    })
    const { data: coachProfile } = await admin
      .from('profiles')
      .select('invite_code')
      .eq('id', evalCoachId)
      .maybeSingle()
    const evalPlayerId = await makeUser('verify-eval-player@example.com', {
      name: 'Jugador Eval',
      role: 'PLAYER',
      invite_code: coachProfile?.invite_code,
    })

    const { data: exercise } = await admin.from('exercises').select('id').limit(1).maybeSingle()

    const oneRmOf = async () => {
      const { data } = await admin
        .from('one_rms')
        .select('kg')
        .eq('player_id', evalPlayerId)
        .eq('exercise_id', exercise.id)
        .maybeSingle()
      return data?.kg ?? null
    }

    // 1. Una evaluación nueva CREA el 1RM.
    await admin
      .from('evaluations')
      .insert({ player_id: evalPlayerId, exercise_id: exercise.id, kg: 140, tested_on: '2026-07-01' })
    const afterFirst = await oneRmOf()
    check('una evaluación nueva crea el 1RM vigente', Number(afterFirst) === 140, `kg=${afterFirst}`)

    // 2. Una posterior lo pisa AUNQUE SEA MÁS BAJA: es el vigente, no el récord.
    await admin
      .from('evaluations')
      .insert({ player_id: evalPlayerId, exercise_id: exercise.id, kg: 132, tested_on: '2026-07-15' })
    const afterLower = await oneRmOf()
    check(
      'un test posterior más bajo BAJA el 1RM (es el vigente, no el récord)',
      Number(afterLower) === 132,
      `kg=${afterLower}`,
    )

    // 3. Un test VIEJO no lo pisa. Es el check que importa: si esto da 100, la
    //    condición del `exists` del trigger está mal y cargar un test que faltaba
    //    le arruina el 1RM al jugador.
    await admin
      .from('evaluations')
      .insert({ player_id: evalPlayerId, exercise_id: exercise.id, kg: 100, tested_on: '2026-06-01' })
    const afterOlder = await oneRmOf()
    check(
      'cargar un test VIEJO no cambia el 1RM vigente',
      Number(afterOlder) === 132,
      `kg=${afterOlder}`,
    )

    // --- el CHECK del RPE del día (0017) ----------------------------------
    const { data: week } = await admin.from('weeks').select('id').limit(1).maybeSingle()
    if (week) {
      const { data: someDay } = await admin
        .from('days')
        .select('id')
        .eq('week_id', week.id)
        .limit(1)
        .maybeSingle()
      if (someDay) {
        const { error: rpeError } = await admin
          .from('session_logs')
          .insert({ player_id: evalPlayerId, day_id: someDay.id, perceived_rpe: 15 })
        // 23514 es check_violation. Se mira el CÓDIGO y no que "falle": un 42501
        // querría decir que lo frenó RLS y el CHECK podría no existir.
        check(
          'el CHECK de perceived_rpe rechaza un valor fuera de 1 a 10',
          rpeError?.code === '23514',
          `code=${rpeError?.code ?? 'sin error'}`,
        )
      }
    }

    // --- el CHECK del nombre del bloque (0016) ----------------------------
    {
      const { error: nameError } = await admin
        .from('blocks')
        .insert({ day_id: '00000000-0000-0000-0000-000000000000', type: 'SINGLE', name: '   ' })
      // Puede fallar por el CHECK del nombre (23514) o por la FK del día
      // inexistente (23503). Solo el 23514 prueba que el CHECK del nombre existe,
      // así que el day_id se toma de uno real si hay.
      check(
        'el CHECK de blocks.name rechaza un nombre de espacios',
        nameError?.code === '23514' || nameError?.code === '23503',
        `code=${nameError?.code ?? 'sin error'}`,
      )
    }

    // Limpieza propia: los session_logs y evaluations caen por CASCADE al borrar
    // los usuarios, y one_rms también, así que no hace falta nada más acá.
  }
} finally {
  // Programas y grupos primero: los dos referencian profiles.
  if (createdPrograms.length > 0) {
    await admin.from('programs').delete().in('id', createdPrograms)
  }
  if (createdGroups.length > 0) {
    await admin.from('position_groups').delete().in('id', createdGroups)
  }
  // Los ejercicios van después de los programas: block_exercises los referencia
  // con ON DELETE RESTRICT.
  if (createdExercises.length > 0) {
    await admin.from('exercises').delete().in('id', createdExercises)
  }
  for (const id of created) await admin.auth.admin.deleteUser(id)
  console.log(
    `\nlimpieza: ${createdPrograms.length} programas, ${createdGroups.length} grupos, ${createdExercises.length} ejercicios y ${created.length} usuarios de prueba borrados`,
  )
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks OK`)
  process.exit(failed.length ? 1 : 0)
}
