import { z } from 'zod'
import { POSITIONS, isPositionId } from '../domain/positions'

export const positionGroupSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60),
  positionIds: z
    .array(z.string().refine(isPositionId, 'Puesto inválido'))
    .min(1, 'Elegí al menos un puesto')
    .max(POSITIONS.length)
    .refine((ids) => new Set(ids).size === ids.length, 'Hay puestos repetidos'),
})

export type PositionGroupInput = z.infer<typeof positionGroupSchema>
