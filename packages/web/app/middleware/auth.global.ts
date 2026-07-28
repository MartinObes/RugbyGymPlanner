import type { SessionUser } from '@coachlab/core/validators/auth'

const PUBLIC_PATHS = new Set(['/login', '/register'])

const PREFIX_ROLES: ReadonlyArray<readonly [string, ReadonlyArray<SessionUser['role']>]> = [
  ['/coach', ['COACH', 'ADMIN']],
  ['/player', ['PLAYER']],
  ['/admin', ['ADMIN']],
]

/**
 * Capa 5 de CLAUDE.md §4 — esto es UX, no seguridad. Lo que de verdad frena a
 * un jugador en /coach/* es requireRole en la API y RLS en la base.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, refresh } = useAuth()

  // Primera resolución (SSR o primer render): una vez por sesión de navegación.
  if (user.value === undefined) await refresh()

  const current = user.value

  if (!current) {
    if (PUBLIC_PATHS.has(to.path)) return
    return navigateTo(
      to.path === '/' ? '/login' : { path: '/login', query: { redirect: to.fullPath } },
    )
  }

  if (PUBLIC_PATHS.has(to.path) || to.path === '/') {
    return navigateTo(ROLE_HOME[current.role])
  }

  const rule = PREFIX_ROLES.find(([prefix]) => to.path.startsWith(prefix))
  if (rule && !rule[1].includes(current.role)) {
    // Rol equivocado: a su home, no un 403 (CLAUDE.md §4, capa 5).
    return navigateTo(ROLE_HOME[current.role])
  }
})
