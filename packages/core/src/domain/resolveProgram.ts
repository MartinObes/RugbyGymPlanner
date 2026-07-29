/**
 * Los cuatro destinos posibles de un assignment, con los nombres de las columnas
 * de program_assignments: player_id, position_group_id (custom),
 * system_group_id (forwards/backs) y position_id.
 */
export type AssignmentKind = 'PLAYER' | 'POSITION_GROUP' | 'SYSTEM_GROUP' | 'POSITION'

/** CLAUDE.md §3: individual pisa grupo custom, pisa grupo system, pisa puesto. */
export const BASE_PRIORITY: Record<AssignmentKind, number> = {
  PLAYER: 100,
  POSITION_GROUP: 50,
  SYSTEM_GROUP: 30,
  POSITION: 10,
}

export type CandidateAssignment = {
  assignmentId: string
  programId: string
  kind: AssignmentKind
  /** Override que define el coach por assignment. Se SUMA a la base. */
  priority: number
  createdAt: Date
}

export function scoreOf(candidate: CandidateAssignment): number {
  return BASE_PRIORITY[candidate.kind] + candidate.priority
}

/**
 * Elige el assignment vigente entre los que le aplican a un jugador.
 * Gana el score más alto; ante empate, el createdAt más reciente.
 *
 * Pura a propósito (CLAUDE.md §3): se podría resolver en SQL con un
 * ORDER BY ... LIMIT 1, pero entonces la regla de negocio viviría en un string
 * y solo se podría testear con una base levantada.
 */
export function resolveProgram(
  candidates: readonly CandidateAssignment[],
): CandidateAssignment | null {
  let winner: CandidateAssignment | null = null
  let winnerScore = -Infinity

  for (const candidate of candidates) {
    const score = scoreOf(candidate)
    if (score > winnerScore) {
      winner = candidate
      winnerScore = score
      continue
    }
    if (score === winnerScore && winner && candidate.createdAt > winner.createdAt) {
      winner = candidate
    }
  }

  return winner
}
