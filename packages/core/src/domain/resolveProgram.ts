/**
 * Los tres destinos posibles de un assignment, con los nombres de las columnas
 * de program_assignments: player_id, position_group_id (custom) y
 * system_group_id (forwards/backs).
 *
 * `POSITION` se eliminó en F4-B: un puesto suelto se modela como grupo custom de
 * una sola posición, que hace lo mismo y ya existía. Ver
 * docs/superpowers/specs/2026-07-31-f4b-assignment-model-design.md §2.2.
 *
 * Esto NO toca profiles.position_id: el puesto del jugador sigue siendo lo que
 * decide a qué grupo system pertenece y qué grupos custom lo contienen. Lo único
 * que se fue es apuntar un assignment directamente a un puesto.
 */
export type AssignmentKind = 'PLAYER' | 'POSITION_GROUP' | 'SYSTEM_GROUP'

export type CandidateAssignment = {
  assignmentId: string
  programId: string
  kind: AssignmentKind
  createdAt: Date
}

/**
 * Elige el programa vigente de un jugador.
 *
 * La regla es de una línea (F4-B §2.1): **gana la última asignada**. Reemplaza a
 * la resolución por prioridad de cuatro niveles, que obligaba al coach a razonar
 * si 50 + override le ganaba a 100 cuando lo único que quería era que valiera lo
 * último que dijo. El caso real que la motivó: "este jugador se lesionó, lo paso
 * a la rutina de lesionados".
 *
 * `selectedProgramId` es la elección del jugador (F4-B §2.3). Sólo vale si ese
 * programa TODAVÍA está entre las candidatas: el coach puede haberle quitado el
 * assignment, o haberlo cambiado de puesto, o haberlo sacado de un grupo custom,
 * y de ninguno de esos tres se entera la FK. Ante una elección inválida se
 * degrada al default en vez de romper el render — el mismo criterio que
 * isPositionId e isLoadType.
 *
 * Pura a propósito (CLAUDE.md §3): se podría resolver en SQL con un
 * ORDER BY ... LIMIT 1, pero entonces la regla de negocio viviría en un string y
 * solo se podría testear con una base levantada.
 */
export function resolveProgram(
  candidates: readonly CandidateAssignment[],
  selectedProgramId?: string | null,
): CandidateAssignment | null {
  if (selectedProgramId) {
    const chosen = latest(candidates.filter((c) => c.programId === selectedProgramId))
    if (chosen) return chosen
  }

  return latest(candidates)
}

function latest(pool: readonly CandidateAssignment[]): CandidateAssignment | null {
  let winner: CandidateAssignment | null = null

  for (const candidate of pool) {
    // `>` y no `>=`: ante un empate exacto de createdAt gana la primera, así el
    // resultado no depende del orden en que PostgREST devolvió las filas.
    if (!winner || candidate.createdAt > winner.createdAt) winner = candidate
  }

  return winner
}
