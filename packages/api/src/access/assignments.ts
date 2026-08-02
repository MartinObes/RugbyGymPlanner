import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import { isPositionId, systemGroupForPosition } from '@coachlab/core/domain/positions'
import {
  resolveProgram,
  type AssignmentKind,
  type CandidateAssignment,
} from '@coachlab/core/domain/resolveProgram'

export type AssignmentRow = {
  id: string
  program_id: string
  player_id: string | null
  position_group_id: string | null
  system_group_id: string | null
  created_at: string
}

/** El destino sale de cuál columna vino no-nula: el CHECK garantiza que es una sola. */
export function kindOf(row: AssignmentRow): AssignmentKind {
  if (row.player_id) return 'PLAYER'
  if (row.position_group_id) return 'POSITION_GROUP'
  return 'SYSTEM_GROUP'
}

export function toCandidate(row: AssignmentRow): CandidateAssignment {
  return {
    assignmentId: row.id,
    programId: row.program_id,
    kind: kindOf(row),
    createdAt: new Date(row.created_at),
  }
}

export const ASSIGNMENT_COLUMNS =
  'id, program_id, player_id, position_group_id, system_group_id, created_at'

/** Los grupos custom que contienen el puesto del jugador. */
export async function customGroupIdsFor(
  db: SupabaseClient<Database>,
  positionId: string | null,
): Promise<string[]> {
  if (!positionId) return []

  const { data, error } = await db
    .from('position_group_positions')
    .select('group_id')
    .eq('position_id', positionId)
  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => r.group_id)
}

/**
 * Los assignments que le aplican a un jugador. Tres destinos desde F4-B.
 *
 * Los grupos custom que contienen su puesto salen de una consulta previa porque
 * PostgREST no expresa un `in (select ...)` dentro de un `.or()`.
 *
 * RLS hace el trabajo pesado: no se filtra por coach porque
 * program_assignments_select solo devuelve los de programas que el actor puede
 * leer, y program_reaches_me (reescrita en 0019, sin la rama del puesto) exige
 * que el programa sea del coach del jugador. Si esta query se copiara a un
 * contexto con service_role dejaría de estar protegida — por eso nunca se usa
 * service_role en un request.
 */
export async function candidateAssignmentsFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null },
): Promise<CandidateAssignment[]> {
  // El `.or()` de abajo se arma interpolando strings, así que el positionId
  // tiene que ser uno de los 8 slugs y no texto arbitrario: un valor como
  // `wing,player_id.eq.<uuid>` extendería el filtro.
  if (player.positionId !== null && !isPositionId(player.positionId)) {
    throw new Error(`Puesto inválido: ${player.positionId}`)
  }

  const systemGroup = systemGroupForPosition(player.positionId)
  const groupIds = await customGroupIdsFor(db, player.positionId)

  const clauses = [`player_id.eq.${player.id}`]
  if (systemGroup) clauses.push(`system_group_id.eq.${systemGroup.id}`)
  if (groupIds.length > 0) clauses.push(`position_group_id.in.(${groupIds.join(',')})`)

  const { data, error } = await db
    .from('program_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .or(clauses.join(','))
  if (error) throw new Error(error.message)

  return ((data ?? []) as AssignmentRow[]).map(toCandidate)
}

/**
 * El programa que el jugador ESTÁ VIENDO: su elección si sigue siendo válida, y
 * si no la última asignada.
 *
 * Es lo que tiene que mostrar el coach (F4-B §2.4): con un selector en el medio,
 * mostrarle el default sería una pantalla que le miente.
 */
export async function activeProgramIdFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null; selectedProgramId?: string | null },
): Promise<string | null> {
  const candidates = await candidateAssignmentsFor(db, player)
  return resolveProgram(candidates, player.selectedProgramId ?? null)?.programId ?? null
}

/**
 * El programa que el coach le asignó, ignorando la elección del jugador.
 *
 * Sirve para marcar en la pantalla del coach cuándo un jugador está mirando otra
 * cosa. Sin esa marca, C1 es peligrosa: el coach creería que todos ven lo último
 * que asignó. Con ella, es auditable.
 */
export async function assignedProgramIdFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null },
): Promise<string | null> {
  return resolveProgram(await candidateAssignmentsFor(db, player))?.programId ?? null
}
