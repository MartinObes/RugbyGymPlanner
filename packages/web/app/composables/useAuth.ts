import type { LoginInput, RegisterInput, SessionUser } from '@coachlab/core/validators/auth'

/** Home de cada rol. La usa el middleware, el login y el registro. */
export const ROLE_HOME: Record<SessionUser['role'], string> = {
  COACH: '/coach/players',
  PLAYER: '/player/week',
  ADMIN: '/admin',
}

/**
 * Estado de sesión compartido SSR→cliente.
 * `undefined` = todavía no se resolvió; `null` = no hay sesión.
 */
export function useAuth() {
  const user = useState<SessionUser | null | undefined>('session-user', () => undefined)
  const { $supabase } = useNuxtApp()

  async function refresh(): Promise<void> {
    const {
      data: { user: authUser },
    } = await $supabase.auth.getUser()

    if (!authUser) {
      user.value = null
      return
    }

    // RLS solo deja leer la fila propia; el rol sale de la tabla, no del JWT.
    const { data: profile } = await $supabase
      .from('profiles')
      .select('id, email, name, role, invite_code, coach_id')
      .eq('id', authUser.id)
      .single()

    user.value = profile
      ? {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role as SessionUser['role'],
          inviteCode: profile.invite_code,
          coachId: profile.coach_id,
        }
      : null
  }

  async function login(input: LoginInput): Promise<void> {
    const { error } = await $supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    if (error) {
      // Mismo mensaje para email inexistente y contraseña mala: no filtramos
      // qué emails están registrados. Supabase ya devuelve un error genérico.
      throw new Error(
        /confirm/i.test(error.message)
          ? 'Confirmá tu email antes de entrar'
          : 'Email o contraseña incorrectos',
      )
    }
    await refresh()
  }

  async function register(input: RegisterInput): Promise<{ needsEmailConfirm: boolean }> {
    if (input.role === 'PLAYER') {
      // Un anónimo no puede leer profiles: la RPC security definer resuelve el
      // código sin abrir la tabla (migración 0004).
      const { data: coachName } = await $supabase.rpc('coach_name_for_invite', {
        code: input.inviteCode!,
      })
      if (!coachName) throw new Error('Ese código no existe. Pedile el suyo a tu entrenador.')
    }

    const { data, error } = await $supabase.auth.signUp({
      email: input.email,
      password: input.password,
      // El trigger handle_new_user (migración 0002) lee esto y crea el perfil:
      // rol, invite code propio si es coach, vínculo al coach si es jugador.
      options: {
        data: {
          name: input.name,
          role: input.role,
          invite_code: input.role === 'PLAYER' ? input.inviteCode : null,
        },
      },
    })

    if (error) {
      throw new Error(
        /already|registered/i.test(error.message)
          ? 'Ya existe una cuenta con ese email'
          : 'No se pudo crear la cuenta. Probá de nuevo.',
      )
    }

    // Con confirmación de email encendida, signUp no devuelve sesión.
    if (!data.session) return { needsEmailConfirm: true }

    await refresh()
    return { needsEmailConfirm: false }
  }

  async function logout(): Promise<void> {
    await $supabase.auth.signOut()
    user.value = null
    await navigateTo('/login')
  }

  return { user, refresh, login, register, logout }
}
