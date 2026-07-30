import {
  createBrowserClient,
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'

/**
 * Un cliente de Supabase por contexto: browser client en el navegador (guarda
 * la sesión en cookies) y server client en SSR (la lee de las cookies del
 * request y, si refresca tokens, los Set-Cookie salen en esta misma respuesta).
 *
 * El ciclo de vida de la sesión vive ACÁ, en la web. La API solo la lee para
 * autorizar (packages/api/src/middleware/auth.ts).
 */
export default defineNuxtPlugin(() => {
  const {
    public: { supabaseUrl, supabaseAnonKey },
  } = useRuntimeConfig()

  let supabase: SupabaseClient<Database>

  if (import.meta.server) {
    const event = useRequestEvent()!
    supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () =>
          parseCookieHeader(event.node.req.headers.cookie ?? '').map(({ name, value }) => ({
            name,
            value: value ?? '',
          })),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            event.node.res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, options))
          }
        },
      },
    })
  } else {
    supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  }

  return { provide: { supabase } }
})
