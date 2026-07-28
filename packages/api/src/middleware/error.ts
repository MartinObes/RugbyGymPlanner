import type { ErrorHandler } from 'hono'
import { NotFoundError, UnauthorizedError } from '@coachlab/core/access/rbac'

/**
 * Traduce errores de dominio a status tipados (CLAUDE.md §5: nunca una
 * excepción cruda al cliente). El 404 de NotFoundError es deliberado: hace
 * indistinguible "no existe" de "no es tuyo".
 */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof UnauthorizedError) {
    return c.json({ ok: false as const, error: 'No autorizado' }, 401)
  }
  if (error instanceof NotFoundError) {
    return c.json({ ok: false as const, error: 'No encontrado' }, 404)
  }
  console.error('[api]', error)
  return c.json({ ok: false as const, error: 'Error interno' }, 500)
}
