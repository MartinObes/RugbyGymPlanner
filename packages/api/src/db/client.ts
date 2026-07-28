import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * CLAUDE.md §4, la regla que hace que RLS sirva de algo:
 *
 *   Ninguna operación de usuario usa la service_role key. Nunca.
 *
 * Por eso este módulo NO exporta un cliente con service_role. El único lugar
 * donde esa key aparece es scripts/seed.ts, que corre a mano y fuera de un
 * request. Si alguna vez necesitás service_role dentro de una ruta, la respuesta
 * casi siempre es que falta una política de RLS, no que falta la key.
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

/**
 * Cliente con la sesión del usuario. Todas sus queries viajan con el JWT, así
 * que `auth.uid()` resuelve dentro de las políticas y RLS filtra sola.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Cliente anónimo. Sirve para lo previo al login y para el health check.
 * Sin sesión el rol es `anon`, que no tiene ninguna política: no ve nada.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Cliente reconstruido desde las cookies del request (las escribe @supabase/ssr
 * del lado de Nuxt). Es el cliente de la capa de datos de TODAS las rutas
 * autenticadas: viaja con el JWT del usuario, así que auth.uid() resuelve en
 * las políticas y RLS filtra sola (CLAUDE.md §4).
 */
export function createRequestClient(cookies: CookieMethodsServer): SupabaseClient {
  return createServerClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    cookies,
  })
}
