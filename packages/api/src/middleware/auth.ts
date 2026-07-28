import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMiddleware } from 'hono/factory'
import { hasRole, UnauthorizedError, type Actor } from '@coachlab/core/access/rbac'
import type { Role } from '@coachlab/core/validators/auth'
import { createRequestClient } from '../db/client'

export type AuthVariables = {
  actor: Actor | null
  db: SupabaseClient
}

/**
 * Reconstruye la sesión desde el header Cookie y resuelve el actor. NO rechaza:
 * eso es tarea de requireRole — así las rutas públicas (health, openapi) pueden
 * convivir con este middleware montado global.
 *
 * Sin cookies no hay ningún viaje a Supabase: getUser() corta en memoria con
 * "session missing", y el health que UptimeRobot golpea cada 5 minutos sigue
 * costando lo mismo que en F0.
 */
export const withActor = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  c.set('actor', null)

  let supabase: SupabaseClient
  try {
    supabase = createRequestClient({
      getAll: () =>
        parseCookieHeader(c.req.header('cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        })),
      // Si Supabase refresca el token durante el request, el Set-Cookie viaja en
      // esta misma respuesta y el browser queda al día.
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          c.header('Set-Cookie', serializeCookieHeader(name, value, options), { append: true })
        }
      },
    })
  } catch {
    // Sin SUPABASE_URL/ANON_KEY (tests, CI) no hay sesión que resolver y no
    // puede haber actor, así que los guards cortan antes de que ninguna ruta
    // toque `db`. El health reporta 'unconfigured' por su cuenta — la falta de
    // configuración se informa, no tira abajo la API (lección de F0).
    return next()
  }

  c.set('db', supabase)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return next()

  // El rol vive en profiles.role, no en el JWT (CLAUDE.md §4). Esta query va
  // con el JWT del usuario: RLS garantiza que solo puede leer su propia fila.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, role, invite_code, coach_id')
    .eq('id', user.id)
    .single()

  if (profile) {
    c.set('actor', {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role as Role,
      inviteCode: profile.invite_code,
      coachId: profile.coach_id,
    })
  }

  return next()
})

/** Capa 2 de CLAUDE.md §4: cuelga de los prefijos /coach/*, /player/* y /admin/* en app.ts. */
export function requireRole(allowed: readonly Role[]) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (!hasRole(c.get('actor'), allowed)) throw new UnauthorizedError()
    return next()
  })
}
