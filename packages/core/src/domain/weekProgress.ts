/**
 * El progreso de la semana del jugador: "2/3 rutinas de esta semana".
 *
 * Deriva de session_logs.completed_at, que ya existía desde F0. No hay checkbox
 * por ejercicio y esto no lo inventa: cuenta DÍAS CERRADOS, que es lo único que
 * el jugador afirmó explícitamente.
 *
 * Ojo con lo que este número NO dice: la semana vigente sale de
 * programs.current_week_id, que es global al programa y no por jugador. Si el
 * coach avanza la semana, el progreso de todo el plantel se reinicia junto. Es lo
 * que definió el modelo de F0 y alcanza para un plantel que entrena junto
 * (deuda anotada en el spec de F3.5 §12).
 */
export type WeekProgress = {
  completed: number
  total: number
  /** 0..1, listo para el conic-gradient de la rueda. 0 cuando no hay días. */
  ratio: number
}

export function weekProgress(
  completedDayIds: readonly string[],
  totalDays: number,
): WeekProgress {
  const total = Math.max(0, Math.trunc(totalDays))
  // Set porque un day_id repetido no es un día más. Y el clamp por si quedó un
  // session_log de un día que ya no está en la semana.
  const completed = Math.min(new Set(completedDayIds).size, total)

  return { completed, total, ratio: total === 0 ? 0 : completed / total }
}
