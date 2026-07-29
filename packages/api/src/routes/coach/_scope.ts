import { NotFoundError } from '@coachlab/core/access/rbac'

/**
 * Convierte "0 filas afectadas" en 404.
 *
 * Un UPDATE/DELETE de PostgREST que no matchea filas devuelve ÉXITO: cuando RLS
 * filtra la fila por USING no hay error, hay 0 filas. Sin esto el coach cree que
 * guardó y no guardó nada, y un recurso ajeno respondería 200 con un body vacío.
 *
 * CLAUDE.md §4, capa 4: recurso ajeno → 404, nunca 403 (no revelar existencia).
 *
 * Usar SIEMPRE con `.select(...).maybeSingle()` al final de la escritura: sin el
 * select, PostgREST no devuelve la fila y no hay nada que comprobar.
 */
/**
 * Códigos de Postgres que significan "el padre no es tuyo o no existe", y que en
 * un INSERT llegan como error en vez de como 0 filas:
 *
 *   42501 → violación de RLS (el padre existe pero no lo podés escribir)
 *   23503 → violación de FK  (el padre no existe)
 *
 * Los dos son 404 para el cliente, con el MISMO body: distinguirlos sería un
 * oráculo de existencia de recursos ajenos (CLAUDE.md §4).
 */
const NOT_FOUND_CODES = new Set(['42501', '23503'])

export function assertRow<T>(
  row: T | null | undefined,
  error?: { message: string; code?: string } | null,
): T {
  if (error) {
    if (error.code && NOT_FOUND_CODES.has(error.code)) throw new NotFoundError()
    throw new Error(error.message)
  }
  if (row == null) throw new NotFoundError()
  return row
}

/**
 * Las RPC de seguridad (release_player, redeem_invite_code) lanzan excepciones de
 * Postgres cuando el recurso no es tuyo. Eso es un 404 del lado del cliente, no
 * un 500: el mensaje ya está redactado en español desde la migración.
 */
export function assertRpcOk(error: { message: string } | null): void {
  if (error) throw new NotFoundError(error.message)
}
