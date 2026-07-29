/**
 * Le pone una contraseña nueva a un usuario.
 *
 * Las contraseñas NO se pueden leer: Supabase guarda un hash bcrypt en
 * auth.users.encrypted_password y nadie —ni la plataforma, ni con la secret
 * key— puede revertirlo. Lo único que se puede hacer es escribir una nueva, y
 * eso es lo que hace este script.
 *
 * Es un script de administración que corre A MANO y usa la secret key, que
 * saltea RLS: exactamente uno de los tres usos permitidos por CLAUDE.md §4
 * (migraciones, seed, scripts de administración). NUNCA lo llames desde una
 * ruta ni desde el frontend.
 *
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
 *   node scripts/set-password.mjs jugador@mail.com "NuevaClave123"
 *
 * Sin contraseña, genera una temporal y la imprime: es el caso de uso real del
 * club, donde el coach está con el jugador y se la dicta.
 */
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SECRET) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const [email, providedPassword] = process.argv.slice(2)

if (!email) {
  console.error('Uso: node scripts/set-password.mjs <email> [contraseña]')
  console.error('Sin contraseña, se genera una temporal y se imprime.')
  process.exit(1)
}

/**
 * Alfabeto sin caracteres ambiguos, igual que el del invite code: la contraseña
 * temporal se dicta en voz alta.
 */
function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

const password = providedPassword ?? temporaryPassword()

if (password.length < 8) {
  console.error('La contraseña tiene que tener al menos 8 caracteres (lo exige Supabase Auth).')
  process.exit(1)
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false } })

// El admin API no busca por email, así que hay que paginar hasta encontrarlo.
async function findByEmail(target) {
  const wanted = target.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const found = data.users.find((u) => u.email?.toLowerCase() === wanted)
    if (found) return found
    if (data.users.length < 200) return null
  }
  return null
}

const user = await findByEmail(email)

if (!user) {
  console.error(`No existe un usuario con el email ${email}.`)
  process.exit(1)
}

const { error } = await admin.auth.admin.updateUserById(user.id, { password })
if (error) {
  console.error(`No se pudo cambiar la contraseña: ${error.message}`)
  process.exit(1)
}

const { data: profile } = await admin
  .from('profiles')
  .select('name, role')
  .eq('id', user.id)
  .maybeSingle()

console.log(`\nContraseña cambiada.`)
console.log(`  usuario:    ${user.email}`)
console.log(`  nombre:     ${profile?.name ?? '—'}`)
console.log(`  rol:        ${profile?.role ?? '—'}`)
console.log(`  contraseña: ${password}`)
if (!providedPassword) {
  console.log(`\nEs temporal: decile que la cambie cuando entre.`)
}
