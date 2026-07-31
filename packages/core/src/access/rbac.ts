import type { Role, SessionUser } from '../validators/auth'

/**
 * El actor de un request autenticado. Es el SessionUser leído de profiles en
 * cada request — el rol NUNCA sale del JWT (CLAUDE.md §4): así un cambio de rol
 * pega inmediato sin esperar a que expire un token.
 *
 * Lleva además `positionId`, que la API necesita para resolver el programa del
 * jugador (los assignments scopean por puesto y por grupo) y que el frontend no
 * usa — por eso se suma acá y no en `SessionUser`, que es el contrato de la
 * sesión de Nuxt.
 */
export type Actor = SessionUser & { positionId: string | null }

/**
 * Recurso ajeno responde 404, nunca 403: un 403 confirma que el recurso existe
 * (CLAUDE.md §4, capa 4). En F1 todavía no hay recursos con id; el error queda
 * definido acá para que el middleware de errores ya lo traduzca.
 */
export class NotFoundError extends Error {
  constructor(message = 'No encontrado') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'No autorizado') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/** ADMIN no está implícito: si una ruta lo admite, tiene que listarlo. */
export function hasRole(actor: Pick<Actor, 'role'> | null, allowed: readonly Role[]): boolean {
  if (!actor) return false
  return allowed.includes(actor.role)
}
