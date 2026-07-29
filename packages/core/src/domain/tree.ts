/**
 * Orden del árbol del programa.
 *
 * CLAUDE.md §3: el orden NUNCA sale del orden en que vuelven las filas, sale de
 * order_index. La query pide el orden y estos helpers lo garantizan igual, para
 * que un select que se olvide del `order` no reordene la rutina de nadie.
 */

export type Ordered = { order_index?: number | null }

/** null va al final: una fila sin orden explícito es la última, no la primera. */
function orderOf(row: Ordered): number {
  return row.order_index ?? Number.MAX_SAFE_INTEGER
}

/** Comparador para `Array.prototype.sort`. Empata por id para ser determinístico. */
export function byOrderIndex<T extends Ordered & { id?: string }>(a: T, b: T): number {
  const diff = orderOf(a) - orderOf(b)
  if (diff !== 0) return diff
  return (a.id ?? '').localeCompare(b.id ?? '')
}

/** Copia ordenada. No muta la entrada. */
export function sortByOrderIndex<T extends Ordered & { id?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(byOrderIndex)
}

/** El order_index que le toca a un hermano nuevo. */
export function nextOrderIndex(rows: readonly Ordered[]): number {
  const indexes = rows.map((r) => r.order_index).filter((i): i is number => typeof i === 'number')
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1
}

/**
 * Renumera 0..n-1 respetando el orden del array recibido — que tiene que venir
 * YA en el orden deseado (lo que produce un drag&drop). Para renumerar lo que
 * viene de la base, primero `sortByOrderIndex`.
 *
 * Devuelve solo `{ id, order_index }`: es lo que manda la ruta de reordenar.
 */
export function reindex<T extends { id: string }>(
  rows: readonly T[],
): { id: string; order_index: number }[] {
  return rows.map((row, index) => ({ id: row.id, order_index: index }))
}
