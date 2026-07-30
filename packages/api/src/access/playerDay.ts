import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import { NotFoundError } from '@coachlab/core/access/rbac'
import { assertRow } from '../routes/coach/_scope'
import { activeProgramIdFor } from './assignments'
import { firstOf } from './embedded'

export type SessionLog = { id: string; completed_at: string | null }

/**
 * Confirma que el día es del programa VIGENTE del jugador y —si se pasa— que el
 * blockExerciseId vive en ESE día.
 *
 * Sin esto, un jugador registra contra el programa de cualquier otro coach
 * conociendo un dayId. La migración 0015 lo respalda en la base; este guard
 * existe para dar 404 con el status correcto en vez de un error de RLS que
 * llegaría como 500 poco informativo (CLAUDE.md §4, capa 4).
 *
 * Recurso ajeno → 404, nunca 403: no se revela existencia.
 */
export async function assertOwnedDay(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null },
  dayId: string,
  blockExerciseId?: string,
): Promise<void> {
  const programId = await activeProgramIdFor(db, player)
  if (!programId) throw new NotFoundError()

  const { data: dayRow, error: dayError } = await db
    .from('days')
    .select('id, weeks!inner(program_id)')
    .eq('id', dayId)
    .maybeSingle()
  const day = assertRow(dayRow, dayError)

  const dayProgramId = firstOf(day.weeks as { program_id: string } | { program_id: string }[])
    ?.program_id
  if (dayProgramId !== programId) throw new NotFoundError()

  if (blockExerciseId === undefined) return

  const { data: beRow, error: beError } = await db
    .from('block_exercises')
    .select('id, blocks!inner(day_id)')
    .eq('id', blockExerciseId)
    .maybeSingle()
  const blockExercise = assertRow(beRow, beError)

  const beDayId = firstOf(blockExercise.blocks as { day_id: string } | { day_id: string }[])?.day_id
  if (beDayId !== dayId) throw new NotFoundError()
}

/**
 * El log del día, creándolo si falta.
 *
 * `upsert` y no select-después-insert: dos requests casi simultáneos del mismo
 * jugador (dos inputs con autosave venciendo juntos) chocarían con el UNIQUE
 * (player_id, day_id). El upsert es atómico e idempotente.
 *
 * Bumpear updated_at es correcto acá: solo se llama desde escrituras.
 */
export async function ensureSessionLog(
  db: SupabaseClient<Database>,
  playerId: string,
  dayId: string,
): Promise<SessionLog> {
  const { data, error } = await db
    .from('session_logs')
    .upsert({ player_id: playerId, day_id: dayId }, { onConflict: 'player_id,day_id' })
    .select('id, completed_at')
    .maybeSingle()

  return assertRow(data, error) as SessionLog
}
