import { z } from 'zod'
import { isPositionId } from '../domain/positions'

/**
 * Lo que el coach (o el jugador en F3) puede editar del perfil.
 *
 * NO incluye role, coach_id, email ni invite_code a propósito: el perfil vive en
 * la misma tabla que el rol, y un update armado con spread del body sería una
 * escalada de privilegios. Zod los descarta (no hay .passthrough()), el trigger
 * guard_profile_changes los frena en la base, y la ruta escribe campo por campo
 * desde el objeto ya validado. Tres capas para la misma cosa (CLAUDE.md §4).
 */
export const playerProfileSchema = z.object({
  positionId: z.string().refine(isPositionId, 'Puesto inválido').nullish(),
  heightCm: z.number().int().min(100, 'Muy poco').max(250, 'Demasiado').nullish(),
  weightKg: z.number().min(30, 'Muy poco').max(250, 'Demasiado').nullish(),
})

export type PlayerProfileInput = z.infer<typeof playerProfileSchema>

export const oneRmSchema = z.object({
  exerciseId: z.string().uuid('Elegí un ejercicio'),
  kg: z.number().positive('Tiene que ser mayor a 0').max(500),
})

export type OneRmInput = z.infer<typeof oneRmSchema>
