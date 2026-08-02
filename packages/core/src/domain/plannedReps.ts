/**
 * Las reps del PLAN son texto libre; las que el jugador registra son un número.
 *
 * La planilla del club escribe cosas como "10", "8-10", "8/10", "máx" o "AMRAP",
 * y `block_exercises.reps` las guarda tal cual porque perder ese matiz sería
 * perder la intención del preparador físico.
 *
 * Cuando el registro del jugador quiere ofrecer un punto de partida ("venías a
 * hacer 8"), hay que sacar UN número de ese texto. Esta función hace sólo eso.
 */

/**
 * El primer número del texto de reps, o `null` si no hay ninguno.
 *
 * - `"10"` → 10
 * - `"8-10"` → 8 — el piso del rango, no el techo: sugerir el máximo empuja al
 *   jugador a un número que el coach puso como tope, no como objetivo.
 * - `"máx"` / `"AMRAP"` → `null`. No hay número que sugerir y **inventar uno
 *   sería peor que no sugerir nada**: el punto del ejercicio es que llegue hasta
 *   donde llegue.
 * - `null` / `""` → `null`.
 *
 * Sólo enteros positivos: no existen las 2,5 repeticiones, y aceptar decimales
 * abriría que "1.ª serie" devuelva 1.
 */
export function parsePlannedReps(reps: string | null | undefined): number | null {
  if (!reps) return null

  const match = /\d+/.exec(reps)
  if (!match) return null

  const value = Number.parseInt(match[0], 10)
  // Un 0 explícito ("0 reps") no es un punto de partida útil, y `Number.parseInt`
  // ya descartó NaN al exigir \d+.
  return value > 0 ? value : null
}
