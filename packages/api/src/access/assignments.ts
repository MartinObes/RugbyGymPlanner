import type { SupabaseClient } from '@supabase/supabase-js'
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
  position_id: string | null
  priority: number
  created_at: string
}

/** El destino sale de cuál columna vino no-nula: el CHECK garantiza que es una sola. */
export function kindOf(row: AssignmentRow): AssignmentKind {
  if (row.player_id) return 'PLAYER'
  if (row.position_group_id) return 'POSITION_GROUP'
  if (row.system_group_id) return 'SYSTEM_GROUP'
  return 'POSITION'
}

export function toCandidate(row: AssignmentRow): CandidateAssignment {
  return {
    assignmentId: row.id,
    programId: row.program_id,
    kind: kindOf(row),
    priority: row.priority,
    createdAt: new Date(row.created_at),
  }
}

export const ASSIGNMENT_COLUMNS =
  'id, program_id, player_id, position_group_id, system_group_id, position_id, priority, created_at'

/**
 * Los assignments que le aplican a un jugador. Es la query de CLAUDE.md §3: un
 * OR sobre los cuatro destinos, cada uno con su índice parcial.
 *
 * Los grupos custom que contienen su puesto salen de una consulta previa porque
 * PostgREST no expresa un `in (select ...)` dentro de un `.or()`.
 *
 * RLS hace el trabajo pesado: no se filtra por coach porque
 * program_assignments_select solo devuelve los de programas que el actor puede
 * leer, y program_reaches_me (endurecida en 0005) exige que el programa sea del
 * coach del jugador. Si esta query se copiara a un contexto con service_role
 * dejaría de estar protegida — por eso nunca se usa service_role en un request.
 */
export async function candidateAssignmentsFor(
  db: SupabaseClient,
  player: { id: string; positionId: string | null },
): Promise<CandidateAssignment[]> {
  // El `.or()` de abajo se arma interpolando strings, así que el positionId
  // tiene que ser uno de los 8 slugs y no texto arbitrario. Hoy siempre viene de
  // la base (dominio position_slug), pero este helper lo va a reusar F3 y ahí
  // podría llegar del cliente: `wing,player_id.eq.<uuid>` extendería el filtro.
  if (player.positionId !== null && !isPositionId(player.positionId)) {
    throw new Error(`Puesto inválido: ${player.positionId}`)
  }

  const systemGroup = systemGroupForPosition(player.positionId)

  let groupIds: string[] = []
  if (player.positionId) {
    const { data, error } = await db
      .from('position_group_positions')
      .select('group_id')
      .eq('position_id', player.positionId)
    if (error) throw new Error(error.message)
    groupIds = (data ?? []).map((r) => r.group_id as string)
  }

  const clauses = [`player_id.eq.${player.id}`]
  if (player.positionId) clauses.push(`position_id.eq.${player.positionId}`)
  if (systemGroup) clauses.push(`system_group_id.eq.${systemGroup.id}`)
  if (groupIds.length > 0) clauses.push(`position_group_id.in.(${groupIds.join(',')})`)

  const { data, error } = await db
    .from('program_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .or(clauses.join(','))
  if (error) throw new Error(error.message)

  return ((data ?? []) as AssignmentRow[]).map(toCandidate)
}

export async function activeProgramIdFor(
  db: SupabaseClient,
  player: { id: string; positionId: string | null },
): Promise<string | null> {
  return resolveProgram(await candidateAssignmentsFor(db, player))?.programId ?? null
}
