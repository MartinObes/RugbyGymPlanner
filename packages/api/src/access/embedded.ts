/**
 * Normaliza un embed de PostgREST.
 *
 * Una relación many-to-one vuelve como OBJETO en runtime, pero el cliente de
 * este paquete no está tipado con `Database` —los tipos generados viven en
 * packages/web (deuda de IMPLEMENTATION-F2.md §6)— así que TS la infiere como
 * array. Se normalizan las dos formas en vez de castear: un cast mentiría sobre
 * lo que llega.
 */
export function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
