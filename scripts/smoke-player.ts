/**
 * Smoke del panel del jugador contra un Supabase real.
 *
 * Existe porque hay una clase de bug que NADA más agarra: los strings de select
 * anidados de PostgREST. No los ve el typecheck (son strings), no los ven los
 * tests de `app.request()` (nunca llegan a PostgREST) ni verify-setup (habla con
 * la base directo, sin pasar por la capa de acceso). En F2 un embed ambiguo entre
 * programs y weeks devolvía 500 en CUALQUIER request real y pasó los tres
 * niveles — ver docs/IMPLEMENTATION-F2.md §4.3.
 *
 * Ejercita la capa de acceso con la sesión de un jugador de verdad, que es el
 * mismo camino que usa la app en producción (cliente con su JWT, RLS aplicada).
 *
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
 *   $env:SUPABASE_ANON_KEY="sb_publishable_..."
 *   pnpm smoke:player
 *
 * Crea su fixture y lo borra al terminar, incluso si algo falla.
 * NO correr contra producción sin pensarlo: usa la secret key.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertOwnedDay, ensureSessionLog } from '../packages/api/src/access/playerDay'
import { playerWeekFor } from '../packages/api/src/access/playerWeek'
import { evaluationsFor, trendsFrom } from '../packages/api/src/access/evaluations'
import { playerDashboardFor } from '../packages/api/src/access/playerDashboard'

const URL = process.env.SUPABASE_URL
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.SUPABASE_ANON_KEY

if (!URL || !SECRET || !ANON) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY')
  process.exit(1)
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false } })

const results: { name: string; pass: boolean }[] = []
const check = (name: string, pass: boolean, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? '  OK  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const PASSWORD = 'SmokePassw0rd!x9'
const createdUsers: string[] = []
const createdPrograms: string[] = []

async function makeUser(email: string, meta: Record<string, unknown>): Promise<string> {
  // Si quedó de una corrida anterior que murió, se borra primero.
  const { data: existing } = await admin.auth.admin.listUsers()
  const stale = existing?.users.find((u) => u.email === email)
  if (stale) await admin.auth.admin.deleteUser(stale.id)

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: meta,
  })
  if (error) throw new Error(`${email}: ${error.message}`)
  createdUsers.push(data.user.id)
  return data.user.id
}

async function main() {
  // --- fixture -------------------------------------------------------------
  const coachId = await makeUser('smoke.coach@coachlab.local', {
    name: 'Smoke Coach',
    role: 'COACH',
  })
  const playerId = await makeUser('smoke.player@coachlab.local', {
    name: 'Smoke Player',
    role: 'PLAYER',
  })

  // El trigger no vincula sin invite code: se hace con la secret key.
  // position_id = 'wing' lo mete en el grupo system 'backs'.
  await admin
    .from('profiles')
    .update({ coach_id: coachId, position_id: 'wing' })
    .eq('id', playerId)

  // Dos ejercicios del catálogo que ya existe (no se contamina el catálogo global).
  const { data: catalog } = await admin
    .from('exercises')
    .select('id, name, normalized_name')
    .order('name')
    .limit(3)
  if (!catalog || catalog.length < 3) throw new Error('El catálogo no tiene 3 ejercicios; corré pnpm seed')
  const [pctExercise, labelExercise, noneExercise] = catalog

  const { data: program } = await admin
    .from('programs')
    .insert({ coach_id: coachId, name: 'Programa smoke' })
    .select('id')
    .single()
  if (!program) throw new Error('No se pudo crear el programa')
  createdPrograms.push(program.id)

  // Dos semanas: la 1 se registra y la 2 es la vigente, para que "última vez"
  // tenga de dónde salir.
  const weekIds: string[] = []
  const dayIds: string[] = []
  for (const [index, name] of ['Semana 1', 'Semana 2'].entries()) {
    const { data: week } = await admin
      .from('weeks')
      .insert({ program_id: program.id, name, order_index: index })
      .select('id')
      .single()
    if (!week) throw new Error('No se pudo crear la semana')
    weekIds.push(week.id)

    const { data: day } = await admin
      .from('days')
      .insert({ week_id: week.id, name: 'Día 1', order_index: 0 })
      .select('id')
      .single()
    if (!day) throw new Error('No se pudo crear el día')
    dayIds.push(day.id)

    // Bloque SINGLE con una carga en % y una con etiqueta.
    const { data: single } = await admin
      .from('blocks')
      // Con nombre (migración 0016) para que el check del árbol pruebe algo.
      .insert({ day_id: day.id, type: 'SINGLE', name: 'Fuerza tren inferior', order_index: 0 })
      .select('id')
      .single()
    await admin.from('block_exercises').insert([
      {
        block_id: single!.id,
        exercise_id: pctExercise!.id,
        load_type: 'PERCENTAGE',
        percentage: 80,
        sets: 4,
        reps: '5',
        target_rpe: 8,
        order_index: 0,
      },
      {
        block_id: single!.id,
        exercise_id: labelExercise!.id,
        load_type: 'LABEL',
        load_label: 'p.corp',
        sets: 3,
        reps: 'AMRAP',
        order_index: 1,
      },
    ])

    // Bloque CIRCUIT, para verificar que las vueltas llegan.
    const { data: circuit } = await admin
      .from('blocks')
      .insert({ day_id: day.id, type: 'CIRCUIT', rounds: 3, order_index: 1 })
      .select('id')
      .single()
    await admin.from('block_exercises').insert({
      block_id: circuit!.id,
      exercise_id: noneExercise!.id,
      load_type: 'NONE',
      sets: 1,
      reps: "40''",
      order_index: 0,
    })
  }

  // La semana vigente es la 2.
  await admin.from('programs').update({ current_week_id: weekIds[1] }).eq('id', program.id)
  await admin.from('program_assignments').insert({ program_id: program.id, player_id: playerId })

  // 1RM de 140 → 80% = 112 kg exactos.
  await admin
    .from('one_rms')
    .upsert(
      { player_id: playerId, exercise_id: pctExercise!.id, kg: 140 },
      { onConflict: 'player_id,exercise_id' },
    )

  // --- sesión real del jugador --------------------------------------------
  const asPlayer: SupabaseClient = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { error: loginErr } = await asPlayer.auth.signInWithPassword({
    email: 'smoke.player@coachlab.local',
    password: PASSWORD,
  })
  check('el jugador puede iniciar sesión', !loginErr, loginErr?.message ?? '')

  const player = { id: playerId, positionId: 'wing' }

  // --- lo que ve el jugador ------------------------------------------------
  const week = await playerWeekFor(asPlayer, player)
  check('playerWeekFor resuelve la semana vigente sin error de PostgREST', week !== null)
  if (!week) throw new Error('playerWeekFor devolvió null: el assignment no alcanzó al jugador')

  check('trae el nombre del programa', week.programName === 'Programa smoke', week.programName)
  check('la semana vigente es la que fijó current_week_id', week.weekName === 'Semana 2', week.weekName)
  check('la semana tiene un día', week.days.length === 1, `days=${week.days.length}`)

  const day = week.days[0]!
  check('el día trae sus dos bloques', day.blocks.length === 2, `blocks=${day.blocks.length}`)
  check('los bloques vienen en orden: SINGLE primero', day.blocks[0]!.type === 'SINGLE', day.blocks[0]!.type)
  check('el CIRCUIT conserva sus vueltas', day.blocks[1]!.rounds === 3, `rounds=${day.blocks[1]!.rounds}`)
  check('cuenta los 3 ejercicios del día', day.totalCount === 3, `total=${day.totalCount}`)

  const pctRow = day.blocks[0]!.exercises[0]!
  check(
    'EL CÁLCULO: 80% con 1RM 140 → "80% → 112 kg"',
    pctRow.load.kind === 'percentage' && pctRow.load.label === '80% → 112 kg',
    pctRow.load.label,
  )
  check('el RPE objetivo llega', pctRow.targetRpe === 8, `targetRpe=${pctRow.targetRpe}`)

  const labelRow = day.blocks[0]!.exercises[1]!
  check(
    'LABEL se muestra crudo, no como "Sin peso"',
    labelRow.load.kind === 'label' && labelRow.load.label === 'p.corp',
    labelRow.load.label,
  )

  const noneRow = day.blocks[1]!.exercises[0]!
  check('NONE queda sin carga', noneRow.load.kind === 'none', noneRow.load.label)

  check('sin registros, loggedCount es 0', day.loggedCount === 0, `logged=${day.loggedCount}`)
  check('sin historial, no hay "última vez"', pctRow.lastPerfLabel === null, pctRow.lastPerfLabel ?? '')

  // --- el guard de escritura ----------------------------------------------
  let ownDayOk = true
  try {
    await assertOwnedDay(asPlayer, player, dayIds[1]!, pctRow.id)
  } catch {
    ownDayOk = false
  }
  check('assertOwnedDay acepta el día propio con su ejercicio', ownDayOk)

  // Un ejercicio de la semana 1 NO está en el día de la semana 2.
  const { data: otherWeekBe } = await admin
    .from('block_exercises')
    .select('id, blocks!inner(day_id)')
    .eq('blocks.day_id', dayIds[0]!)
    .limit(1)
  let crossDayRejected = false
  try {
    await assertOwnedDay(asPlayer, player, dayIds[1]!, otherWeekBe![0]!.id)
  } catch {
    crossDayRejected = true
  }
  check('assertOwnedDay rechaza un ejercicio que no es de ese día', crossDayRejected)

  // --- registrar y volver a leer -------------------------------------------
  const log = await ensureSessionLog(asPlayer, playerId, dayIds[0]!)
  check('ensureSessionLog crea el log del día', !!log.id)

  const { error: entryErr } = await asPlayer.from('exercise_entries').upsert(
    {
      session_log_id: log.id,
      block_exercise_id: otherWeekBe![0]!.id,
      weight: 112,
      reps: 5,
      rpe: 9,
    },
    { onConflict: 'session_log_id,block_exercise_id' },
  )
  check('el jugador puede registrar una entry', !entryErr, entryErr?.message?.slice(0, 60) ?? '')

  await asPlayer
    .from('session_logs')
    .update({ note: 'Me sentí bien', completed_at: new Date().toISOString() })
    .eq('id', log.id)

  // Releer: la semana 2 ahora tiene que mostrar "última vez" de la semana 1.
  const week2 = await playerWeekFor(asPlayer, player)
  const pctRow2 = week2!.days[0]!.blocks[0]!.exercises[0]!
  check(
    'EL HISTORIAL: aparece "Semana 1 · Día 1: 112 kg · 5 reps · RPE 9"',
    pctRow2.lastPerfLabel === 'Semana 1 · Día 1: 112 kg · 5 reps · RPE 9',
    pctRow2.lastPerfLabel ?? 'null',
  )

  // --- sin 1RM -------------------------------------------------------------
  await admin.from('one_rms').delete().eq('player_id', playerId).eq('exercise_id', pctExercise!.id)
  const week3 = await playerWeekFor(asPlayer, player)
  const pctRow3 = week3!.days[0]!.blocks[0]!.exercises[0]!
  check(
    'sin 1RM avisa en vez de ocultar la carga',
    pctRow3.load.kind === 'missing-1rm',
    pctRow3.load.label,
  )
  check(
    'el ejercicio aparece en missingOneRms para el banner',
    week3!.days[0]!.missingOneRms.includes(pctExercise!.name),
    week3!.days[0]!.missingOneRms.join(', '),
  )

  // --- el dashboard -------------------------------------------------------
  //
  // Ejercita el select con `weeks!weeks_program_id_fkey`, que es el que en F2
  // devolvía 500 por ambigüedad de FK y pasó el typecheck, los tests de rutas y
  // verify:setup sin que nadie lo viera.
  const dashboard = await playerDashboardFor(asPlayer, player)
  check('el dashboard carga sin error de PostgREST', dashboard !== null)
  check(
    'el dashboard trae el nombre del programa asignado',
    dashboard.programName !== null,
    `programName=${dashboard.programName}`,
  )
  check(
    'el progreso cuenta los días de la semana vigente',
    dashboard.progress.total > 0,
    `${dashboard.progress.completed}/${dashboard.progress.total}`,
  )
  check(
    'el ratio del ring queda entre 0 y 1',
    dashboard.progress.ratio >= 0 && dashboard.progress.ratio <= 1,
    `ratio=${dashboard.progress.ratio}`,
  )

  // --- evaluaciones y la sincronización del 1RM ---------------------------
  //
  // Con la sesión del jugador, o sea con RLS aplicada: evaluations_write tiene que
  // dejarlo escribir las suyas sin ningún cambio de política.
  //
  // Ojo con el orden: el bloque de arriba BORRÓ el 1RM de este ejercicio, así que
  // este insert lo tiene que volver a crear. Eso hace el check más fuerte —
  // prueba el upsert del trigger desde cero y no solo el update.
  const { error: evalInsertError } = await asPlayer
    .from('evaluations')
    .insert({ player_id: player.id, exercise_id: pctExercise!.id, kg: 150, tested_on: '2026-07-20' })
  check(
    'el jugador puede cargar su propia evaluación con RLS puesta',
    !evalInsertError,
    evalInsertError?.message ?? '',
  )

  const evaluations = await evaluationsFor(asPlayer, player.id)
  check('el select de evaluaciones con el embed de exercises no falla', evaluations.length > 0)
  check(
    'la evaluación trae el nombre del ejercicio del embed',
    evaluations[0]?.exerciseName !== '—',
    `exerciseName=${evaluations[0]?.exerciseName}`,
  )

  const trends = trendsFrom(evaluations)
  check('las tendencias se agrupan por ejercicio', trends.length > 0)

  const { data: syncedRm } = await asPlayer
    .from('one_rms')
    .select('kg')
    .eq('player_id', player.id)
    .eq('exercise_id', pctExercise!.id)
    .maybeSingle()
  check(
    'el trigger 0018 sincronizó el 1RM con la evaluación cargada',
    Number(syncedRm?.kg) === 150,
    `kg=${syncedRm?.kg}`,
  )

  // --- que el nombre del bloque llegue hasta la vista ---------------------
  const blocksWithName = week3!.days.flatMap((day) =>
    day.blocks.filter((block) => block.name !== null),
  )
  check(
    'el select del árbol trae blocks.name',
    // Lo que importa es que la propiedad EXISTA en todos y que el bloque con
    // nombre del fixture llegue con el suyo.
    week3!.days.every((day) => day.blocks.every((block) => 'name' in block)) &&
      blocksWithName.some((block) => block.name === 'Fuerza tren inferior'),
    `${blocksWithName.length} bloques con nombre`,
  )
}

async function cleanup() {
  for (const id of createdPrograms) {
    // El árbol, los assignments y los session_logs se van en cascada.
    await admin.from('programs').delete().eq('id', id)
  }
  for (const id of createdUsers) {
    await admin.auth.admin.deleteUser(id)
  }
  console.log(`\nlimpieza: ${createdPrograms.length} programas y ${createdUsers.length} usuarios borrados`)
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`)
    results.push({ name: 'la corrida terminó sin excepciones', pass: false })
  })
  .finally(async () => {
    await cleanup()
    const passed = results.filter((r) => r.pass).length
    const failed = results.filter((r) => !r.pass)
    console.log(`\n${passed}/${results.length} checks OK`)
    if (failed.length > 0) {
      console.log('FALLARON:')
      for (const f of failed) console.log(`  - ${f.name}`)
      process.exit(1)
    }
  })
