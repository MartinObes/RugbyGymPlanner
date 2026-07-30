/**
 * Regenera packages/core/src/types/database.ts desde el schema del proyecto.
 *
 * Existe en vez de un one-liner en package.json por dos razones que se
 * descubrieron en F3.5, y las dos hacen perder trabajo:
 *
 *   1. `$SUPABASE_PROJECT_ID` NO se expande en Windows. pnpm corre los scripts
 *      con el shell del sistema, y cmd.exe no conoce esa sintaxis: la CLI recibía
 *      el literal "$SUPABASE_PROJECT_ID" como ref y fallaba. El script del root
 *      nunca había corrido en la máquina del dueño del repo.
 *
 *   2. `> archivo` TRUNCA ANTES de correr el comando. Con el fallo de (1), el
 *      resultado era database.ts vacío: el generador ni siquiera había arrancado
 *      y el archivo bueno ya no estaba. Acá se genera a memoria y se escribe
 *      SOLO si salió bien.
 *
 * El ref sale de SUPABASE_PROJECT_ID (documentado en packages/web/.env.example) o
 * de supabase/.temp/project-ref, que el CLI deja al linkear el proyecto.
 *
 *   pnpm gen:types
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const OUT = 'packages/core/src/types/database.ts'

/**
 * El entry JS del CLI, invocado con el mismo node que corre este script.
 *
 * No se usa `npx supabase` ni node_modules/.bin/supabase: en Windows esos son
 * shims .cmd y `spawnSync` sin shell los rechaza con EINVAL. Y con `shell: true`
 * habría que preocuparse por el quoting del ref. Llamar al .js directo evita las
 * dos cosas.
 */
function cliEntry() {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('supabase/package.json')), 'dist', 'supabase.js')
}

function projectRef() {
  const fromEnv = process.env.SUPABASE_PROJECT_ID?.trim()
  if (fromEnv) return fromEnv
  try {
    // El CLI lo escribe al linkear: sirve como default sin pedir configuración.
    return readFileSync('supabase/.temp/project-ref', 'utf8').trim()
  } catch {
    return ''
  }
}

const ref = projectRef()
if (!ref) {
  console.error(
    'Falta SUPABASE_PROJECT_ID y no hay supabase/.temp/project-ref.\n' +
      'Es el <ref> de https://<ref>.supabase.co — ver packages/web/.env.example.',
  )
  process.exit(1)
}

let types
try {
  types = execFileSync(
    process.execPath,
    [cliEntry(), 'gen', 'types', 'typescript', '--project-id', ref, '--schema', 'public'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  )
} catch (error) {
  console.error(`\nNo se pudieron generar los tipos (${error.message}).`)
  console.error(`${OUT} quedó como estaba.`)
  process.exit(1)
}

// Un schema real no entra en 500 bytes: si volvió algo así, salió mal aunque el
// exit code diga que no, y pisar el archivo bueno sería peor que fallar.
if (!types.includes('export type Database') || types.length < 500) {
  console.error(`La salida no parece un schema (${types.length} bytes). ${OUT} quedó como estaba.`)
  process.exit(1)
}

writeFileSync(OUT, types)
console.log(`${OUT} regenerado desde ${ref} (${types.length} bytes).`)
